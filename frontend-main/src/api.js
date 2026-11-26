import axios from "axios";

const rawBase = (import.meta.env.VITE_API_URL || "/api").trim().replace(/\/+$/, "");
export const API_BASE_URL =
  rawBase.startsWith("http") && !rawBase.endsWith("/api")
    ? `${rawBase}/api`
    : rawBase;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
