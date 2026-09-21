import styles from './celebrate.module.css';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playTone(ctx, freq, startTime, duration, gain, type) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function playTaskSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, 880, now, 0.12, 0.12, 'sine');
  playTone(ctx, 1320, now + 0.05, 0.15, 0.1, 'sine');
}

function playGoalSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  playTone(ctx, 523.25, now, 0.18, 0.14, 'triangle');
  playTone(ctx, 659.25, now + 0.1, 0.18, 0.14, 'triangle');
  playTone(ctx, 783.99, now + 0.2, 0.28, 0.16, 'triangle');
  playTone(ctx, 1046.5, now + 0.32, 0.35, 0.12, 'triangle');
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function burstAt(x, y) {
  if (typeof document === 'undefined') return;
  const container = document.createElement('div');
  container.className = styles.burstContainer;
  container.style.left = `${x}px`;
  container.style.top = `${y}px`;
  document.body.appendChild(container);

  const count = 10;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = styles.burstParticle;
    const angle = (Math.PI * 2 * i) / count + randomBetween(-0.2, 0.2);
    const distance = randomBetween(24, 46);
    p.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    p.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    p.style.background = COLORS[i % COLORS.length];
    container.appendChild(p);
  }

  setTimeout(() => container.remove(), 700);
}

function fireConfetti() {
  if (typeof document === 'undefined') return;
  const container = document.createElement('div');
  container.className = styles.confettiContainer;
  document.body.appendChild(container);

  const count = 60;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = styles.confettiPiece;
    p.style.left = `${randomBetween(0, 100)}%`;
    p.style.background = COLORS[i % COLORS.length];
    p.style.setProperty('--drift', `${randomBetween(-80, 80)}px`);
    p.style.setProperty('--rot', `${randomBetween(180, 720)}deg`);
    p.style.animationDelay = `${randomBetween(0, 0.3)}s`;
    p.style.animationDuration = `${randomBetween(1.4, 2.2)}s`;
    container.appendChild(p);
  }

  setTimeout(() => container.remove(), 2600);
}

export function celebrateTask(x, y) {
  playTaskSound();
  burstAt(x, y);
}

export function celebrateGoal() {
  playGoalSound();
  fireConfetti();
}
