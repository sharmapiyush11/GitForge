import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../api";
import { useAuth } from "../../useAuth";
import logo from "../../assets/github-mark-white.svg";
import "./auth.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setCurrentUser, setUsername } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email/username and password.");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/login", {
        email: email.trim(),
        password,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      if (res.data.user?.username) {
        localStorage.setItem("username", res.data.user.username);
        setUsername(res.data.user.username);
      }
      setCurrentUser(res.data.userId);
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.message || "Invalid credentials. Please try again."
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
          <h1>Sign in to GitForge</h1>
          <p className="login-subtitle">
            Git-Based Version Control & Repository Management System
          </p>
        </div>

        <form className="login-box" onSubmit={handleLogin}>
          {error && <div className="gf-alert gf-alert-error" style={{ width: "100%" }}>{error}</div>}

          <div className="form-group">
            <label className="label" htmlFor="Email">
              Email or Username
            </label>
            <input
              autoComplete="username"
              name="Email"
              id="Email"
              className="input"
              type="text"
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
              autoComplete="current-password"
              name="Password"
              id="Password"
              className="input"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="submit-btn"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="pass-box">
          <p style={{ margin: 0 }}>
            New to GitForge? <Link to="/signup">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
