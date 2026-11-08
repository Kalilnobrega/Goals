'use client';
import { useEffect } from 'react';

const PENDING = '[data-reveal]:not([data-revealed])';
const STAGGER_MS = 45;
const MAX_STAGGER_STEPS = 6;

export default function RevealObserver() {
  useEffect(() => {
    const reveal = (elements) => {
      elements.forEach((el, index) => {
        const delay = `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms`;
        el.style.setProperty('--reveal-delay', delay);
        el.style.setProperty('--enter-delay', delay);
        el.dataset.revealed = '';
      });
    };

    if (!('IntersectionObserver' in window)) {
      const revealAll = () => reveal([...document.querySelectorAll(PENDING)]);
      revealAll();
      const fallback = new MutationObserver(revealAll);
      fallback.observe(document.body, { childList: true, subtree: true });
      return () => fallback.disconnect();
    }

    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).map(e => e.target);
      visible.forEach(el => io.unobserve(el));
      reveal(visible);
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });

    const watch = (root) => {
      if (root.nodeType !== 1) return;
      if (root.matches(PENDING)) io.observe(root);
      root.querySelectorAll(PENDING).forEach(el => io.observe(el));
    };

    watch(document.body);
    const mo = new MutationObserver((mutations) => {
      mutations.forEach(m => m.addedNodes.forEach(watch));
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
