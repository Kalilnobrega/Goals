import f from '../styles/forms.module.css';

export function shakeInvalid(event) {
  const field = event.target;
  field.classList.remove(f.shake);
  void field.offsetWidth;
  field.classList.add(f.shake);
  field.addEventListener('animationend', () => field.classList.remove(f.shake), { once: true });
}
