const fs = require("fs").promises;
const path = require("path");
const { sha256, normalizeFiles } = require("../vcs/engine");
const {
  resolveRepoDir,
  readJson,
  writeJson,
  collectWorkspaceFiles,
} = require("./vcsStorage");

async function addRepo(fileArg, cwd = process.cwd()) {
  const repoPath = await resolveRepoDir(cwd);
  const stagingDir = path.join(repoPath, "staging");
  const indexFile = path.join(stagingDir, "index.json");

  try {
    await fs.mkdir(stagingDir, { recursive: true });
    const existingIndex = (await readJson(indexFile, [])) || [];
    const stagedMap = new Map(existingIndex.map((f) => [f.path, f]));

    if (fileArg === "." || fileArg === "--all") {
      const files = await collectWorkspaceFiles(cwd);
      for (const file of files) {
        stagedMap.set(file.path, {
          path: file.path,
          content: file.content,
          sha256: sha256(file.content),
        });
      }
      const next = normalizeFiles(Array.from(stagedMap.values()));
      await writeJson(indexFile, next);
      console.log(`Staged ${files.length} file(s) with SHA-256 hashes.`);
      return next;
    }

    const fullPath = path.resolve(cwd, fileArg);
    const relPath = path.relative(cwd, fullPath).replace(/\\/g, "/");
    const content = await fs.readFile(fullPath, "utf8");
    const hash = sha256(content);

    stagedMap.set(relPath, { path: relPath, content, sha256: hash });
    const next = normalizeFiles(Array.from(stagedMap.values()));
    await writeJson(indexFile, next);

    // Keep legacy copy for compatibility
    await fs.copyFile(fullPath, path.join(stagingDir, path.basename(fullPath)));
    console.log(`Staged '${relPath}' (sha256: ${hash.slice(0, 12)}...)`);
    return next;
  } catch (err) {
    console.error("Error adding file:", err.message);
    throw err;
  }
}

module.exports = { addRepo };
