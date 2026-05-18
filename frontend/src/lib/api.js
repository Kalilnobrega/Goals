import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Injeta o token em todas as requisições automaticamente
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Se o token expirar (401), redireciona para o login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
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
