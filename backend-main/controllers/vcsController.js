const { Commit, User } = require("../db/models");
const {
  sha256,
  normalizeFiles,
  toFileMap,
  computeCommitHash,
  diffTrees,
  threeWayMerge,
  verifyIntegrity,
} = require("../vcs/engine");

function getBranchEntry(repo, branchName) {
  return repo.branches.find((b) => b.name === branchName);
}

async function getBranchHeadCommit(repo, branchName) {
  const entry = getBranchEntry(repo, branchName);
  if (!entry || !entry.headHash) return null;
  return Commit.findOne({ repository: repo._id, hash: entry.headHash }).lean();
}

function buildAncestorSet(commitMap, startHash) {
  const distances = new Map();
  if (!startHash) return distances;
  const queue = [{ hash: startHash, dist: 0 }];
  while (queue.length > 0) {
    const { hash, dist } = queue.shift();
    if (!hash || distances.has(hash)) continue;
    distances.set(hash, dist);
    const commit = commitMap.get(hash);
    if (commit && Array.isArray(commit.parents)) {
      for (const p of commit.parents) {
        if (!distances.has(p)) {
          queue.push({ hash: p, dist: dist + 1 });
        }
      }
    }
  }
  return distances;
}

function findLowestCommonAncestor(allCommits, hashA, hashB) {
  if (!hashA || !hashB) return null;
  const commitMap = new Map(allCommits.map((c) => [c.hash, c]));
  const ancestorsA = buildAncestorSet(commitMap, hashA);
  const ancestorsB = buildAncestorSet(commitMap, hashB);

  let bestHash = null;
  let bestScore = Infinity;
  for (const [hash, distA] of ancestorsA.entries()) {
    if (ancestorsB.has(hash)) {
      const score = distA + ancestorsB.get(hash);
      if (score < bestScore) {
        bestScore = score;
        bestHash = hash;
      }
    }
  }
  return bestHash ? commitMap.get(bestHash) : null;
}

function emitRepoUpdate(req, repoId, eventPayload) {
  const io = req.app.get("io");
  if (io) {
    io.emit("repoUpdated", { repoId: String(repoId), ...eventPayload });
  }
}

