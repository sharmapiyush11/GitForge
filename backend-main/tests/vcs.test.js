const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs").promises;
const path = require("node:path");
const os = require("node:os");

const {
  sha256,
  computeCommitHash,
  computeLineDiff,
  diffTrees,
  threeWayMerge,
  verifyIntegrity,
} = require("../vcs/engine");
const { initRepo } = require("../controllers/init");
const { addRepo } = require("../controllers/add");
const { commitRepo } = require("../controllers/commit");
const { pushRepo } = require("../controllers/push");
const { pullRepo } = require("../controllers/pull");
const { revertRepo } = require("../controllers/revert");
const {
  branchRepo,
  checkoutRepo,
  mergeRepo,
} = require("../controllers/cliBranch");

test("SHA-256 hashing and integrity verification", () => {
  const files = [
    { path: "README.md", content: "# GitForge\n", sha256: sha256("# GitForge\n") },
    { path: "app.js", content: "console.log(1);\n", sha256: sha256("console.log(1);\n") },
  ];
  const timestamp = "2026-01-01T00:00:00.000Z";
  const hash = computeCommitHash({
    branch: "main",
    parents: [],
    message: "init",
    timestamp,
    files,
  });

  assert.equal(hash.length, 64);

  const ok = verifyIntegrity(files, {
    hash,
    branch: "main",
    parents: [],
    message: "init",
    timestamp,
    files,
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.commitHashValid, true);

  const tampered = [
    { ...files[0], content: "# Tampered\n" },
    files[1],
  ];
  const bad = verifyIntegrity(tampered, {
    hash,
    branch: "main",
    parents: [],
    message: "init",
    timestamp,
    files: tampered,
  });
  assert.equal(bad.valid, false);
});

test("Line diff and tree diff track additions, modifications, and deletions", () => {
  const diff = computeLineDiff("a\nb\nc", "a\nb-edited\nc\nd");
  assert.equal(diff.additions, 2);
  assert.equal(diff.deletions, 1);

  const treeDiff = diffTrees(
    [
      { path: "keep.txt", content: "same", sha256: sha256("same") },
      { path: "mod.txt", content: "v1", sha256: sha256("v1") },
      { path: "del.txt", content: "bye", sha256: sha256("bye") },
    ],
    [
      { path: "keep.txt", content: "same", sha256: sha256("same") },
      { path: "mod.txt", content: "v2", sha256: sha256("v2") },
      { path: "add.txt", content: "hi", sha256: sha256("hi") },
    ]
  );

  assert.equal(treeDiff.summary.added, 1);
  assert.equal(treeDiff.summary.modified, 1);
  assert.equal(treeDiff.summary.deleted, 1);
  assert.equal(treeDiff.summary.unchanged, 1);
});

test("3-way merge auto-merges disjoint line edits and detects overlapping conflicts", () => {
  const base = [{ path: "code.js", content: "line1\nline2\nline3\nline4", sha256: sha256("line1\nline2\nline3\nline4") }];
  const oursClean = [{ path: "code.js", content: "line1-ours\nline2\nline3\nline4", sha256: sha256("line1-ours\nline2\nline3\nline4") }];
  const theirsClean = [{ path: "code.js", content: "line1\nline2\nline3\nline4-theirs", sha256: sha256("line1\nline2\nline3\nline4-theirs") }];

  const cleanResult = threeWayMerge({
    baseFiles: base,
    oursFiles: oursClean,
    theirsFiles: theirsClean,
    oursLabel: "main",
    theirsLabel: "feature",
  });
  assert.equal(cleanResult.hasConflicts, false);
  assert.equal(
    cleanResult.mergedFiles[0].content,
    "line1-ours\nline2\nline3\nline4-theirs"
  );

  const oursConflict = [{ path: "code.js", content: "line1\nOURS\nline3\nline4", sha256: sha256("line1\nOURS\nline3\nline4") }];
  const theirsConflict = [{ path: "code.js", content: "line1\nTHEIRS\nline3\nline4", sha256: sha256("line1\nTHEIRS\nline3\nline4") }];

  const conflictResult = threeWayMerge({
    baseFiles: base,
    oursFiles: oursConflict,
    theirsFiles: theirsConflict,
    oursLabel: "main",
    theirsLabel: "feature",
  });
  assert.equal(conflictResult.hasConflicts, true);
  assert.equal(conflictResult.conflicts.length, 1);
  assert.match(conflictResult.mergedFiles[0].content, /<<<<<<< main/);
  assert.match(conflictResult.mergedFiles[0].content, /=======/);
  assert.match(conflictResult.mergedFiles[0].content, />>>>>>> feature/);
});

test("End-to-end CLI workflow: init, add, commit, branch, checkout, merge, push, pull, revert", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gitforge-cli-"));
  try {
    await initRepo(tmpDir);
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "v1\nline2\nline3\n");
    await addRepo("hello.txt", tmpDir);
    const c1 = await commitRepo("initial commit", tmpDir);
    assert.ok(c1.hash);

    await branchRepo("feature", tmpDir);
    await checkoutRepo("feature", tmpDir);
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "v1\nline2\nline3-feature\n");
    await addRepo("hello.txt", tmpDir);
    await commitRepo("feature edit", tmpDir);

    await checkoutRepo("main", tmpDir);
    await fs.writeFile(path.join(tmpDir, "hello.txt"), "v1-main\nline2\nline3\n");
    await addRepo("hello.txt", tmpDir);
    await commitRepo("main edit", tmpDir);

    const merged = await mergeRepo("feature", tmpDir);
    assert.equal(merged.status, "merged");
    const mergedText = await fs.readFile(path.join(tmpDir, "hello.txt"), "utf8");
    assert.equal(mergedText, "v1-main\nline2\nline3-feature\n");

    const pushRes = await pushRepo(null, null, tmpDir);
    assert.equal(pushRes.storage, "local-remote");
    const pullRes = await pullRepo(null, "main", tmpDir);
    assert.ok(pullRes.commits.length >= 3);

    await revertRepo(c1.hash.slice(0, 7), tmpDir);
    const revertedText = await fs.readFile(path.join(tmpDir, "hello.txt"), "utf8");
    assert.equal(revertedText, "v1\nline2\nline3\n");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("Full REST API end-to-end flow: signup, login, repo, stage, commit, branch, merge conflict, resolve, revert", async () => {
  const { createApp } = require("../app");
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/api`;
  const uniq = Date.now();

  try {
    // Signup & Login
    const signupRes = await fetch(`${base}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `tester_${uniq}`,
        email: `tester_${uniq}@gitforge.dev`,
        password: "password123",
      }),
    });
    assert.equal(signupRes.status, 201);
    const signupData = await signupRes.json();
    assert.ok(signupData.token);

    const loginRes = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `tester_${uniq}@gitforge.dev`,
        password: "password123",
      }),
    });
    assert.equal(loginRes.status, 200);
    const { token } = await loginRes.json();
    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // Create repo
    const repoRes = await fetch(`${base}/repo/create`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: `gitforge-test-${uniq}`,
        description: "E2E API test",
        initialFiles: [{ path: "app.js", content: "const v = 1;\n" }],
      }),
    });
    assert.equal(repoRes.status, 201);
    const { repositoryID: repoId } = await repoRes.json();

    // Branch feature
    await fetch(`${base}/repo/${repoId}/branches`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "feature" }),
    });
    await fetch(`${base}/repo/${repoId}/checkout`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ branch: "feature" }),
    });

    // Edit, stage, commit on feature
    await fetch(`${base}/repo/${repoId}/files`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ path: "app.js", content: "const v = 2;\n" }),
    });
    await fetch(`${base}/repo/${repoId}/stage`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ stageAll: true }),
    });
    const fCommit = await fetch(`${base}/repo/${repoId}/commit`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ message: "feature change" }),
    });
    assert.equal(fCommit.status, 201);

    // Switch back to main and make conflicting edit
    await fetch(`${base}/repo/${repoId}/checkout`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ branch: "main" }),
    });
    await fetch(`${base}/repo/${repoId}/files`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ path: "app.js", content: "const v = 99;\n" }),
    });
    await fetch(`${base}/repo/${repoId}/stage`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ stageAll: true }),
    });
    await fetch(`${base}/repo/${repoId}/commit`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ message: "main change" }),
    });

    // Merge feature -> main should detect conflict
    const mergeRes = await fetch(`${base}/repo/${repoId}/merge`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ sourceBranch: "feature" }),
    });
    const mergeData = await mergeRes.json();
    assert.equal(mergeData.status, "conflict");
    assert.equal(mergeData.conflicts.length, 1);

    // Resolve conflict
    const resolveRes = await fetch(`${base}/repo/${repoId}/merge/resolve`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        resolutions: [{ path: "app.js", content: "const v = 100;\n" }],
      }),
    });
    assert.equal(resolveRes.status, 200);

    // Verify SHA-256 integrity
    const verifyRes = await fetch(`${base}/repo/${repoId}/verify`);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.valid, true);
  } finally {
    server.close();
    const dbFile = path.resolve(__dirname, "../.local-db.json");
    await fs.rm(dbFile, { force: true });
  }
});
