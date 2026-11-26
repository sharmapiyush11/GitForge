const fs = require("fs").promises;
const path = require("path");
const { REPO_DIR, writeJson } = require("./vcsStorage");

async function initRepo(cwd = process.cwd()) {
  const repoPath = path.resolve(cwd, REPO_DIR);
  const commitsPath = path.join(repoPath, "commits");
  const stagingPath = path.join(repoPath, "staging");
  const branchesPath = path.join(repoPath, "branches");

  try {
    await fs.mkdir(commitsPath, { recursive: true });
    await fs.mkdir(stagingPath, { recursive: true });
    await fs.mkdir(branchesPath, { recursive: true });

    await writeJson(path.join(repoPath, "HEAD.json"), { branch: "main" });
    await writeJson(path.join(branchesPath, "main.json"), {
      name: "main",
      headHash: null,
    });
    await writeJson(path.join(stagingPath, "index.json"), []);
    await writeJson(path.join(repoPath, "config.json"), {
      remoteUrl: process.env.GITFORGE_REMOTE_URL || "http://localhost:3002/api",
      bucket: process.env.S3_BUCKET || null,
      initializedAt: new Date().toISOString(),
    });

    console.log(`GitForge repository initialized at ${repoPath}`);
    return repoPath;
  } catch (err) {
    console.error("Error initialising repository:", err.message);
    throw err;
  }
}

module.exports = { initRepo };
