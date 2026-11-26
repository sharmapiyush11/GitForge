import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RepoIcon, GlobeIcon, LockIcon } from "@primer/octicons-react";
import api from "../../api";
import Navbar from "../Navbar";

const CreateRepo = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState(true);
  const [includeStarter, setIncludeStarter] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Repository name is required.");
      return;
    }

    const initialFiles = includeStarter
      ? [
          {
            path: "README.md",
            content: `# ${name.trim()}\n\n${
              description.trim() || "Versioned with GitForge VCS."
            }\n`,
          },
          {
            path: "src/index.js",
            content: `// ${name.trim()} entry point\nexport function greet(user = "GitForge") {\n  return \`Hello from \${user}!\`;\n}\n`,
          },
        ]
      : undefined;

    try {
      setLoading(true);
      const res = await api.post("/repo/create", {
        name: name.trim(),
        description: description.trim(),
        visibility,
        initialFiles,
      });
      navigate(`/repo/${res.data.repositoryID}`);
    } catch (err) {
      setError(
        err.response?.data?.error || "Failed to create repository."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 680, margin: "32px auto", padding: "0 20px" }}>
        <div className="gf-panel" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <RepoIcon size={22} /> Create a New Repository
          </h2>
          <p className="gf-muted" style={{ marginBottom: 20 }}>
            Automatically initializes the <code>main</code> branch, computes SHA-256 file
            hashes, and records the initial commit in MongoDB.
          </p>

          {error && <div className="gf-alert gf-alert-error">{error}</div>}

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div>
              <label className="label" htmlFor="repo-name">
                Repository Name *
              </label>
              <input
                id="repo-name"
                className="input"
                type="text"
                placeholder="e.g. gitforge-demo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="repo-desc">
                Description
              </label>
              <input
                id="repo-desc"
                className="input"
                type="text"
                placeholder="Short summary of your repository"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "10px 14px",
                  borderRadius: 6,
                  border: `1px solid ${visibility ? "#58a6ff" : "#30363d"}`,
                  background: "#0d1117",
                  flex: 1,
                }}
              >
                <input
                  type="radio"
                  checked={visibility === true}
                  onChange={() => setVisibility(true)}
                />
                <GlobeIcon size={16} />
                <div>
                  <div style={{ fontWeight: 600 }}>Public</div>
                  <div className="gf-muted">Anyone can view and inspect commits</div>
                </div>
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  padding: "10px 14px",
                  borderRadius: 6,
                  border: `1px solid ${!visibility ? "#58a6ff" : "#30363d"}`,
                  background: "#0d1117",
                  flex: 1,
                }}
              >
                <input
                  type="radio"
                  checked={visibility === false}
                  onChange={() => setVisibility(false)}
                />
                <LockIcon size={16} />
                <div>
                  <div style={{ fontWeight: 600 }}>Private</div>
                  <div className="gf-muted">Only you can access this repository</div>
                </div>
              </label>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                checked={includeStarter}
                onChange={(e) => setIncludeStarter(e.target.checked)}
              />
              Initialize with <code>README.md</code> & <code>src/index.js</code> starter tree
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="gf-btn"
                onClick={() => navigate("/")}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="gf-btn gf-btn-primary"
                disabled={loading}
              >
                {loading ? "Initializing..." : "Create Repository"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateRepo;
