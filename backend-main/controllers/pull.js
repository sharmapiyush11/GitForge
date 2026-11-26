const fs = require("fs").promises;
const path = require("path");
const { s3, S3_BUCKET, isS3Configured } = require("../config/aws-config");
const { resolveRepoDir, readJson, writeJson } = require("./vcsStorage");

async function pullRepo(repoId, branch, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const commitsPath = path.join(repoPath, "commits");

  try {
    if (repoId) {
      const config = (await readJson(path.join(repoPath, "config.json"), {})) || {};
      const baseUrl =
        config.remoteUrl ||
        process.env.GITFORGE_REMOTE_URL ||
        "http://localhost:3002/api";

      const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
      const res = await fetch(`${baseUrl}/repo/${repoId}/pull${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remote pull failed");

      for (const c of data.commits || []) {
        await writeJson(path.join(commitsPath, c.hash, "commit.json"), c);
      }
      for (const f of data.files || []) {
        const target = path.resolve(cwd, f.path);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, f.content, "utf8");
      }
      await writeJson(path.join(repoPath, "HEAD.json"), {
        branch: data.branch,
      });
      await writeJson(path.join(repoPath, "branches", `${data.branch}.json`), {
        name: data.branch,
        headHash: data.headHash,
      });
      console.log(
        `Pulled ${(data.commits || []).length} commit(s) from '${data.branch}'.`
      );
      return data;
    }

    if (isS3Configured()) {
      const data = await s3
        .listObjectsV2({ Bucket: S3_BUCKET, Prefix: "commits/" })
        .promise();
      for (const object of data.Contents || []) {
        const key = object.Key;
        const target = path.join(repoPath, key);
        await fs.mkdir(path.dirname(target), { recursive: true });
        const fileContent = await s3
          .getObject({ Bucket: S3_BUCKET, Key: key })
          .promise();
        await fs.writeFile(target, fileContent.Body);
      }
      console.log("All commits pulled from AWS S3.");
      return { storage: "s3" };
    }

    const head = (await readJson(path.join(repoPath, "HEAD.json"), {
      branch: "main",
    })) || { branch: "main" };
    const localRemote = path.join(
      repoPath,
      "remote",
      branch || head.branch,
      "commits.json"
    );
    const commits = (await readJson(localRemote, [])) || [];
    console.log(`Pulled ${commits.length} commit(s) from local remote.`);
    return { storage: "local-remote", commits };
  } catch (err) {
    console.error("Unable to pull:", err.message);
    throw err;
  }
}

module.exports = { pullRepo };
