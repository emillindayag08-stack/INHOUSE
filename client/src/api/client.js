import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("codi_token_v2");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("codi_token_v2");
      localStorage.removeItem("codi_user_v2");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);
