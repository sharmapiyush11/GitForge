const fs = require("fs").promises;
const path = require("path");
const {
  sha256,
  normalizeFiles,
  computeCommitHash,
  diffTrees,
  threeWayMerge,
} = require("../vcs/engine");
const {
  resolveRepoDir,
  readJson,
  writeJson,
  collectWorkspaceFiles,
} = require("./vcsStorage");

async function loadCommit(repoPath, hash) {
  if (!hash) return null;
  return readJson(path.join(repoPath, "commits", hash, "commit.json"), null);
}

async function loadAllCommitsMap(repoPath) {
  const commitsPath = path.join(repoPath, "commits");
  const dirs = await fs.readdir(commitsPath).catch(() => []);
  const map = new Map();
  for (const dir of dirs) {
    const commit = await loadCommit(repoPath, dir);
    if (commit) map.set(commit.hash, commit);
  }
  return map;
}

function findLCA(commitMap, hashA, hashB) {
  if (!hashA || !hashB) return null;
  const ancA = new Map();
  const qA = [{ hash: hashA, d: 0 }];
  while (qA.length) {
    const { hash, d } = qA.shift();
    if (!hash || ancA.has(hash)) continue;
    ancA.set(hash, d);
    const c = commitMap.get(hash);
    for (const p of c?.parents || []) qA.push({ hash: p, d: d + 1 });
  }
  let best = null;
  let bestDist = Infinity;
  const seenB = new Set();
  const qB = [{ hash: hashB, d: 0 }];
  while (qB.length) {
    const { hash, d } = qB.shift();
    if (!hash || seenB.has(hash)) continue;
    seenB.add(hash);
    if (ancA.has(hash) && ancA.get(hash) + d < bestDist) {
      bestDist = ancA.get(hash) + d;
      best = commitMap.get(hash);
    }
    const c = commitMap.get(hash);
    for (const p of c?.parents || []) qB.push({ hash: p, d: d + 1 });
  }
  return best;
}

async function statusRepo(cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const head = (await readJson(path.join(repoPath, "HEAD.json"), {
    branch: "main",
  })) || { branch: "main" };
  const branchMeta = (await readJson(
    path.join(repoPath, "branches", `${head.branch}.json`),
    { name: head.branch, headHash: null }
  )) || { name: head.branch, headHash: null };
  const staged =
    (await readJson(path.join(repoPath, "staging", "index.json"), [])) || [];
  const headCommit = await loadCommit(repoPath, branchMeta.headHash);
  const working = (await collectWorkspaceFiles(cwd)).map((f) => ({
    ...f,
    sha256: sha256(f.content),
  }));

  const workingDiff = diffTrees(headCommit?.files || [], working);
  console.log(`On branch ${head.branch}`);
  console.log(`Staged files: ${staged.length}`);
  for (const ch of workingDiff.changes) {
    console.log(
      `  ${ch.status.toUpperCase().padEnd(8)} ${ch.path} (+${ch.diff.additions}/-${ch.diff.deletions})`
    );
  }
  return { branch: head.branch, staged, changes: workingDiff.changes };
}

async function logRepo(cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const commitMap = await loadAllCommitsMap(repoPath);
  const commits = Array.from(commitMap.values()).sort((a, b) =>
    (b.timestamp || "").localeCompare(a.timestamp || "")
  );
  for (const c of commits) {
    console.log(`${c.hash.slice(0, 7)} [${c.branch}] ${c.message}`);
  }
  return commits;
}

