import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  RepoIcon,
  GitBranchIcon,
  GitCommitIcon,
  GitMergeIcon,
  DiffIcon,
  IssueOpenedIcon,
  ShieldCheckIcon,
  PlusIcon,
  TrashIcon,
  HistoryIcon,
  StarIcon,
  AlertIcon,
  TerminalIcon,
  CheckIcon,
  LockIcon,
  GlobeIcon,
} from "@primer/octicons-react";
import api from "../../api";
import Navbar from "../Navbar";
import "./repo.css";

function DiffViewer({ diff }) {
  if (!diff || !diff.lines || diff.lines.length === 0) {
    return <p className="gf-muted">No line differences.</p>;
  }
  return (
    <div className="gf-diff-box">
      {diff.lines.map((line, idx) => (
        <div key={idx} className={`gf-diff-line gf-diff-${line.type}`}>
          <span className="gf-diff-num">{line.oldLine ?? ""}</span>
          <span className="gf-diff-num">{line.newLine ?? ""}</span>
          <span className="gf-diff-sign">
            {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
          </span>
          <span className="gf-diff-text">{line.text || " "}</span>
        </div>
      ))}
    </div>
  );
}

const RepoWorkspace = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = localStorage.getItem("userId");

  const [repo, setRepo] = useState(null);
  const [status, setStatus] = useState(null);
  const [commits, setCommits] = useState([]);
  const [issues, setIssues] = useState([]);
  const [activeTab, setActiveTab] = useState("code");
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);

  // Code editor state
  const [selectedPath, setSelectedPath] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [newFilePath, setNewFilePath] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);

  // Commit / Staging state
  const [commitMessage, setCommitMessage] = useState("");

  // History / Diff state
  const [selectedCommitDetail, setSelectedCommitDetail] = useState(null);
  const [compareBase, setCompareBase] = useState("");
  const [compareTarget, setCompareTarget] = useState("WORKING");
  const [compareResult, setCompareResult] = useState(null);

  // Branch & Merge state
  const [newBranchName, setNewBranchName] = useState("");
  const [mergeSource, setMergeSource] = useState("");
  const [conflictDrafts, setConflictDrafts] = useState({});
  const [mergeCommitMsg, setMergeCommitMsg] = useState("");

  // Issues state
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDesc, setIssueDesc] = useState("");

  // Integrity state
  const [integrityReport, setIntegrityReport] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [repoRes, statusRes, commitsRes, issuesRes] = await Promise.all([
        api.get(`/repo/${id}`),
        api.get(`/repo/${id}/status`),
        api.get(`/repo/${id}/commits`),
        api.get(`/issue/all/${id}`),
      ]);

      const repoData = repoRes.data;
      const statusData = statusRes.data;
      setRepo(repoData);
      setStatus(statusData);
      setCommits(commitsRes.data.commits || []);
      setIssues(issuesRes.data || []);

      const files = statusData.workingFiles || [];
      if (files.length > 0) {
        setSelectedPath((prev) => {
          const match = files.find((f) => f.path === prev) || files[0];
          setEditorContent(match.content);
          return match.path;
        });
      } else {
        setSelectedPath("");
        setEditorContent("");
      }

      if (statusData.pendingMerge?.conflicts) {
        const drafts = {};
        for (const c of statusData.pendingMerge.conflicts) {
          drafts[c.path] = c.mergedContent;
        }
        setConflictDrafts(drafts);
      } else {
        setConflictDrafts({});
      }

      if (!compareBase && statusData.currentBranch) {
        setCompareBase(statusData.currentBranch);
      }
    } catch (err) {
      setBanner({
        type: "error",
        text: err.response?.data?.error || "Failed to load repository.",
      });
    } finally {
      setLoading(false);
    }
  }, [id, compareBase]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const isOwner =
    repo &&
    String(repo.owner?._id || repo.owner) === String(currentUser);

  const notify = (type, text) => {
    setBanner({ type, text });
  };

  const handleSelectFile = (file) => {
    setSelectedPath(file.path);
    setEditorContent(file.content);
  };

  const handleSaveFile = async () => {
    if (!selectedPath) return;
    try {
      await api.post(`/repo/${id}/files`, {
        path: selectedPath,
        content: editorContent,
      });
      notify("success", `Saved '${selectedPath}' to working tree (SHA-256 updated).`);
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to save file.");
    }
  };

  const handleCreateFile = async (e) => {
    e.preventDefault();
    if (!newFilePath.trim()) return;
    try {
      await api.post(`/repo/${id}/files`, {
        path: newFilePath.trim(),
        content: `// ${newFilePath.trim()}\n`,
      });
      setSelectedPath(newFilePath.trim());
      setNewFilePath("");
      setShowNewFile(false);
      notify("success", "New file added to working tree.");
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to create file.");
    }
  };

  const handleDeleteFile = async (filePath) => {
    try {
      await api.delete(`/repo/${id}/files`, { data: { path: filePath } });
      notify("success", `Deleted '${filePath}' from working tree.`);
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to delete file.");
    }
  };

  const handleStage = async (paths = null) => {
    try {
      await api.post(`/repo/${id}/stage`, {
        paths,
        stageAll: !paths,
      });
      notify("success", paths ? `Staged ${paths.join(", ")}` : "Staged all changes.");
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to stage.");
    }
  };

  const handleUnstage = async (paths = null) => {
    try {
      await api.post(`/repo/${id}/unstage`, { paths });
      notify("success", "Unstaged changes.");
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to unstage.");
    }
  };

  const handleCommit = async (e) => {
    e.preventDefault();
    if (!commitMessage.trim()) {
      notify("error", "Enter a commit message.");
      return;
    }
    try {
      const res = await api.post(`/repo/${id}/commit`, {
        message: commitMessage.trim(),
      });
      setCommitMessage("");
      notify(
        "success",
        `Committed [${res.data.commit.shortHash}] ${res.data.commit.message}`
      );
      await loadAll();
      setActiveTab("commits");
    } catch (err) {
      notify("error", err.response?.data?.error || "Commit failed.");
    }
  };

  const handleInspectCommit = async (hash) => {
    try {
      const res = await api.get(`/repo/${id}/commits/${hash}`);
      setSelectedCommitDetail(res.data);
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to load commit.");
    }
  };

  const handleRevert = async (commitHash) => {
    try {
      const res = await api.post(`/repo/${id}/revert`, { commitHash });
      notify("success", res.data.message);
      setSelectedCommitDetail(null);
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Revert failed.");
    }
  };

  const handleCompareDiff = async () => {
    try {
      const res = await api.get(
        `/repo/${id}/diff?base=${encodeURIComponent(
          compareBase
        )}&target=${encodeURIComponent(compareTarget)}`
      );
      setCompareResult(res.data);
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to compare diff.");
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      const res = await api.post(`/repo/${id}/branches`, {
        name: newBranchName.trim(),
      });
      setNewBranchName("");
      notify("success", res.data.message);
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to create branch.");
    }
  };

  const handleCheckout = async (branchName) => {
    try {
      const res = await api.post(`/repo/${id}/checkout`, {
        branch: branchName,
      });
      notify("success", res.data.message);
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Checkout failed.");
    }
  };

  const handleMerge = async (sourceOverride) => {
    const src = sourceOverride || mergeSource || otherBranches[0]?.name;
    if (!src) return;
    setMergeSource(src);
    try {
      const res = await api.post(`/repo/${id}/merge`, {
        sourceBranch: src,
      });
      if (res.data.status === "conflict") {
        notify(
          "error",
          `${res.data.message} Resolve conflicts below to complete the merge.`
        );
      } else {
        notify("success", res.data.message);
      }
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Merge failed.");
    }
  };

  const handleResolveMerge = async () => {
    try {
      const resolutions = Object.entries(conflictDrafts).map(
        ([path, content]) => ({ path, content })
      );
      const res = await api.post(`/repo/${id}/merge/resolve`, {
        resolutions,
        message: mergeCommitMsg.trim() || undefined,
      });
      setMergeCommitMsg("");
      notify("success", res.data.message);
      await loadAll();
      setActiveTab("commits");
    } catch (err) {
      notify("error", err.response?.data?.error || "Resolution failed.");
    }
  };

  const handleAbortMerge = async () => {
    try {
      const res = await api.post(`/repo/${id}/merge/abort`);
      notify("success", res.data.message);
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Abort failed.");
    }
  };

  const handleVerifyIntegrity = async () => {
    try {
      const res = await api.get(`/repo/${id}/verify`);
      setIntegrityReport(res.data);
      notify(
        res.data.valid ? "success" : "error",
        res.data.valid
          ? `SHA-256 Integrity Verified across ${res.data.commitsChecked} commit(s) and working tree.`
          : "Integrity mismatch detected!"
      );
    } catch (err) {
      notify("error", "Failed to verify SHA-256 integrity.");
    }
  };

  const handleToggleVisibility = async () => {
    try {
      await api.patch(`/repo/toggle/${id}`);
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Toggle failed.");
    }
  };

  const handleToggleStar = async () => {
    try {
      await api.post(`/star/${id}`);
      await loadAll();
    } catch (err) {
      notify("error", "Failed to toggle star.");
    }
  };

  const handleDeleteRepo = async () => {
    if (!window.confirm(`Delete repository '${repo.name}' permanently?`)) return;
    try {
      await api.delete(`/repo/delete/${id}`);
      navigate("/");
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to delete repo.");
    }
  };

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    if (!issueTitle.trim() || !issueDesc.trim()) return;
    try {
      await api.post(`/issue/create/${id}`, {
        title: issueTitle.trim(),
        description: issueDesc.trim(),
      });
      setIssueTitle("");
      setIssueDesc("");
      notify("success", "Issue created.");
      await loadAll();
    } catch (err) {
      notify("error", err.response?.data?.error || "Failed to create issue.");
    }
  };

  const handleToggleIssue = async (issue) => {
    try {
      await api.put(`/issue/update/${issue._id}`, {
        status: issue.status === "open" ? "closed" : "open",
      });
      await loadAll();
    } catch (err) {
      notify("error", "Failed to update issue.");
    }
  };

  const handleDeleteIssue = async (issueId) => {
    try {
      await api.delete(`/issue/delete/${issueId}`);
      await loadAll();
    } catch (err) {
      notify("error", "Failed to delete issue.");
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="gf-repo-container">Loading repository workspace...</div>
      </>
    );
  }

  if (!repo || !status) {
    return (
      <>
        <Navbar />
        <div className="gf-repo-container">
          <div className="gf-alert gf-alert-error">
            Repository not found or access denied.
          </div>
          <Link to="/" className="gf-btn">
            Back to Dashboard
          </Link>
        </div>
      </>
    );
  }

  const workingFiles = status.workingFiles || [];
  const selectedFileObj = workingFiles.find((f) => f.path === selectedPath);
  const stagedCount = (status.stagedFiles || []).length;
  const unstagedCount = (status.unstagedChanges || []).length;
  const otherBranches = (status.branches || []).filter(
    (b) => b.name !== status.currentBranch
  );

  return (
    <>
      <Navbar />
      <div className="gf-repo-container">
        <div className="gf-repo-header">
          <div className="gf-repo-heading">
            <RepoIcon size={20} />
            <span className="gf-owner">{repo.owner?.username || "owner"}</span>
            <span>/</span>
            <h1>{repo.name}</h1>
            <span className="gf-badge">
              {repo.visibility !== false ? (
                <>
                  <GlobeIcon size={11} /> Public
                </>
              ) : (
                <>
                  <LockIcon size={11} /> Private
                </>
              )}
            </span>
            {status.pendingMerge && (
              <span className="gf-badge gf-badge-red">
                <AlertIcon size={12} /> Merge Conflict Active
              </span>
            )}
          </div>

          <div className="gf-repo-actions">
            <div className="gf-branch-pill">
              <GitBranchIcon size={14} />
              <select
                value={status.currentBranch}
                disabled={!isOwner}
                onChange={(e) => handleCheckout(e.target.value)}
                aria-label="Current Branch"
              >
                {(status.branches || []).map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="gf-btn"
              onClick={handleVerifyIntegrity}
            >
              <ShieldCheckIcon size={15} /> Verify SHA-256
            </button>

            <button type="button" className="gf-btn" onClick={handleToggleStar}>
              <StarIcon size={15} /> Star ({repo.stars?.length || 0})
            </button>

            {isOwner && (
              <>
                <button
                  type="button"
                  className="gf-btn"
                  onClick={handleToggleVisibility}
                >
                  Make {repo.visibility !== false ? "Private" : "Public"}
                </button>
                <button
                  type="button"
                  className="gf-btn gf-btn-danger"
                  onClick={handleDeleteRepo}
                >
                  <TrashIcon size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {repo.description && (
          <p className="gf-muted" style={{ marginBottom: 14 }}>
            {repo.description}
          </p>
        )}

        {banner && (
          <div
            className={`gf-alert ${
              banner.type === "error" ? "gf-alert-error" : "gf-alert-success"
            }`}
          >
            {banner.text}
          </div>
        )}

        {integrityReport && (
          <div className="gf-panel" style={{ marginBottom: 16 }}>
            <div className="gf-panel-header">
              <h3>
                <ShieldCheckIcon size={16} /> SHA-256 Integrity Report
              </h3>
              <span
                className={`gf-badge ${
                  integrityReport.valid ? "gf-badge-green" : "gf-badge-red"
                }`}
              >
                {integrityReport.valid ? "ALL VERIFIED" : "MISMATCH"}
              </span>
            </div>
            <p className="gf-muted">
              Verified {integrityReport.commitsChecked} commit hash(es) and{" "}
              {integrityReport.workingTree?.files?.length || 0} working tree
              file digest(s).
            </p>
          </div>
        )}

        <div className="gf-tabs">
          <button
            type="button"
            className={activeTab === "code" ? "active" : ""}
            onClick={() => setActiveTab("code")}
          >
            <RepoIcon size={15} /> Code ({workingFiles.length})
          </button>
          <button
            type="button"
            className={activeTab === "staging" ? "active" : ""}
            onClick={() => setActiveTab("staging")}
          >
            <DiffIcon size={15} /> Staging & Diff ({stagedCount}/{unstagedCount})
          </button>
          <button
            type="button"
            className={activeTab === "commits" ? "active" : ""}
            onClick={() => setActiveTab("commits")}
          >
            <HistoryIcon size={15} /> Commits ({commits.length})
          </button>
          <button
            type="button"
            className={activeTab === "branches" ? "active" : ""}
            onClick={() => setActiveTab("branches")}
          >
            <GitMergeIcon size={15} /> Branches & Merge (
            {status.branches?.length || 1})
          </button>
          <button
            type="button"
            className={activeTab === "issues" ? "active" : ""}
            onClick={() => setActiveTab("issues")}
          >
            <IssueOpenedIcon size={15} /> Issues ({issues.length})
          </button>
          <button
            type="button"
            className={activeTab === "cli" ? "active" : ""}
            onClick={() => setActiveTab("cli")}
          >
            <TerminalIcon size={15} /> CLI Push/Pull
          </button>
        </div>

        {/* CODE & WORKING TREE TAB */}
        {activeTab === "code" && (
          <div className="gf-code-layout">
            <div className="gf-panel">
              <div className="gf-panel-header">
                <h3>Files on {status.currentBranch}</h3>
                {isOwner && (
                  <button
                    type="button"
                    className="gf-btn"
                    style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                    onClick={() => setShowNewFile((v) => !v)}
                  >
                    <PlusIcon size={13} /> New File
                  </button>
                )}
              </div>

              {showNewFile && (
                <form
                  onSubmit={handleCreateFile}
                  style={{ display: "flex", gap: 6, marginBottom: 10 }}
                >
                  <input
                    className="input"
                    style={{ height: 32, fontSize: "0.82rem" }}
                    placeholder="path/to/file.js"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                  />
                  <button type="submit" className="gf-btn gf-btn-primary">
                    Add
                  </button>
                </form>
              )}

              <div className="gf-file-list">
                {workingFiles.length === 0 ? (
                  <p className="gf-muted">No files in working tree.</p>
                ) : (
                  workingFiles.map((file) => (
                    <div
                      key={file.path}
                      className={`gf-file-item ${
                        selectedPath === file.path ? "active" : ""
                      }`}
                      onClick={() => handleSelectFile(file)}
                    >
                      <div>
                        <div className="gf-file-name">{file.path}</div>
                        <div className="gf-hash-mini">
                          sha256: {file.sha256?.slice(0, 12)}...
                        </div>
                      </div>
                      {isOwner && (
                        <button
                          type="button"
                          className="gf-icon-btn"
                          title="Delete file"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file.path);
                          }}
                        >
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="gf-panel">
              {selectedFileObj ? (
                <>
                  <div className="gf-panel-header">
                    <div>
                      <strong>{selectedFileObj.path}</strong>
                      <div className="gf-hash-mini">
                        SHA-256: {selectedFileObj.sha256}
                      </div>
                    </div>
                    {isOwner && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className="gf-btn gf-btn-primary"
                          onClick={handleSaveFile}
                        >
                          Save Working File
                        </button>
                        <button
                          type="button"
                          className="gf-btn"
                          onClick={() => setActiveTab("staging")}
                        >
                          Review Diff & Stage
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea
                    className="code-input gf-editor"
                    value={editorContent}
                    readOnly={!isOwner}
                    onChange={(e) => setEditorContent(e.target.value)}
                    rows={16}
                  />
                </>
              ) : (
                <p className="gf-muted">Select or create a file to edit.</p>
              )}
            </div>
          </div>
        )}

        {/* STAGING & DIFF TAB */}
        {activeTab === "staging" && (
          <div className="gf-two-col">
            <div className="gf-panel">
              <div className="gf-panel-header">
                <h3>Unstaged Changes ({unstagedCount})</h3>
                {isOwner && unstagedCount > 0 && (
                  <button
                    type="button"
                    className="gf-btn gf-btn-primary"
                    onClick={() => handleStage(null)}
                  >
                    Stage All
                  </button>
                )}
              </div>

              {unstagedCount === 0 ? (
                <p className="gf-muted">Working tree matches staged/HEAD.</p>
              ) : (
                status.unstagedChanges.map((change) => (
                  <div key={change.path} className="gf-change-card">
                    <div className="gf-change-head">
                      <div>
                        <strong>{change.path}</strong>{" "}
                        <span className="gf-badge gf-badge-yellow">
                          {change.status}
                        </span>
                        <div className="gf-hash-mini">
                          {change.oldHash
                            ? change.oldHash.slice(0, 10)
                            : "new"}{" "}
                          →{" "}
                          {change.newHash
                            ? change.newHash.slice(0, 10)
                            : "deleted"}
                        </div>
                      </div>
                      {isOwner && (
                        <button
                          type="button"
                          className="gf-btn"
                          onClick={() => handleStage([change.path])}
                        >
                          Stage
                        </button>
                      )}
                    </div>
                    <DiffViewer diff={change.diff} />
                  </div>
                ))
              )}
            </div>

            <div className="gf-panel">
              <div className="gf-panel-header">
                <h3>Staged for Commit ({stagedCount})</h3>
                {isOwner && stagedCount > 0 && (
                  <button
                    type="button"
                    className="gf-btn"
                    onClick={() => handleUnstage(null)}
                  >
                    Unstage All
                  </button>
                )}
              </div>

              {stagedCount === 0 ? (
                <p className="gf-muted" style={{ marginBottom: 16 }}>
                  No staged files yet. Edit a file in the Code tab, then stage it
                  here.
                </p>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  {status.stagedFiles.map((s) => (
                    <div key={s.path} className="gf-staged-row">
                      <span>
                        <code>{s.path}</code>{" "}
                        <span className="gf-badge gf-badge-green">
                          {s.status}
                        </span>
                      </span>
                      {isOwner && (
                        <button
                          type="button"
                          className="gf-btn"
                          style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                          onClick={() => handleUnstage([s.path])}
                        >
                          Unstage
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isOwner && (
                <form
                  onSubmit={handleCommit}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <label className="label">Commit Message</label>
                  <input
                    className="input"
                    placeholder={`Commit to ${status.currentBranch}...`}
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="gf-btn gf-btn-primary"
                    disabled={stagedCount === 0}
                  >
                    <GitCommitIcon size={15} /> Commit Staged Changes
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* COMMITS & VERSION HISTORY TAB */}
        {activeTab === "commits" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="gf-panel">
              <div className="gf-panel-header">
                <h3>Compare Branch / Commit Diffs</h3>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <select
                  className="input"
                  style={{ width: "auto", minWidth: 180 }}
                  value={compareBase}
                  onChange={(e) => setCompareBase(e.target.value)}
                >
                  {(status.branches || []).map((b) => (
                    <option key={b.name} value={b.name}>
                      Branch: {b.name}
                    </option>
                  ))}
                  {commits.map((c) => (
                    <option key={c.hash} value={c.hash}>
                      {c.shortHash} — {c.message.slice(0, 28)}
                    </option>
                  ))}
                </select>
                <span style={{ alignSelf: "center" }}>→</span>
                <select
                  className="input"
                  style={{ width: "auto", minWidth: 180 }}
                  value={compareTarget}
                  onChange={(e) => setCompareTarget(e.target.value)}
                >
                  <option value="WORKING">Working Tree</option>
                  {(status.branches || []).map((b) => (
                    <option key={b.name} value={b.name}>
                      Branch: {b.name}
                    </option>
                  ))}
                  {commits.map((c) => (
                    <option key={c.hash} value={c.hash}>
                      {c.shortHash} — {c.message.slice(0, 28)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="gf-btn gf-btn-primary"
                  onClick={handleCompareDiff}
                >
                  Compare Diff
                </button>
              </div>

              {compareResult && (
                <div style={{ marginTop: 14 }}>
                  <p className="gf-muted" style={{ marginBottom: 8 }}>
                    Comparing <strong>{compareResult.base}</strong> →{" "}
                    <strong>{compareResult.target}</strong> (+
                    {compareResult.summary.additions}/-
                    {compareResult.summary.deletions})
                  </p>
                  {compareResult.changes.length === 0 ? (
                    <p className="gf-muted">Identical snapshots.</p>
                  ) : (
                    compareResult.changes.map((c) => (
                      <div key={c.path} className="gf-change-card">
                        <div className="gf-change-head">
                          <strong>{c.path}</strong>
                          <span className="gf-badge">{c.status}</span>
                        </div>
                        <DiffViewer diff={c.diff} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="gf-panel">
              <div className="gf-panel-header">
                <h3>Commit & Version History</h3>
              </div>
              {commits.map((c) => (
                <div key={c.hash} className="gf-commit-row">
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{c.message}</strong>
                      <span className="gf-badge gf-badge-blue">{c.branch}</span>
                      <span className="gf-badge">{c.type}</span>
                    </div>
                    <div className="gf-hash-mini" style={{ marginTop: 4 }}>
                      SHA-256: <code>{c.hash}</code> • {c.authorName} •{" "}
                      {new Date(c.timestamp).toLocaleString()} • +
                      {c.stats?.additions || 0}/-{c.stats?.deletions || 0}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="gf-btn"
                      onClick={() => handleInspectCommit(c.hash)}
                    >
                      Inspect Diff
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        className="gf-btn"
                        onClick={() => handleRevert(c.hash)}
                      >
                        Revert
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selectedCommitDetail && (
              <div className="gf-panel">
                <div className="gf-panel-header">
                  <h3>
                    Commit {selectedCommitDetail.commit.shortHash}:{" "}
                    {selectedCommitDetail.commit.message}
                  </h3>
                  <span
                    className={`gf-badge ${
                      selectedCommitDetail.integrity?.valid
                        ? "gf-badge-green"
                        : "gf-badge-red"
                    }`}
                  >
                    {selectedCommitDetail.integrity?.valid
                      ? "SHA-256 Verified"
                      : "Hash Mismatch"}
                  </span>
                </div>
                {selectedCommitDetail.diff.changes.map((ch) => (
                  <div key={ch.path} className="gf-change-card">
                    <div className="gf-change-head">
                      <strong>{ch.path}</strong>
                      <span className="gf-badge">{ch.status}</span>
                    </div>
                    <DiffViewer diff={ch.diff} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BRANCHES & MERGE TAB */}
        {activeTab === "branches" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {status.pendingMerge && (
              <div className="gf-panel gf-conflict-panel">
                <div className="gf-panel-header">
                  <h3>
                    <AlertIcon size={16} /> Merge Conflict Detected:{" "}
                    <code>{status.pendingMerge.sourceBranch}</code> →{" "}
                    <code>{status.pendingMerge.targetBranch}</code>
                  </h3>
                  {isOwner && (
                    <button
                      type="button"
                      className="gf-btn gf-btn-danger"
                      onClick={handleAbortMerge}
                    >
                      Abort Merge
                    </button>
                  )}
                </div>

                {status.pendingMerge.conflicts.map((conflict) => (
                  <div key={conflict.path} className="gf-change-card">
                    <div className="gf-change-head">
                      <strong>{conflict.path}</strong>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="gf-btn"
                          onClick={() =>
                            setConflictDrafts((d) => ({
                              ...d,
                              [conflict.path]: conflict.oursContent,
                            }))
                          }
                        >
                          Accept Current ({status.pendingMerge.targetBranch})
                        </button>
                        <button
                          type="button"
                          className="gf-btn"
                          onClick={() =>
                            setConflictDrafts((d) => ({
                              ...d,
                              [conflict.path]: conflict.theirsContent,
                            }))
                          }
                        >
                          Accept Incoming ({status.pendingMerge.sourceBranch})
                        </button>
                        <button
                          type="button"
                          className="gf-btn"
                          onClick={() =>
                            setConflictDrafts((d) => ({
                              ...d,
                              [conflict.path]: `${conflict.oursContent}\n${conflict.theirsContent}`,
                            }))
                          }
                        >
                          Accept Both
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="code-input gf-editor"
                      rows={10}
                      value={conflictDrafts[conflict.path] ?? ""}
                      onChange={(e) =>
                        setConflictDrafts((d) => ({
                          ...d,
                          [conflict.path]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}

                {isOwner && (
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <input
                      className="input"
                      placeholder="Merge commit message (optional)"
                      value={mergeCommitMsg}
                      onChange={(e) => setMergeCommitMsg(e.target.value)}
                    />
                    <button
                      type="button"
                      className="gf-btn gf-btn-primary"
                      onClick={handleResolveMerge}
                    >
                      <CheckIcon size={15} /> Complete Merge Commit
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="gf-two-col">
              <div className="gf-panel">
                <div className="gf-panel-header">
                  <h3>Branches</h3>
                </div>
                {(status.branches || []).map((b) => (
                  <div key={b.name} className="gf-staged-row">
                    <div>
                      <strong>{b.name}</strong>{" "}
                      {b.name === status.currentBranch && (
                        <span className="gf-badge gf-badge-green">HEAD</span>
                      )}
                      <div className="gf-hash-mini">
                        head: {b.headHash ? b.headHash.slice(0, 12) : "none"}
                      </div>
                    </div>
                    {isOwner && b.name !== status.currentBranch && (
                      <button
                        type="button"
                        className="gf-btn"
                        onClick={() => handleCheckout(b.name)}
                      >
                        Checkout
                      </button>
                    )}
                  </div>
                ))}

                {isOwner && (
                  <form
                    onSubmit={handleCreateBranch}
                    style={{ display: "flex", gap: 8, marginTop: 14 }}
                  >
                    <input
                      className="input"
                      placeholder="feature/new-branch"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                    />
                    <button type="submit" className="gf-btn gf-btn-primary">
                      Create Branch
                    </button>
                  </form>
                )}
              </div>

              <div className="gf-panel">
                <div className="gf-panel-header">
                  <h3>Three-Way Branch Merge</h3>
                </div>
                <p className="gf-muted" style={{ marginBottom: 12 }}>
                  Merges an incoming branch into{" "}
                  <code>{status.currentBranch}</code> using LCA ancestor lookup
                  and line-level conflict detection.
                </p>
                {otherBranches.length === 0 ? (
                  <p className="gf-muted">
                    Create a second branch first to perform a merge.
                  </p>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      className="input"
                      value={mergeSource || otherBranches[0]?.name || ""}
                      onChange={(e) => setMergeSource(e.target.value)}
                    >
                      {otherBranches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {isOwner && (
                      <button
                        type="button"
                        className="gf-btn gf-btn-primary"
                        onClick={() => handleMerge()}
                      >
                        <GitMergeIcon size={15} /> Merge into{" "}
                        {status.currentBranch}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ISSUES TAB */}
        {activeTab === "issues" && (
          <div className="gf-two-col">
            <div className="gf-panel">
              <div className="gf-panel-header">
                <h3>Issues ({issues.length})</h3>
              </div>
              {issues.length === 0 ? (
                <p className="gf-muted">No issues filed yet.</p>
              ) : (
                issues.map((issue) => (
                  <div key={issue._id} className="gf-commit-row">
                    <div>
                      <strong>{issue.title}</strong>{" "}
                      <span
                        className={`gf-badge ${
                          issue.status === "open"
                            ? "gf-badge-green"
                            : "gf-badge-red"
                        }`}
                      >
                        {issue.status}
                      </span>
                      <p className="gf-muted" style={{ marginTop: 4 }}>
                        {issue.description}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="gf-btn"
                        onClick={() => handleToggleIssue(issue)}
                      >
                        {issue.status === "open" ? "Close" : "Reopen"}
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          className="gf-btn gf-btn-danger"
                          onClick={() => handleDeleteIssue(issue._id)}
                        >
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="gf-panel">
              <div className="gf-panel-header">
                <h3>New Issue</h3>
              </div>
              <form
                onSubmit={handleCreateIssue}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <input
                  className="input"
                  placeholder="Issue title"
                  value={issueTitle}
                  onChange={(e) => setIssueTitle(e.target.value)}
                />
                <textarea
                  className="code-input gf-editor"
                  rows={5}
                  placeholder="Describe the bug or enhancement..."
                  value={issueDesc}
                  onChange={(e) => setIssueDesc(e.target.value)}
                />
                <button type="submit" className="gf-btn gf-btn-primary">
                  Submit Issue
                </button>
              </form>
            </div>
          </div>
        )}

        {/* CLI PUSH/PULL TAB */}
        {activeTab === "cli" && (
          <div className="gf-panel">
            <div className="gf-panel-header">
              <h3>GitForge CLI Remote Sync</h3>
            </div>
            <p className="gf-muted" style={{ marginBottom: 12 }}>
              Use the custom GitForge CLI in your local project directory to
              initialize, stage, commit, branch, merge, push, pull, and revert:
            </p>
            <pre className="gf-cli-box">
{`# 1. Initialize repository locally
node index.js init

# 2. Stage files with SHA-256 content hashing
node index.js add .
node index.js status

# 3. Commit staged snapshot
node index.js commit "feat: implement sha256 hashing"

# 4. Branch, switch, and merge with conflict detection
node index.js branch feature-auth
node index.js checkout feature-auth
node index.js checkout main
node index.js merge feature-auth

# 5. Push / Pull with this remote GitForge repository
export GITFORGE_REMOTE_URL="${window.location.origin}/api"
node index.js push ${repo._id}
node index.js pull ${repo._id} ${status.currentBranch}

# 6. Revert to any commit hash
node index.js revert ${status.headCommit?.shortHash || "<commitHash>"}`}
            </pre>
          </div>
        )}
      </div>
    </>
  );
};

export default RepoWorkspace;
