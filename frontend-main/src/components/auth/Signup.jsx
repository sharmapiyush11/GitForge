import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../useAuth";
import logo from "../../assets/github-mark-white.svg";
import "./auth.css";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { setCurrentUser, setUsername } = useAuth();
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    if (!usernameInput.trim() || !email.trim() || password.length < 6) {
      setError("Username, email, and a password of 6+ characters are required.");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/signup", {
        email: email.trim(),
        password,
        username: usernameInput.trim(),
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      localStorage.setItem("username", res.data.user?.username || usernameInput.trim());

      setCurrentUser(res.data.userId);
      setUsername(res.data.user?.username || usernameInput.trim());
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.message || "Signup failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-logo-container">
        <img className="logo-login" src={logo} alt="GitForge Logo" />
      </div>

      <div className="login-box-wrapper">
        <div className="login-heading">
          <h1>Create GitForge Account</h1>
          <p className="login-subtitle">
            Start versioning repositories with SHA-256 & 3-way merge
          </p>
        </div>

        <form className="login-box" onSubmit={handleSignup}>
          {error && <div className="gf-alert gf-alert-error" style={{ width: "100%" }}>{error}</div>}

          <div className="form-group">
            <label className="label" htmlFor="Username">
              Username
            </label>
            <input
              autoComplete="username"
              name="Username"
              id="Username"
              className="input"
              type="text"
              placeholder="piyush-sharma"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="Email">
              Email address
            </label>
            <input
              autoComplete="email"
              name="Email"
              id="Email"
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="Password">
              Password
            </label>
            <input
              autoComplete="new-password"
              name="Password"
              id="Password"
              className="input"
              type="password"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="pass-box">
          <p style={{ margin: 0 }}>
            Already have an account? <Link to="/auth">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
