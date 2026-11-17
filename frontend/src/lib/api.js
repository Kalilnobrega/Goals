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

const cache = new Map();
let cacheGeneration = 0;

function clearCache() {
  cache.clear();
  cacheGeneration += 1;
}

function currentToken() {
  return typeof window !== "undefined" ? getToken() : null;
}

export function peekCache(key) {
  const entry = cache.get(key);
  return entry && entry.token === currentToken() ? entry.data : undefined;
}

function cachedGet(key, url) {
  const token = currentToken();
  const entry = cache.get(key);
  if (entry?.promise && entry.token === token) return entry.promise;

  const generation = cacheGeneration;
  const previous = entry?.token === token ? entry.data : undefined;
  const promise = api
    .get(url)
    .then((r) => {
      if (generation === cacheGeneration) cache.set(key, { token, data: r.data });
      return r.data;
    })
    .catch((err) => {
      if (generation === cacheGeneration) {
        if (previous === undefined) cache.delete(key);
        else cache.set(key, { token, data: previous });
      }
      throw err;
    });
  cache.set(key, { token, data: previous, promise });
  return promise;
}

// Se o access token expirar (401), tenta renovar com o refresh token antes de deslogar
let refreshPromise = null;

api.interceptors.response.use(
  (res) => {
    if (res.config?.method && res.config.method !== "get") clearCache();
    return res;
  },
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
// Retorna { id, email, name, has_password } (UserResponseSchema)
export const getMe = () => api.get("/auth/me").then((r) => r.data);
export const googleAuth = (token) =>
  api.post("/auth/google", { token }).then((r) => r.data);
export const getStreak = () => cachedGet("streak", "/auth/me/streak");
export const forgotPassword = (email) =>
  api.post("/auth/forgot-password", { email }).then((r) => r.data);
export const resetPassword = (token, newPassword) =>
  api
    .post("/auth/reset-password", { token, new_password: newPassword })
    .then((r) => r.data);
export const updateName = (name) =>
  api.patch("/auth/me", { name }).then((r) => r.data);
export const changePassword = (currentPassword, newPassword) =>
  api
    .post("/auth/me/password", {
      current_password: currentPassword,
      new_password: newPassword,
    })
    .then((r) => r.data);
export const deleteAccount = (password) =>
  api.delete("/auth/me", { data: { password } }).then((r) => r.data);
export const logout = (refreshToken) =>
  api.post("/auth/logout", { refresh_token: refreshToken }).then((r) => r.data);

// ── Goals ──────────────────────────────────────────────
export const getGoals = (status) =>
  status
    ? api.get("/goals/", { params: { status } }).then((r) => r.data)
    : cachedGet("goals", "/goals/");
export const getGoal = (id) => api.get(`/goals/${id}`).then((r) => r.data);
export const getGoalOverview = (id) => cachedGet(`overview:${id}`, `/goals/${id}/overview`);
export const createGoal = (data) =>
  api.post("/goals/", data).then((r) => r.data);
export const updateGoal = (id, data) =>
  api.put(`/goals/${id}`, { ...data, id: Number(id) }).then((r) => r.data);
export const deleteGoal = (id) =>
  api.delete(`/goals/${id}`).then((r) => r.data);
export const reorderGoals = (ids) =>
  api.put("/goals/order", { ids }).then((r) => r.data);
export const getGoalCycles = (id) =>
  api.get(`/goals/${id}/cycles`).then((r) => r.data);
export const getGoalProgress = (id) =>
  api.get(`/goals/${id}/progress`).then((r) => r.data);
export const getGoalEntries = (id) =>
  api.get(`/goals/${id}/entries`).then((r) => r.data);
export const addGoalEntry = (id, data) =>
  api.post(`/goals/${id}/entries`, data).then((r) => r.data);
export const deleteGoalEntry = (id, entryId) =>
  api.delete(`/goals/${id}/entries/${entryId}`).then((r) => r.data);

export const getSuperGoals = () => cachedGet("superGoals", "/super-goals/");
export const getSuperGoal = (id) =>
  api.get(`/super-goals/${id}`).then((r) => r.data);
export const createSuperGoal = (data) =>
  api.post("/super-goals/", data).then((r) => r.data);
export const renameSuperGoal = (id, title) =>
  api.put(`/super-goals/${id}`, { title }).then((r) => r.data);
export const deleteSuperGoal = (id) =>
  api.delete(`/super-goals/${id}`).then((r) => r.data);
export const reorderSuperGoals = (ids) =>
  api.put("/super-goals/order", { ids }).then((r) => r.data);
export const addGoalsToSuperGoal = (id, goalIds) =>
  api.post(`/super-goals/${id}/goals`, { goal_ids: goalIds }).then((r) => r.data);
export const removeGoalFromSuperGoal = (id, goalId) =>
  api.delete(`/super-goals/${id}/goals/${goalId}`).then((r) => r.data);

// ── Tasks ──────────────────────────────────────────────
export const getTodayTasks = () => cachedGet("today", "/tasks/today");
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
      recurrence_weekdays: data.recurrence_weekdays,
      max_recurrences: data.max_recurrences,
    })
    .then((r) => r.data);
export const deleteTask = (taskId) =>
  api.delete(`/tasks/${taskId}`).then((r) => r.data);
export const reorderTasks = (goalId, ids) =>
  api.put(`/tasks/goal/${goalId}/order`, { ids }).then((r) => r.data);
export const toggleTask = (taskId) =>
  api.patch(`/tasks/${taskId}/toggle`).then((r) => r.data);

// ── Stats ──────────────────────────────────────────────
export const getStats = () => cachedGet("stats", "/stats/");

