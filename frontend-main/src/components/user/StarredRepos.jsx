import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StarIcon, RepoIcon } from "@primer/octicons-react";
import api from "../../api";
import Navbar from "../Navbar";

const StarredRepos = () => {
  const [starred, setStarred] = useState([]);
  const [loading, setLoading] = useState(true);
  const userId = localStorage.getItem("userId");

  useEffect(() => {
    api
      .get(`/userProfile/${userId}`)
      .then((res) => setStarred(res.data.starRepos || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 960, margin: "28px auto", padding: "0 20px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StarIcon size={20} /> Starred Repositories
        </h2>
        {loading ? (
          <div className="gf-panel">Loading starred repositories...</div>
        ) : starred.length === 0 ? (
          <div className="gf-panel">
            <p className="gf-muted">
              You have not starred any repositories yet. Explore public repos on
              the <Link to="/">Dashboard</Link>.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {starred.map((repo) => (
              <Link
                key={repo._id}
                to={`/repo/${repo._id}`}
                className="gf-panel"
                style={{ display: "block" }}
              >
                <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>
                  <RepoIcon size={16} /> {repo.name}
                </div>
                <p className="gf-muted" style={{ marginTop: 4 }}>
                  {repo.description || "No description"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default StarredRepos;
