/**
 * Salva o token tanto no localStorage (uso client-side)
 * quanto em um cookie (lido pelo middleware Next.js no SSR).
 */
export function saveToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('token', token);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userName');
  document.cookie = 'token=; path=/; max-age=0';
}

export function signOut() {
  clearToken();
  if (typeof window === 'undefined') return;
  try {
    Object.keys(localStorage).filter((key) => key.startsWith('gym')).forEach((key) => localStorage.removeItem(key));
  } catch {}
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function isLoggedIn() {
  return !!getToken();
}

// ── Refresh token ────────────────────────────────────
export function saveRefreshToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('refreshToken', token);
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

// ── Nome do usuário ────────────────────────────────────
export function saveUserName(name) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('userName', name);
}

export function getUserName() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('userName') || '';
}