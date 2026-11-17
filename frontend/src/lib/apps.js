const KEY = 'lastApp';

export const APP_HOMES = { goals: '/', gym: '/gym' };

export function getLastApp() {
  try {
    const value = localStorage.getItem(KEY);
    return value in APP_HOMES ? value : null;
  } catch {
    return null;
  }
}

export function saveLastApp(app) {
  try {
    localStorage.setItem(KEY, app);
  } catch {}
}

function safeFrom() {
  const from = new URLSearchParams(window.location.search).get('from');
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null;
  return from === '/' ? null : from;
}

export function homeAfterLogin() {
  const lastApp = getLastApp();
  return safeFrom() ?? (lastApp ? APP_HOMES[lastApp] : '/apps');
}
