/**
 * Salva o token tanto no localStorage (uso client-side)
 * quanto em um cookie (lido pelo middleware Next.js no SSR).
 */
export function saveToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('token', token);
  document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('userName');
  document.cookie = 'token=; path=/; max-age=0';
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function isLoggedIn() {
  return !!getToken();
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