async function getVcsStatus(req, res) {
  try {
    const repo = req.repository;
    const headCommit = await getBranchHeadCommit(repo, repo.currentBranch);
    const headFiles = headCommit ? headCommit.files : [];
    const workingFiles = normalizeFiles(repo.workingFiles || []);

    const workingVsHead = diffTrees(headFiles, workingFiles);
    const stagedMap = new Map(
      (repo.stagedFiles || []).map((f) => [f.path, f])
    );

    const unstagedChanges = workingVsHead.changes.filter((change) => {
      const staged = stagedMap.get(change.path);
      if (!staged) return true;
      if (change.status === "deleted" && staged.status === "deleted") return false;
      return staged.sha256 !== change.newHash;
    });

    const integrity = verifyIntegrity(workingFiles, headCommit);

    res.json({
      currentBranch: repo.currentBranch,
      defaultBranch: repo.defaultBranch,
      branches: repo.branches,
      headCommit: headCommit
        ? {
            hash: headCommit.hash,
            shortHash: headCommit.shortHash,
            message: headCommit.message,
            timestamp: headCommit.timestamp,
            authorName: headCommit.authorName,
          }
        : null,
      workingFiles,
      stagedFiles: repo.stagedFiles || [],
      unstagedChanges,
      workingSummary: workingVsHead.summary,
      pendingMerge: repo.pendingMerge || null,
      integrity,
    });
  } catch (err) {
    console.error("Error getting VCS status:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function upsertWorkingFile(req, res) {
  const { path: filePath, content = "" } = req.body;
  if (!filePath || !filePath.trim()) {
    return res.status(400).json({ error: "File path is required" });
  }

  try {
    const repo = req.repository;
    const cleanPath = filePath.trim().replace(/^\/+/, "");
    const hash = sha256(content);
    const idx = repo.workingFiles.findIndex((f) => f.path === cleanPath);

    if (idx >= 0) {
      repo.workingFiles[idx].content = String(content);
      repo.workingFiles[idx].sha256 = hash;
    } else {
      repo.workingFiles.push({
        path: cleanPath,
        content: String(content),
        sha256: hash,
      });
    }

    repo.content = repo.workingFiles.map((f) => f.path);
    await repo.save();

    res.json({
      message: "File saved in working tree",
      file: { path: cleanPath, content: String(content), sha256: hash },
    });
  } catch (err) {
    console.error("Error saving working file:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function deleteWorkingFile(req, res) {
  const filePath = req.body?.path || req.query?.path;
  if (!filePath) {
    return res.status(400).json({ error: "File path is required" });
  }

  try {
    const repo = req.repository;
    repo.workingFiles = repo.workingFiles.filter((f) => f.path !== filePath);
    repo.content = repo.workingFiles.map((f) => f.path);
    await repo.save();

    res.json({ message: `Removed ${filePath} from working tree` });
  } catch (err) {
    console.error("Error deleting working file:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function stageFiles(req, res) {
  const { paths, stageAll = false } = req.body || {};
  try {
    const repo = req.repository;
    const headCommit = await getBranchHeadCommit(repo, repo.currentBranch);
    const headFiles = headCommit ? headCommit.files : [];
    const workingFiles = normalizeFiles(repo.workingFiles || []);
    const { changes } = diffTrees(headFiles, workingFiles);

    const targetChanges =
      stageAll || !Array.isArray(paths) || paths.length === 0
        ? changes
        : changes.filter((c) => paths.includes(c.path));

    const workingMap = toFileMap(workingFiles);
    const stagedMap = new Map(
      (repo.stagedFiles || []).map((s) => [s.path, s])
    );

    for (const change of targetChanges) {
      if (change.status === "deleted") {
        stagedMap.set(change.path, {
          path: change.path,
          content: "",
          sha256: null,
          status: "deleted",
        });
      } else {
        const wf = workingMap.get(change.path);
        if (wf) {
          stagedMap.set(change.path, {
            path: wf.path,
            content: wf.content,
            sha256: wf.sha256,
            status: change.status,
          });
        }
      }
    }

    // Remove staged entries that match HEAD again
    const headMap = toFileMap(headFiles);
    const finalStaged = [];
    for (const entry of stagedMap.values()) {
      const headFile = headMap.get(entry.path);
      if (entry.status === "deleted" && !headFile) continue;
      if (headFile && entry.status !== "deleted" && headFile.sha256 === entry.sha256) {
        continue;
      }
      finalStaged.push(entry);
    }

    repo.stagedFiles = finalStaged;
    await repo.save();

    res.json({
      message: `Staged ${targetChanges.length} change(s)`,
      stagedFiles: repo.stagedFiles,
    });
  } catch (err) {
    console.error("Error staging files:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function unstageFiles(req, res) {
  const { paths } = req.body || {};
  try {
    const repo = req.repository;
    if (!Array.isArray(paths) || paths.length === 0) {
      repo.stagedFiles = [];
    } else {
      repo.stagedFiles = repo.stagedFiles.filter(
        (s) => !paths.includes(s.path)
      );
    }
    await repo.save();
    res.json({ message: "Files unstaged", stagedFiles: repo.stagedFiles });
  } catch (err) {
    console.error("Error unstaging files:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function commitChanges(req, res) {
  const { message, autoStage = false } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Commit message is required" });
  }

  try {
    const repo = req.repository;
    if (repo.pendingMerge) {
      return res.status(409).json({
        error: "Resolve pending merge conflicts before creating a regular commit.",
      });
    }

    const headCommit = await getBranchHeadCommit(repo, repo.currentBranch);
    const baseFiles = headCommit ? headCommit.files : [];
    const workingFiles = normalizeFiles(repo.workingFiles || []);

    let nextFilesMap = toFileMap(baseFiles);
    if (autoStage && (!repo.stagedFiles || repo.stagedFiles.length === 0)) {
      nextFilesMap = toFileMap(workingFiles);
    } else {
      if (!repo.stagedFiles || repo.stagedFiles.length === 0) {
        return res
          .status(400)
          .json({ error: "No staged changes to commit. Stage files first." });
      }
      for (const staged of repo.stagedFiles) {
        if (staged.status === "deleted") {
          nextFilesMap.delete(staged.path);
        } else {
          nextFilesMap.set(staged.path, {
            path: staged.path,
            content: staged.content,
            sha256: staged.sha256 || sha256(staged.content),
          });
        }
      }
    }

    const committedFiles = normalizeFiles(Array.from(nextFilesMap.values()));
    const { changes, summary } = diffTrees(baseFiles, committedFiles);
    if (changes.length === 0) {
      return res.status(400).json({ error: "Working tree matches HEAD; nothing to commit." });
    }

    const user = await User.findById(req.userId).select("username");
    const timestamp = new Date().toISOString();
    const parents = headCommit ? [headCommit.hash] : [];
    const hash = computeCommitHash({
      branch: repo.currentBranch,
      parents,
      message: message.trim(),
      timestamp,
      files: committedFiles,
    });

    const commit = await Commit.create({
      hash,
      shortHash: hash.slice(0, 7),
      repository: repo._id,
      author: req.userId,
      authorName: user?.username || "Developer",
      branch: repo.currentBranch,
      parents,
      message: message.trim(),
      type: "commit",
      timestamp,
      files: committedFiles,
      changes: changes.map((c) => ({
        path: c.path,
        status: c.status,
        oldHash: c.oldHash,
        newHash: c.newHash,
        additions: c.diff.additions,
        deletions: c.diff.deletions,
      })),
      stats: {
        added: summary.added,
        modified: summary.modified,
        deleted: summary.deleted,
        additions: summary.additions,
        deletions: summary.deletions,
      },
    });

    const branchEntry = getBranchEntry(repo, repo.currentBranch);
    if (branchEntry) {
      branchEntry.headHash = hash;
    } else {
      repo.branches.push({ name: repo.currentBranch, headHash: hash });
    }
    repo.stagedFiles = [];
    if (autoStage) {
      repo.workingFiles = committedFiles;
    }
    await repo.save();

    emitRepoUpdate(req, repo._id, {
      action: "commit",
      branch: repo.currentBranch,
      hash,
    });

    res.status(201).json({
      message: "Commit created",
      commit,
    });
  } catch (err) {
    console.error("Error committing changes:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function getCommits(req, res) {
  const { branch } = req.query;
  try {
    const repo = req.repository;
    const filter = { repository: repo._id };
    if (branch) filter.branch = branch;

    const commits = await Commit.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json({ commits, currentBranch: repo.currentBranch });
  } catch (err) {
    console.error("Error fetching commits:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function getCommitDetail(req, res) {
  const { hash } = req.params;
  try {
    const repo = req.repository;
    const commit = await Commit.findOne({
      repository: repo._id,
      $or: [{ hash }, { shortHash: hash }],
    }).lean();

    if (!commit) {
      return res.status(404).json({ error: "Commit not found" });
    }

    let parentFiles = [];
    if (commit.parents && commit.parents.length > 0) {
      const parentCommit = await Commit.findOne({
        repository: repo._id,
        hash: commit.parents[0],
      }).lean();
      if (parentCommit) parentFiles = parentCommit.files || [];
    }

    const diff = diffTrees(parentFiles, commit.files || []);
    const integrity = verifyIntegrity(commit.files || [], commit);

    res.json({
      commit,
      diff,
      integrity,
    });
  } catch (err) {
    console.error("Error fetching commit detail:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function compareDiff(req, res) {
  const { base, target } = req.query;
  try {
    const repo = req.repository;

    const resolveFiles = async (ref) => {
      if (!ref || ref === "WORKING") {
        return { label: "Working Tree", files: repo.workingFiles || [] };
      }
      const branch = getBranchEntry(repo, ref);
      const targetHash = branch ? branch.headHash : ref;
      if (!targetHash) return { label: ref, files: [] };
      const commit = await Commit.findOne({
        repository: repo._id,
        $or: [{ hash: targetHash }, { shortHash: targetHash }],
      }).lean();
      return {
        label: branch ? `${ref} (${commit?.shortHash || "empty"})` : ref,
        files: commit?.files || [],
      };
    };

    const [baseSnap, targetSnap] = await Promise.all([
      resolveFiles(base || repo.currentBranch),
      resolveFiles(target || "WORKING"),
    ]);

    const diff = diffTrees(baseSnap.files, targetSnap.files);
    res.json({
      base: baseSnap.label,
      target: targetSnap.label,
      ...diff,
    });
  } catch (err) {
    console.error("Error comparing diff:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function createBranch(req, res) {
  const { name, fromBranch } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Branch name is required" });
  }

  try {
    const repo = req.repository;
    const cleanName = name.trim().replace(/\s+/g, "-");
    if (getBranchEntry(repo, cleanName)) {
      return res.status(400).json({ error: `Branch '${cleanName}' already exists` });
    }

    const source = getBranchEntry(repo, fromBranch || repo.currentBranch);
    repo.branches.push({
      name: cleanName,
      headHash: source ? source.headHash : null,
    });
    await repo.save();

    res.status(201).json({
      message: `Branch '${cleanName}' created`,
      branches: repo.branches,
      currentBranch: repo.currentBranch,
    });
  } catch (err) {
    console.error("Error creating branch:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function checkoutBranch(req, res) {
  const { branch } = req.body || {};
  if (!branch) {
    return res.status(400).json({ error: "Branch name is required" });
  }

  try {
    const repo = req.repository;
    if (repo.pendingMerge) {
      return res.status(409).json({
        error: "Cannot switch branches while a merge conflict is unresolved.",
      });
    }

    const targetBranch = getBranchEntry(repo, branch);
    if (!targetBranch) {
      return res.status(404).json({ error: `Branch '${branch}' not found` });
    }

    const targetCommit = targetBranch.headHash
      ? await Commit.findOne({
          repository: repo._id,
          hash: targetBranch.headHash,
        }).lean()
      : null;

    repo.currentBranch = branch;
    repo.workingFiles = normalizeFiles(targetCommit?.files || []);
    repo.stagedFiles = [];
    repo.content = repo.workingFiles.map((f) => f.path);
    await repo.save();

    res.json({
      message: `Switched to branch '${branch}'`,
      currentBranch: repo.currentBranch,
      workingFiles: repo.workingFiles,
      headHash: targetBranch.headHash,
    });
  } catch (err) {
    console.error("Error checking out branch:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function mergeBranch(req, res) {
  const { sourceBranch } = req.body || {};
  if (!sourceBranch) {
    return res.status(400).json({ error: "sourceBranch is required" });
  }

  try {
    const repo = req.repository;
    if (repo.pendingMerge) {
      return res.status(409).json({
        error: "A merge is already in progress. Resolve or abort it first.",
      });
    }
    if (sourceBranch === repo.currentBranch) {
      return res
        .status(400)
        .json({ error: "Cannot merge a branch into itself." });
    }

    const targetEntry = getBranchEntry(repo, repo.currentBranch);
    const sourceEntry = getBranchEntry(repo, sourceBranch);
    if (!sourceEntry) {
      return res
        .status(404)
        .json({ error: `Source branch '${sourceBranch}' not found` });
    }
    if (!sourceEntry.headHash) {
      return res.status(200).json({
        status: "up-to-date",
        message: `Branch '${sourceBranch}' has no commits.`,
      });
    }

    const allCommits = await Commit.find({ repository: repo._id }).lean();
    const commitMap = new Map(allCommits.map((c) => [c.hash, c]));

    const targetHash = targetEntry?.headHash || null;
    const sourceHash = sourceEntry.headHash;

    if (targetHash === sourceHash) {
      return res.json({
        status: "up-to-date",
        message: "Already up to date.",
      });
    }

    const targetAncestors = buildAncestorSet(commitMap, targetHash);
    if (targetAncestors.has(sourceHash)) {
      return res.json({
        status: "up-to-date",
        message: `Branch '${repo.currentBranch}' already contains '${sourceBranch}'.`,
      });
    }

    const sourceAncestors = buildAncestorSet(commitMap, sourceHash);
    const sourceCommit = commitMap.get(sourceHash);
    const targetCommit = targetHash ? commitMap.get(targetHash) : null;

    // Fast-forward merge if targetHead is an ancestor of sourceHead (or target is empty)
    if (!targetHash || sourceAncestors.has(targetHash)) {
      const mergedFiles = normalizeFiles(sourceCommit?.files || []);
      targetEntry.headHash = sourceHash;
      repo.workingFiles = mergedFiles;
      repo.stagedFiles = [];
      repo.content = mergedFiles.map((f) => f.path);
      await repo.save();

      emitRepoUpdate(req, repo._id, {
        action: "merge",
        type: "fast-forward",
        branch: repo.currentBranch,
      });

      return res.json({
        status: "fast-forward",
        message: `Fast-forwarded '${repo.currentBranch}' to '${sourceBranch}' (${sourceCommit.shortHash}).`,
        headHash: sourceHash,
        workingFiles: mergedFiles,
      });
    }

    const lcaCommit = findLowestCommonAncestor(
      allCommits,
      targetHash,
      sourceHash
    );
    const baseFiles = lcaCommit ? lcaCommit.files : [];
    const oursFiles = targetCommit ? targetCommit.files : [];
    const theirsFiles = sourceCommit ? sourceCommit.files : [];

    const mergeResult = threeWayMerge({
      baseFiles,
      oursFiles,
      theirsFiles,
      oursLabel: repo.currentBranch,
      theirsLabel: sourceBranch,
    });

    if (mergeResult.hasConflicts) {
      repo.workingFiles = mergeResult.mergedFiles;
      repo.stagedFiles = [];
      repo.pendingMerge = {
        sourceBranch,
        targetBranch: repo.currentBranch,
        baseHash: lcaCommit?.hash || null,
        sourceHash,
        targetHash,
        conflicts: mergeResult.conflicts,
      };
      await repo.save();

      return res.json({
        status: "conflict",
        message: `Merge conflict detected in ${mergeResult.conflicts.length} file(s).`,
        conflicts: mergeResult.conflicts,
        autoMerged: mergeResult.autoMerged,
        pendingMerge: repo.pendingMerge,
        workingFiles: repo.workingFiles,
      });
    }

    // Clean 3-way auto-merge -> create merge commit
    const user = await User.findById(req.userId).select("username");
    const timestamp = new Date().toISOString();
    const message = `Merge branch '${sourceBranch}' into ${repo.currentBranch}`;
    const parents = [targetHash, sourceHash];
    const mergeHash = computeCommitHash({
      branch: repo.currentBranch,
      parents,
      message,
      timestamp,
      files: mergeResult.mergedFiles,
    });

    const { changes, summary } = diffTrees(
      oursFiles,
      mergeResult.mergedFiles
    );

    const mergeCommit = await Commit.create({
      hash: mergeHash,
      shortHash: mergeHash.slice(0, 7),
      repository: repo._id,
      author: req.userId,
      authorName: user?.username || "Developer",
      branch: repo.currentBranch,
      parents,
      message,
      type: "merge",
      timestamp,
      files: mergeResult.mergedFiles,
      changes: changes.map((c) => ({
        path: c.path,
        status: c.status,
        oldHash: c.oldHash,
        newHash: c.newHash,
        additions: c.diff.additions,
        deletions: c.diff.deletions,
      })),
      stats: {
        added: summary.added,
        modified: summary.modified,
        deleted: summary.deleted,
        additions: summary.additions,
        deletions: summary.deletions,
      },
    });

    targetEntry.headHash = mergeHash;
    repo.workingFiles = mergeResult.mergedFiles;
    repo.stagedFiles = [];
    repo.content = mergeResult.mergedFiles.map((f) => f.path);
    await repo.save();

    emitRepoUpdate(req, repo._id, {
      action: "merge",
      type: "auto-merged",
      branch: repo.currentBranch,
      hash: mergeHash,
    });

    res.json({
      status: "merged",
      message: `Merged '${sourceBranch}' into '${repo.currentBranch}' cleanly.`,
      commit: mergeCommit,
      autoMerged: mergeResult.autoMerged,
      workingFiles: repo.workingFiles,
    });
  } catch (err) {
    console.error("Error merging branches:", err.message);
    res.status(500).json({ error: "Server error during merge" });
  }
}

async function resolveConflicts(req, res) {
  const { resolutions = [], message } = req.body || {};
  try {
    const repo = req.repository;
    if (!repo.pendingMerge) {
      return res.status(400).json({ error: "No pending merge to resolve." });
    }

    const workingMap = toFileMap(repo.workingFiles || []);
    for (const item of resolutions) {
      if (!item || !item.path) continue;
      if (item.deleteFile) {
        workingMap.delete(item.path);
      } else {
        const content = String(item.content ?? "");
        if (
          content.includes("<<<<<<<") &&
          content.includes("=======") &&
          content.includes(">>>>>>>")
        ) {
          return res.status(400).json({
            error: `File '${item.path}' still contains unresolved conflict markers.`,
          });
        }
        workingMap.set(item.path, {
          path: item.path,
          content,
          sha256: sha256(content),
        });
      }
    }

    // Verify no conflict markers remain across any conflicted files
    for (const c of repo.pendingMerge.conflicts || []) {
      const wf = workingMap.get(c.path);
      if (
        wf &&
        wf.content.includes("<<<<<<<") &&
        wf.content.includes("=======") &&
        wf.content.includes(">>>>>>>")
      ) {
        return res.status(400).json({
          error: `Conflict in '${c.path}' is still unresolved.`,
        });
      }
    }

    const finalFiles = normalizeFiles(Array.from(workingMap.values()));
    const { sourceBranch, targetBranch, sourceHash, targetHash } =
      repo.pendingMerge;

    const targetCommit = targetHash
      ? await Commit.findOne({ repository: repo._id, hash: targetHash }).lean()
      : null;

    const user = await User.findById(req.userId).select("username");
    const timestamp = new Date().toISOString();
    const commitMsg =
      message?.trim() ||
      `Merge branch '${sourceBranch}' into ${targetBranch} (conflicts resolved)`;
    const parents = [targetHash, sourceHash].filter(Boolean);
    const mergeHash = computeCommitHash({
      branch: targetBranch,
      parents,
      message: commitMsg,
      timestamp,
      files: finalFiles,
    });

    const { changes, summary } = diffTrees(
      targetCommit?.files || [],
      finalFiles
    );

    const mergeCommit = await Commit.create({
      hash: mergeHash,
      shortHash: mergeHash.slice(0, 7),
      repository: repo._id,
      author: req.userId,
      authorName: user?.username || "Developer",
      branch: targetBranch,
      parents,
      message: commitMsg,
      type: "merge",
      timestamp,
      files: finalFiles,
      changes: changes.map((c) => ({
        path: c.path,
        status: c.status,
        oldHash: c.oldHash,
        newHash: c.newHash,
        additions: c.diff.additions,
        deletions: c.diff.deletions,
      })),
      stats: {
        added: summary.added,
        modified: summary.modified,
        deleted: summary.deleted,
        additions: summary.additions,
        deletions: summary.deletions,
      },
    });

    const branchEntry = getBranchEntry(repo, targetBranch);
    if (branchEntry) branchEntry.headHash = mergeHash;
    repo.workingFiles = finalFiles;
    repo.stagedFiles = [];
    repo.pendingMerge = null;
    repo.content = finalFiles.map((f) => f.path);
    await repo.save();

    emitRepoUpdate(req, repo._id, {
      action: "merge-resolved",
      branch: targetBranch,
      hash: mergeHash,
    });

    res.json({
      message: "Conflicts resolved and merge commit created!",
      commit: mergeCommit,
      workingFiles: finalFiles,
    });
  } catch (err) {
    console.error("Error resolving merge conflicts:", err.message);
    res.status(500).json({ error: "Server error resolving conflicts" });
  }
}

async function abortMerge(req, res) {
  try {
    const repo = req.repository;
    if (!repo.pendingMerge) {
      return res.status(400).json({ error: "No merge in progress." });
    }
    const headCommit = await getBranchHeadCommit(repo, repo.currentBranch);
    repo.workingFiles = normalizeFiles(headCommit?.files || []);
    repo.stagedFiles = [];
    repo.pendingMerge = null;
    repo.content = repo.workingFiles.map((f) => f.path);
    await repo.save();

    res.json({
      message: "Merge aborted and working tree restored to HEAD.",
      workingFiles: repo.workingFiles,
    });
  } catch (err) {
    console.error("Error aborting merge:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

async function revertToCommit(req, res) {
  const { commitHash } = req.body || {};
  if (!commitHash) {
    return res.status(400).json({ error: "commitHash is required" });
  }

  try {
    const repo = req.repository;
    if (repo.pendingMerge) {
      return res
        .status(409)
        .json({ error: "Resolve or abort pending merge before reverting." });
    }

    const targetCommit = await Commit.findOne({
      repository: repo._id,
      $or: [{ hash: commitHash }, { shortHash: commitHash }],
    }).lean();

    if (!targetCommit) {
      return res.status(404).json({ error: "Target commit not found" });
    }

    const currentHead = await getBranchHeadCommit(repo, repo.currentBranch);
    const revertedFiles = normalizeFiles(targetCommit.files || []);
    const { changes, summary } = diffTrees(
      currentHead?.files || [],
      revertedFiles
    );

    const user = await User.findById(req.userId).select("username");
    const timestamp = new Date().toISOString();
    const message = `Revert to ${targetCommit.shortHash}: "${targetCommit.message}"`;
    const parents = currentHead ? [currentHead.hash] : [];
    const hash = computeCommitHash({
      branch: repo.currentBranch,
      parents,
      message,
      timestamp,
      files: revertedFiles,
    });

    const revertCommit = await Commit.create({
      hash,
      shortHash: hash.slice(0, 7),
      repository: repo._id,
      author: req.userId,
      authorName: user?.username || "Developer",
      branch: repo.currentBranch,
      parents,
      message,
      type: "revert",
      timestamp,
      files: revertedFiles,
      changes: changes.map((c) => ({
        path: c.path,
        status: c.status,
        oldHash: c.oldHash,
        newHash: c.newHash,
        additions: c.diff.additions,
        deletions: c.diff.deletions,
      })),
      stats: {
        added: summary.added,
        modified: summary.modified,
        deleted: summary.deleted,
        additions: summary.additions,
        deletions: summary.deletions,
      },
    });

    const branchEntry = getBranchEntry(repo, repo.currentBranch);
    if (branchEntry) branchEntry.headHash = hash;
    repo.workingFiles = revertedFiles;
    repo.stagedFiles = [];
    repo.content = revertedFiles.map((f) => f.path);
    await repo.save();

    emitRepoUpdate(req, repo._id, {
      action: "revert",
      branch: repo.currentBranch,
      hash,
    });

    res.json({
      message: `Reverted branch '${repo.currentBranch}' to ${targetCommit.shortHash}`,
      commit: revertCommit,
      workingFiles: revertedFiles,
    });
  } catch (err) {
    console.error("Error reverting commit:", err.message);
    res.status(500).json({ error: "Server error during revert" });
  }
}

async function pushRemote(req, res) {
  const { branch = "main", commits = [] } = req.body || {};
  try {
    const repo = req.repository;
    if (!Array.isArray(commits) || commits.length === 0) {
      return res.status(400).json({ error: "No commits supplied to push." });
    }

    const pushedHashes = [];
    let latestCommit = null;
    for (const c of commits) {
      const files = normalizeFiles(c.files || []);
      const timestamp = c.timestamp || c.date || new Date().toISOString();
      const parents = Array.isArray(c.parents) ? c.parents : [];
      const hash =
        c.hash ||
        computeCommitHash({
          branch: c.branch || branch,
          parents,
          message: c.message || "CLI push commit",
          timestamp,
          files,
        });

      const existing = await Commit.findOne({ repository: repo._id, hash });
      if (!existing) {
        const created = await Commit.create({
          hash,
          shortHash: hash.slice(0, 7),
          repository: repo._id,
          author: req.userId,
          authorName: c.authorName || "CLI User",
          branch: c.branch || branch,
          parents,
          message: c.message || "CLI push commit",
          type: "push",
          timestamp,
          files,
          changes: c.changes || [],
          stats: c.stats || {},
        });
        latestCommit = created;
      } else {
        latestCommit = existing;
      }
      pushedHashes.push(hash);
    }

    if (latestCommit) {
      let branchEntry = getBranchEntry(repo, branch);
      if (!branchEntry) {
        repo.branches.push({ name: branch, headHash: latestCommit.hash });
      } else {
        branchEntry.headHash = latestCommit.hash;
      }
      if (repo.currentBranch === branch) {
        repo.workingFiles = normalizeFiles(latestCommit.files || []);
        repo.content = repo.workingFiles.map((f) => f.path);
      }
      await repo.save();
    }

    emitRepoUpdate(req, repo._id, { action: "push", branch });

    res.json({
      message: `Pushed ${pushedHashes.length} commit(s) to '${branch}'.`,
      pushedHashes,
      branch,
    });
  } catch (err) {
    console.error("Error during remote push:", err.message);
    res.status(500).json({ error: "Server error during push" });
  }
}

async function pullRemote(req, res) {
  const { branch } = req.query;
  try {
    const repo = req.repository;
    const targetBranch = branch || repo.currentBranch;
    const commits = await Commit.find({
      repository: repo._id,
      branch: targetBranch,
    })
      .sort({ createdAt: 1 })
      .lean();

    const branchEntry = getBranchEntry(repo, targetBranch);
    const headCommit = branchEntry?.headHash
      ? commits.find((c) => c.hash === branchEntry.headHash) ||
        (await Commit.findOne({
          repository: repo._id,
          hash: branchEntry.headHash,
        }).lean())
      : null;

    res.json({
      repository: { id: repo._id, name: repo.name },
      branch: targetBranch,
      headHash: branchEntry?.headHash || null,
      commits,
      files: headCommit?.files || repo.workingFiles || [],
    });
  } catch (err) {
    console.error("Error during remote pull:", err.message);
    res.status(500).json({ error: "Server error during pull" });
  }
}

async function verifyRepoIntegrity(req, res) {
  try {
    const repo = req.repository;
    const commits = await Commit.find({ repository: repo._id }).lean();
    const workingCheck = verifyIntegrity(repo.workingFiles || []);

    const commitChecks = commits.map((c) => {
      const check = verifyIntegrity(c.files || [], c);
      return {
        hash: c.hash,
        shortHash: c.shortHash,
        branch: c.branch,
        message: c.message,
        valid: check.valid,
        commitHashValid: check.commitHashValid,
        fileCount: (c.files || []).length,
      };
    });

    const allValid =
      workingCheck.valid && commitChecks.every((c) => c.valid);

    res.json({
      valid: allValid,
      workingTree: workingCheck,
      commitsChecked: commitChecks.length,
      commits: commitChecks,
    });
  } catch (err) {
    console.error("Error verifying integrity:", err.message);
    res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  getVcsStatus,
  upsertWorkingFile,
  deleteWorkingFile,
  stageFiles,
  unstageFiles,
  commitChanges,
  getCommits,
  getCommitDetail,
  compareDiff,
  createBranch,
  checkoutBranch,
  mergeBranch,
  resolveConflicts,
  abortMerge,
  revertToCommit,
  pushRemote,
  pullRemote,
  verifyRepoIntegrity,
};
