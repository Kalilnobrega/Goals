import axios from "axios";
import { getToken, saveToken, getRefreshToken, saveRefreshToken, clearToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Injeta o token em todas as requisições automaticamente
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se o access token expirar (401), tenta renovar com o refresh token antes de deslogar
let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;

    if (
      err.response?.status === 401 &&
      typeof window !== "undefined" &&
      originalRequest &&
      !originalRequest._retry
    ) {
      const refreshToken = getRefreshToken();

      if (refreshToken) {
        originalRequest._retry = true;
        try {
          if (!refreshPromise) {
            refreshPromise = axios
              .post(`${API_BASE}/auth/refresh`, { refresh_token: refreshToken })
              .then((r) => r.data)
              .finally(() => {
                refreshPromise = null;
              });
          }
          const data = await refreshPromise;
          saveToken(data.access_token);
          saveRefreshToken(data.refresh_token);
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return api(originalRequest);
        } catch {
          clearToken();
          window.location.href = "/login";
          return Promise.reject(err);
        }
      }

      clearToken();
      window.location.href = "/login";
    }

    return Promise.reject(err);
  }
);

// ── Auth ───────────────────────────────────────────────
// Retorna { id, email, name } (UserResponseSchema)
export const getMe = () => api.get("/auth/me").then((r) => r.data);
export const googleAuth = (token) =>
  api.post("/auth/google", { token }).then((r) => r.data);
export const getStreak = () => api.get("/auth/me/streak").then((r) => r.data);
export const forgotPassword = (email) =>
  api.post("/auth/forgot-password", { email }).then((r) => r.data);
export const resetPassword = (token, newPassword) =>
  api
    .post("/auth/reset-password", { token, new_password: newPassword })
    .then((r) => r.data);
export const logout = (refreshToken) =>
  api.post("/auth/logout", { refresh_token: refreshToken }).then((r) => r.data);

// ── Goals ──────────────────────────────────────────────
export const getGoals = (status) =>
  api.get("/goals/", { params: status ? { status } : {} }).then((r) => r.data);
export const getGoal = (id) => api.get(`/goals/${id}`).then((r) => r.data);
export const createGoal = (data) =>
  api.post("/goals/", data).then((r) => r.data);
export const updateGoal = (id, data) =>
  api.put(`/goals/${id}`, { ...data, id: Number(id) }).then((r) => r.data);
export const deleteGoal = (id) =>
  api.delete(`/goals/${id}`).then((r) => r.data);
export const getGoalCycles = (id) =>
  api.get(`/goals/${id}/cycles`).then((r) => r.data);

// ── Tasks ──────────────────────────────────────────────
export const getTodayTasks = () => api.get("/tasks/today").then((r) => r.data);
export const getTasks = (goalId) =>
  api.get(`/tasks/goal/${goalId}`).then((r) => r.data);
export const createTask = (goalId, data) =>
  api.post(`/tasks/${goalId}`, data).then((r) => r.data);
export const updateTask = (taskId, data) =>
  api
    .put(`/tasks/${taskId}`, {
      title: data.title,
      status: data.status,
      is_recurring: data.is_recurring,
      recurrence_interval_days: data.recurrence_interval_days,
      max_recurrences: data.max_recurrences,
    })
    .then((r) => r.data);
export const deleteTask = (taskId) =>
  api.delete(`/tasks/${taskId}`).then((r) => r.data);
export const toggleTask = (taskId) =>
  api.patch(`/tasks/${taskId}/toggle`).then((r) => r.data);
