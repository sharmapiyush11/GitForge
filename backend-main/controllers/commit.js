const fs = require("fs").promises;
const path = require("path");
const {
  computeCommitHash,
  normalizeFiles,
  diffTrees,
} = require("../vcs/engine");
const { resolveRepoDir, readJson, writeJson } = require("./vcsStorage");

async function commitRepo(message, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const stagingIndex = path.join(repoPath, "staging", "index.json");
  const commitsPath = path.join(repoPath, "commits");
  const headPath = path.join(repoPath, "HEAD.json");

  try {
    const staged = (await readJson(stagingIndex, [])) || [];
    if (staged.length === 0) {
      console.log("Nothing staged to commit. Run 'add <file|.>' first.");
      return null;
    }

    const head = (await readJson(headPath, { branch: "main" })) || {
      branch: "main",
    };
    const branchFile = path.join(repoPath, "branches", `${head.branch}.json`);
    const branchMeta = (await readJson(branchFile, {
      name: head.branch,
      headHash: null,
    })) || { name: head.branch, headHash: null };

    let parentFiles = [];
    const parents = [];
    if (branchMeta.headHash) {
      parents.push(branchMeta.headHash);
      const parentCommit = await readJson(
        path.join(commitsPath, branchMeta.headHash, "commit.json"),
        null
      );
      if (parentCommit?.files) parentFiles = parentCommit.files;
    }

    const files = normalizeFiles(staged);
    const timestamp = new Date().toISOString();
    const commitHash = computeCommitHash({
      branch: head.branch,
      parents,
      message,
      timestamp,
      files,
    });
    const { changes, summary } = diffTrees(parentFiles, files);

    const commitDir = path.join(commitsPath, commitHash);
    await fs.mkdir(commitDir, { recursive: true });

    const commitRecord = {
      hash: commitHash,
      shortHash: commitHash.slice(0, 7),
      branch: head.branch,
      parents,
      message,
      timestamp,
      files,
      changes: changes.map((c) => ({
        path: c.path,
        status: c.status,
        oldHash: c.oldHash,
        newHash: c.newHash,
      })),
      stats: summary,
    };

    await writeJson(path.join(commitDir, "commit.json"), commitRecord);
    for (const file of files) {
      const target = path.join(commitDir, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, "utf8");
    }

    branchMeta.headHash = commitHash;
    await writeJson(branchFile, branchMeta);
    await writeJson(stagingIndex, []);

    console.log(
      `[${head.branch} ${commitHash.slice(0, 7)}] ${message} (+${summary.additions}/-${summary.deletions})`
    );
    return commitRecord;
  } catch (err) {
    console.error("Error committing files:", err.message);
    throw err;
  }
}

module.exports = { commitRepo };
