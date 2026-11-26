const fs = require("fs").promises;
const path = require("path");
const { s3, S3_BUCKET, isS3Configured } = require("../config/aws-config");
const { resolveRepoDir, readJson, writeJson } = require("./vcsStorage");

async function pushRepo(repoId, token, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const commitsPath = path.join(repoPath, "commits");
  const head = (await readJson(path.join(repoPath, "HEAD.json"), {
    branch: "main",
  })) || { branch: "main" };

  try {
    const commitDirs = await fs.readdir(commitsPath);
    const commits = [];
    for (const dir of commitDirs) {
      const meta = await readJson(path.join(commitsPath, dir, "commit.json"));
      if (meta) commits.push(meta);
    }

    if (repoId) {
      const config = (await readJson(path.join(repoPath, "config.json"), {})) || {};
      const baseUrl =
        config.remoteUrl ||
        process.env.GITFORGE_REMOTE_URL ||
        "http://localhost:3002/api";

      const headers = { "Content-Type": "application/json" };
      if (token || process.env.GITFORGE_TOKEN) {
        headers.Authorization = `Bearer ${token || process.env.GITFORGE_TOKEN}`;
      }

      const res = await fetch(`${baseUrl}/repo/${repoId}/push`, {
        method: "POST",
        headers,
        body: JSON.stringify({ branch: head.branch, commits }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remote push failed");
      console.log(data.message);
      return data;
    }

    if (isS3Configured()) {
      for (const commitDir of commitDirs) {
        const commitPath = path.join(commitsPath, commitDir);
        const files = await fs.readdir(commitPath);
        for (const file of files) {
          const full = path.join(commitPath, file);
          const stat = await fs.stat(full);
          if (!stat.isFile()) continue;
          const fileContent = await fs.readFile(full);
          await s3
            .upload({
              Bucket: S3_BUCKET,
              Key: `commits/${commitDir}/${file}`,
              Body: fileContent,
            })
            .promise();
        }
      }
      console.log("All commits pushed to AWS S3.");
      return { storage: "s3", count: commitDirs.length };
    }

    // Local remote fallback for offline/sandbox usage
    const localRemote = path.join(repoPath, "remote", head.branch);
    await writeJson(path.join(localRemote, "commits.json"), commits);
    console.log(
      `Pushed ${commits.length} commit(s) to local remote '${head.branch}' (pass repoId or configure S3 for cloud sync).`
    );
    return { storage: "local-remote", count: commits.length };
  } catch (err) {
    console.error("Error pushing commits:", err.message);
    throw err;
  }
}

module.exports = { pushRepo };