// ── Groups ─────────────────────────────────────────────
export const createGroup = (goalId, kind) =>
  api.post("/groups/", { goal_id: Number(goalId), kind }).then((r) => r.data);
export const getGroup = (groupId) =>
  api.get(`/groups/${groupId}`).then((r) => r.data);
export const createInvite = (groupId) =>
  api.post(`/groups/${groupId}/invites`).then((r) => r.data);
export const previewInvite = (token) =>
  api.get(`/groups/invites/${token}`).then((r) => r.data);
export const acceptInvite = (token) =>
  api.post(`/groups/invites/${token}/accept`).then((r) => r.data);
export const changeMemberRole = (groupId, userId, role) =>
  api.patch(`/groups/${groupId}/members/${userId}`, { role }).then((r) => r.data);
export const transferLeadership = (groupId, userId) =>
  api.post(`/groups/${groupId}/transfer`, { user_id: userId }).then((r) => r.data);
export const removeMember = (groupId, userId) =>
  api.delete(`/groups/${groupId}/members/${userId}`).then((r) => r.data);

// ── GymGoals ───────────────────────────────────────────
export const getExercises = () => cachedGet("fitnessExercises", "/fitness/exercises");
export const createExercise = (data) =>
  api.post("/fitness/exercises", data).then((r) => r.data);
export const updateExercise = (id, data) =>
  api.patch(`/fitness/exercises/${id}`, data).then((r) => r.data);
export const deleteExercise = (id) =>
  api.delete(`/fitness/exercises/${id}`).then((r) => r.data);
export const getWorkouts = () => cachedGet("fitnessWorkouts", "/fitness/workouts");
export const getWorkout = (id) => cachedGet(`fitnessWorkout:${id}`, `/fitness/workouts/${id}`);
export const createWorkout = (data) =>
  api.post("/fitness/workouts", data).then((r) => r.data);
export const updateWorkout = (id, data) =>
  api.put(`/fitness/workouts/${id}`, data).then((r) => r.data);
export const deleteWorkout = (id) =>
  api.delete(`/fitness/workouts/${id}`).then((r) => r.data);
export const HISTORY_PAGE = 20;
export const getHistory = (offset = 0) =>
  offset
    ? api.get("/fitness/sessions", { params: { limit: HISTORY_PAGE, offset } }).then((r) => r.data)
    : cachedGet("fitnessHistory", `/fitness/sessions?limit=${HISTORY_PAGE}`);
export const getActiveSession = () => api.get("/fitness/sessions/active").then((r) => r.data);
export const getSession = (id) => api.get(`/fitness/sessions/${id}`).then((r) => r.data);
export const startSession = (workoutId) =>
  api.post("/fitness/sessions", { workout_id: workoutId ?? null }).then((r) => r.data);
export const finishSession = (id, completedAt) =>
  api.post(`/fitness/sessions/${id}/finish`, { completed_at: completedAt ?? null }).then((r) => r.data);
export const deleteSession = (id) =>
  api.delete(`/fitness/sessions/${id}`).then((r) => r.data);
export const reorderSession = (id, exerciseIds) =>
  api.put(`/fitness/sessions/${id}/order`, { exercise_ids: exerciseIds }).then((r) => r.data);
export const addSessionExercise = (sessionId, exerciseId) =>
  api.post(`/fitness/sessions/${sessionId}/exercises`, { exercise_id: exerciseId }).then((r) => r.data);
export const updateSessionExercise = (id, data) =>
  api.patch(`/fitness/session-exercises/${id}`, data).then((r) => r.data);
export const removeSessionExercise = (id) =>
  api.delete(`/fitness/session-exercises/${id}`).then((r) => r.data);
export const addSet = (itemId, data) =>
  api.post(`/fitness/session-exercises/${itemId}/sets`, data).then((r) => r.data);
export const updateSet = (id, data) =>
  api.patch(`/fitness/sets/${id}`, data).then((r) => r.data);
export const deleteSet = (id) =>
  api.delete(`/fitness/sets/${id}`).then((r) => r.data);
export const getProgressExercises = () => cachedGet("fitnessProgress", "/fitness/progress/exercises");
export const getExerciseProgress = (id) =>
  cachedGet(`fitnessProgress:${id}`, `/fitness/exercises/${id}/progress`);
export const getBodyWeights = () => cachedGet("fitnessBodyWeight", "/fitness/body-weight");
export const logBodyWeight = (data) =>
  api.post("/fitness/body-weight", data).then((r) => r.data);
export const updateBodyWeight = (id, data) =>
  api.patch(`/fitness/body-weight/${id}`, data).then((r) => r.data);
export const deleteBodyWeight = (id) =>
  api.delete(`/fitness/body-weight/${id}`).then((r) => r.data);
export const getFitnessOverview = () => cachedGet("fitnessOverview", "/fitness/overview");
export const getCalendar = (month) =>
  cachedGet(`fitnessCalendar:${month}`, `/fitness/calendar?month=${month}`);
export const getFitnessStats = (period) => cachedGet(`fitnessStats:${period}`, `/fitness/stats?period=${period}`);
export const getPlans = () => cachedGet("fitnessPlans", "/fitness/plans");
export const getPlan = (id) => cachedGet(`fitnessPlan:${id}`, `/fitness/plans/${id}`);
export const createPlan = (data) => api.post("/fitness/plans", data).then((r) => r.data);
export const updatePlan = (id, data) => api.put(`/fitness/plans/${id}`, data).then((r) => r.data);
export const deletePlan = (id) => api.delete(`/fitness/plans/${id}`).then((r) => r.data);
export const activatePlan = (id) => api.post(`/fitness/plans/${id}/activate`).then((r) => r.data);
export const deactivatePlan = (id) => api.post(`/fitness/plans/${id}/deactivate`).then((r) => r.data);
