import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("evidence_system_jwt");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("evidence_system_jwt");
    }
    return Promise.reject(err);
  }
);

export default api;
