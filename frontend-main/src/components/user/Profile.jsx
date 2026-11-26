import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RepoIcon, StarIcon, GitCommitIcon } from "@primer/octicons-react";
import api from "../../api";
import Navbar from "../Navbar";
import HeatMapProfile from "./HeatMap";
import "./profile.css";

const Profile = () => {
  const navigate = useNavigate();
  const [userDetails, setUserDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserDetails = async () => {
      const userId = localStorage.getItem("userId");
      if (!userId) return;
      try {
        const response = await api.get(`/userProfile/${userId}`);
        setUserDetails(response.data);
      } catch (err) {
        console.error("Cannot fetch user details:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUserDetails();
  }, []);

  return (
    <>
      <Navbar />
      <div className="profile-page-wrapper">
        <aside className="user-profile-section">
          <div className="profile-avatar">
            {(userDetails?.username || "G").slice(0, 2).toUpperCase()}
          </div>
          <h2 className="user-name">{userDetails?.username || "Developer"}</h2>
          <p className="gf-muted">{userDetails?.email}</p>
          <p style={{ fontSize: "0.9rem", color: "#c9d1d9", marginTop: 8 }}>
            {userDetails?.bio || "Building with GitForge custom version control."}
          </p>

          <div className="profile-stats">
            <div>
              <strong>{userDetails?.repositories?.length || 0}</strong>
              <span>Repositories</span>
            </div>
            <div>
              <strong>{userDetails?.totalCommits || 0}</strong>
              <span>Commits</span>
            </div>
            <div>
              <strong>{userDetails?.starRepos?.length || 0}</strong>
              <span>Starred</span>
            </div>
          </div>

          <button
            type="button"
            className="gf-btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
            onClick={() => navigate("/starred")}
          >
            <StarIcon size={15} /> View Starred Repositories
          </button>
        </aside>

        <main className="profile-main-section">
          {loading ? (
            <div className="gf-panel">Loading profile...</div>
          ) : (
            <>
              <div className="gf-panel" style={{ marginBottom: 20 }}>
                <HeatMapProfile activity={userDetails?.activity || []} />
              </div>

              <div className="gf-panel">
                <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <RepoIcon size={16} /> Your Repositories
                </h3>
                {(userDetails?.repositories || []).length === 0 ? (
                  <p className="gf-muted">
                    No repositories yet.{" "}
                    <Link to="/create">Create one now</Link>.
                  </p>
                ) : (
                  <div className="repo-card-wrapper">
                    {userDetails.repositories.map((repo) => (
                      <Link
                        key={repo._id}
                        to={`/repo/${repo._id}`}
                        className="repo"
                      >
                        <div className="repo-name">{repo.name}</div>
                        <div className="description">
                          {repo.description || "GitForge managed repository"}
                        </div>
                        <div className="gf-muted">
                          <GitCommitIcon size={13} />{" "}
                          {repo.currentBranch || "main"}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
};

export default Profile;