async function branchRepo(branchName, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const branchesDir = path.join(repoPath, "branches");
  const head = (await readJson(path.join(repoPath, "HEAD.json"), {
    branch: "main",
  })) || { branch: "main" };

  if (!branchName) {
    const files = await fs.readdir(branchesDir);
    const names = files.map((f) => f.replace(/\.json$/, ""));
    for (const n of names) {
      console.log(`${n === head.branch ? "*" : " "} ${n}`);
    }
    return names;
  }

  const currentMeta = await readJson(
    path.join(branchesDir, `${head.branch}.json`),
    { name: head.branch, headHash: null }
  );
  const targetFile = path.join(branchesDir, `${branchName}.json`);
  await writeJson(targetFile, {
    name: branchName,
    headHash: currentMeta?.headHash || null,
  });
  console.log(`Branch '${branchName}' created.`);
  return branchName;
}

async function checkoutRepo(branchName, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const targetMeta = await readJson(
    path.join(repoPath, "branches", `${branchName}.json`),
    null
  );
  if (!targetMeta) {
    throw new Error(`Branch '${branchName}' does not exist.`);
  }

  const commit = await loadCommit(repoPath, targetMeta.headHash);
  if (commit?.files) {
    for (const file of commit.files) {
      const dest = path.resolve(cwd, file.path);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, file.content, "utf8");
    }
  }
  await writeJson(path.join(repoPath, "HEAD.json"), { branch: branchName });
  console.log(`Switched to branch '${branchName}'`);
  return branchName;
}

async function mergeRepo(sourceBranch, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const head = (await readJson(path.join(repoPath, "HEAD.json"), {
    branch: "main",
  })) || { branch: "main" };

  if (head.branch === sourceBranch) {
    throw new Error("Cannot merge a branch into itself.");
  }

  const targetMeta = await readJson(
    path.join(repoPath, "branches", `${head.branch}.json`),
    null
  );
  const sourceMeta = await readJson(
    path.join(repoPath, "branches", `${sourceBranch}.json`),
    null
  );
  if (!sourceMeta) {
    throw new Error(`Branch '${sourceBranch}' does not exist.`);
  }

  const commitMap = await loadAllCommitsMap(repoPath);
  const targetCommit = commitMap.get(targetMeta?.headHash);
  const sourceCommit = commitMap.get(sourceMeta?.headHash);
  const lcaCommit = findLCA(
    commitMap,
    targetMeta?.headHash,
    sourceMeta?.headHash
  );

  const result = threeWayMerge({
    baseFiles: lcaCommit?.files || [],
    oursFiles: targetCommit?.files || [],
    theirsFiles: sourceCommit?.files || [],
    oursLabel: head.branch,
    theirsLabel: sourceBranch,
  });

  for (const file of result.mergedFiles) {
    const dest = path.resolve(cwd, file.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, file.content, "utf8");
  }

  if (result.hasConflicts) {
    console.log(
      `CONFLICT in ${result.conflicts.length} file(s): ${result.conflicts
        .map((c) => c.path)
        .join(", ")}`
    );
    return { status: "conflict", conflicts: result.conflicts };
  }

  const timestamp = new Date().toISOString();
  const message = `Merge branch '${sourceBranch}' into ${head.branch}`;
  const parents = [targetMeta?.headHash, sourceMeta?.headHash].filter(Boolean);
  const mergeHash = computeCommitHash({
    branch: head.branch,
    parents,
    message,
    timestamp,
    files: result.mergedFiles,
  });

  const commitRecord = {
    hash: mergeHash,
    shortHash: mergeHash.slice(0, 7),
    branch: head.branch,
    parents,
    message,
    timestamp,
    files: normalizeFiles(result.mergedFiles),
  };

  await writeJson(
    path.join(repoPath, "commits", mergeHash, "commit.json"),
    commitRecord
  );
  await writeJson(path.join(repoPath, "branches", `${head.branch}.json`), {
    name: head.branch,
    headHash: mergeHash,
  });
  console.log(`Merged '${sourceBranch}' into '${head.branch}' (${mergeHash.slice(0, 7)})`);
  return { status: "merged", commit: commitRecord };
}

module.exports = {
  statusRepo,
  logRepo,
  branchRepo,
  checkoutRepo,
  mergeRepo,
};
