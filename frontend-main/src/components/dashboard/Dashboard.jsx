import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  RepoIcon,
  PlusIcon,
  SearchIcon,
  GitBranchIcon,
  StarIcon,
  LockIcon,
  GlobeIcon,
  TerminalIcon,
} from "@primer/octicons-react";
import api from "../../api";
import Navbar from "../Navbar";
import "./dashboard.css";

const Dashboard = () => {
  const [repositories, setRepositories] = useState([]);
  const [suggestedRepositories, setSuggestedRepositories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const userId = localStorage.getItem("userId");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [userRes, allRes] = await Promise.all([
        api.get(`/repo/user/${userId}`),
        api.get("/repo/all"),
      ]);
      setRepositories(userRes.data.repositories || []);
      setSuggestedRepositories(allRes.data || []);
    } catch (err) {
      console.error("Error loading repositories:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) loadData();
  }, [userId, loadData]);

  const handleToggleStar = async (repoId) => {
    try {
      await api.post(`/star/${repoId}`);
      loadData();
    } catch (err) {
      console.error("Error starring repo:", err);
    }
  };

  const filteredRepos = repositories.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Navbar />
      <div className="gf-dashboard-container">
        <aside className="gf-sidebar">
          <div className="gf-panel">
            <div className="gf-panel-header">
              <h3>Explore Repositories</h3>
            </div>
            <div className="gf-list">
              {suggestedRepositories.length === 0 ? (
                <p className="gf-muted">No public repositories yet.</p>
              ) : (
                suggestedRepositories.slice(0, 8).map((repo) => (
                  <div key={repo._id} className="gf-mini-repo">
                    <div>
                      <Link to={`/repo/${repo._id}`} className="gf-repo-link">
                        {repo.owner?.username ? `${repo.owner.username}/` : ""}
                        {repo.name}
                      </Link>
                      <p className="gf-muted">
                        {repo.description || "No description"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="gf-btn"
                      style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                      onClick={() => handleToggleStar(repo._id)}
                    >
                      <StarIcon size={12} /> {repo.stars?.length || 0}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="gf-main">
          <div className="gf-main-header">
            <div>
              <h2>Your Repositories</h2>
              <p className="gf-muted">
                Manage branches, staging, SHA-256 commits, diffs, and merges
              </p>
            </div>
            <Link to="/create" className="gf-btn gf-btn-primary">
              <PlusIcon size={15} /> New Repository
            </Link>
          </div>

          <div className="gf-search-bar">
            <SearchIcon size={16} className="gf-search-icon" />
            <input
              type="text"
              value={searchQuery}
              placeholder="Find a repository..."
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="gf-panel">Loading repositories...</div>
          ) : filteredRepos.length === 0 ? (
            <div className="gf-empty-state">
              <RepoIcon size={32} />
              <h3>No repositories found</h3>
              <p className="gf-muted">
                Initialize your first GitForge repository to test staging,
                SHA-256 hashing, diffs, branching, and 3-way merge conflict
                resolution.
              </p>
              <Link to="/create" className="gf-btn gf-btn-primary">
                <PlusIcon size={15} /> Create Repository
              </Link>
            </div>
          ) : (
            <div className="gf-repo-grid">
              {filteredRepos.map((repo) => (
                <div key={repo._id} className="gf-repo-card">
                  <div className="gf-repo-card-top">
                    <Link to={`/repo/${repo._id}`} className="gf-repo-title">
                      <RepoIcon size={16} /> {repo.name}
                    </Link>
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
                  </div>
                  <p className="gf-repo-desc">
                    {repo.description || "GitForge managed repository"}
                  </p>
                  <div className="gf-repo-meta">
                    <span className="gf-badge gf-badge-blue">
                      <GitBranchIcon size={11} /> {repo.currentBranch || "main"}
                    </span>
                    <span className="gf-muted">
                      {repo.branches?.length || 1} branch(es)
                    </span>
                    <span className="gf-muted">
                      {repo.workingFiles?.length || 0} file(s)
                    </span>
                    {repo.pendingMerge && (
                      <span className="gf-badge gf-badge-red">
                        Merge Conflict
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="gf-sidebar">
          <div className="gf-panel">
            <div className="gf-panel-header">
              <h3>
                <TerminalIcon size={15} /> GitForge VCS Engine
              </h3>
            </div>
            <ul className="gf-feature-list">
              <li>
                <strong>SHA-256 Content Hashing</strong>
                <span>Every blob & commit verified for integrity</span>
              </li>
              <li>
                <strong>File-Diff Tracking</strong>
                <span>Line-by-line LCS diff detection</span>
              </li>
              <li>
                <strong>Branching & 3-Way Merge</strong>
                <span>Parallel branches with conflict markers</span>
              </li>
              <li>
                <strong>Push, Pull & Revert</strong>
                <span>CLI + MongoDB remote version history</span>
              </li>
            </ul>
            <pre className="gf-cli-box">
{`gitforge init
gitforge add .
gitforge commit "feat: init"
gitforge branch feature-x
gitforge merge feature-x
gitforge revert <hash>`}
            </pre>
          </div>
        </aside>
      </div>
    </>
  );
};

export default Dashboard;
