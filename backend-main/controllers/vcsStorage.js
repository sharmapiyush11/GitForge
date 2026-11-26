const fs = require("fs").promises;
const path = require("path");

const REPO_DIR = ".gitforge";
const LEGACY_DIR = ".apnaGit";

async function resolveRepoDir(cwd = process.cwd()) {
  const primary = path.resolve(cwd, REPO_DIR);
  try {
    await fs.access(primary);
    return primary;
  } catch {
    const legacy = path.resolve(cwd, LEGACY_DIR);
    try {
      await fs.access(legacy);
      return legacy;
    } catch {
      return primary;
    }
  }
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function collectWorkspaceFiles(cwd = process.cwd()) {
  const results = [];
  const ignored = new Set([
    ".git",
    REPO_DIR,
    LEGACY_DIR,
    "node_modules",
    ".env",
    "dist",
    "build",
  ]);

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const rel = path.relative(cwd, fullPath).replace(/\\/g, "/");
        const content = await fs.readFile(fullPath, "utf8");
        results.push({ path: rel, content });
      }
    }
  }

  await walk(cwd);
  return results;
}

module.exports = {
  REPO_DIR,
  LEGACY_DIR,
  resolveRepoDir,
  readJson,
  writeJson,
  collectWorkspaceFiles,
};
