const fs = require("fs").promises;
const path = require("path");
const { resolveRepoDir, readJson, writeJson } = require("./vcsStorage");

async function revertRepo(commitID, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const commitsPath = path.join(repoPath, "commits");

  try {
    const commitDirs = await fs.readdir(commitsPath);
    const matchedDir = commitDirs.find(
      (dir) => dir === commitID || dir.startsWith(commitID)
    );
    if (!matchedDir) {
      throw new Error(`Commit '${commitID}' not found`);
    }

    const commitJson = await readJson(
      path.join(commitsPath, matchedDir, "commit.json"),
      null
    );

    if (commitJson && Array.isArray(commitJson.files)) {
      for (const file of commitJson.files) {
        const dest = path.resolve(cwd, file.path);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, file.content, "utf8");
      }
    } else {
      const commitDir = path.join(commitsPath, matchedDir);
      const files = await fs.readdir(commitDir);
      for (const file of files) {
        if (file === "commit.json") continue;
        await fs.copyFile(path.join(commitDir, file), path.resolve(cwd, file));
      }
    }

    const head = (await readJson(path.join(repoPath, "HEAD.json"), {
      branch: "main",
    })) || { branch: "main" };
    await writeJson(path.join(repoPath, "branches", `${head.branch}.json`), {
      name: head.branch,
      headHash: matchedDir,
    });

    console.log(`Reverted working tree to commit ${matchedDir.slice(0, 7)}`);
    return matchedDir;
  } catch (err) {
    console.error("Unable to revert:", err.message);
    throw err;
  }
}

module.exports = { revertRepo };
