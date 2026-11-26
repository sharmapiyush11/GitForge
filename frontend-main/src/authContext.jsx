import { useState, useEffect } from "react";
import { AuthContext } from "./useAuth";

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() =>
    localStorage.getItem("userId")
  );
  const [username, setUsername] = useState(() =>
    localStorage.getItem("username")
  );

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    const savedName = localStorage.getItem("username");
    if (userId) setCurrentUser(userId);
    if (savedName) setUsername(savedName);
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    setCurrentUser(null);
    setUsername(null);
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, setCurrentUser, username, setUsername, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
