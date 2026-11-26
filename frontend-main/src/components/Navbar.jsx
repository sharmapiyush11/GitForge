import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  RepoIcon,
  PlusIcon,
  PersonIcon,
  SignOutIcon,
  GitBranchIcon,
  StarIcon,
} from "@primer/octicons-react";
import { useAuth } from "../useAuth";
import logo from "../assets/github-mark-white.svg";
import "./navbar.css";

const Navbar = () => {
  const { logout, username } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  return (
    <header className="gf-navbar">
      <div className="gf-navbar-inner">
        <div className="gf-navbar-left">
          <Link to="/" className="gf-brand">
            <img src={logo} alt="GitForge Logo" className="gf-brand-logo" />
            <div>
              <span className="gf-brand-title">GitForge</span>
              <span className="gf-brand-sub">Custom VCS</span>
            </div>
          </Link>

          <nav className="gf-nav-links">
            <Link
              to="/"
              className={location.pathname === "/" ? "active" : ""}
            >
              <RepoIcon size={15} /> Repositories
            </Link>
            <Link
              to="/create"
              className={location.pathname === "/create" ? "active" : ""}
            >
              <PlusIcon size={15} /> New Repo
            </Link>
            <Link
              to="/starred"
              className={location.pathname === "/starred" ? "active" : ""}
            >
              <StarIcon size={15} /> Starred
            </Link>
          </nav>
        </div>

        <div className="gf-navbar-right">
          <span className="gf-badge gf-badge-blue" title="SHA-256 + 3-Way Merge Engine">
            <GitBranchIcon size={12} /> SHA-256 VCS
          </span>
          <Link
            to="/profile"
            className={`gf-nav-user ${
              location.pathname === "/profile" ? "active" : ""
            }`}
          >
            <PersonIcon size={15} /> {username || "Profile"}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="gf-btn"
            style={{ padding: "5px 10px", fontSize: "0.8rem" }}
          >
            <SignOutIcon size={14} /> Logout
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
