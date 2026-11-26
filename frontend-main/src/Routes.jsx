import { useEffect } from "react";
import { useNavigate, useRoutes, useLocation } from "react-router-dom";

import Dashboard from "./components/dashboard/Dashboard";
import Profile from "./components/user/Profile";
import StarredRepos from "./components/user/StarredRepos";
import Login from "./components/auth/Login";
import Signup from "./components/auth/Signup";
import CreateRepo from "./components/repo/CreateRepo";
import RepoWorkspace from "./components/repo/RepoWorkspace";
import { useAuth } from "./useAuth";

const ProjectRoutes = () => {
  const { currentUser, setCurrentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const userIdFromStorage = localStorage.getItem("userId");
    const token = localStorage.getItem("token");

    if (userIdFromStorage && !currentUser) {
      setCurrentUser(userIdFromStorage);
    }

    const publicPaths = ["/auth", "/signup"];
    if (!userIdFromStorage || !token) {
      if (!publicPaths.includes(location.pathname)) {
        navigate("/auth");
      }
    } else if (publicPaths.includes(location.pathname)) {
      navigate("/");
    }
  }, [currentUser, location.pathname, navigate, setCurrentUser]);

  return useRoutes([
    { path: "/", element: <Dashboard /> },
    { path: "/auth", element: <Login /> },
    { path: "/signup", element: <Signup /> },
    { path: "/profile", element: <Profile /> },
    { path: "/create", element: <CreateRepo /> },
    { path: "/repo/:id", element: <RepoWorkspace /> },
    { path: "/starred", element: <StarredRepos /> },
    { path: "/repo", element: <StarredRepos /> },
  ]);
};

export default ProjectRoutes;
