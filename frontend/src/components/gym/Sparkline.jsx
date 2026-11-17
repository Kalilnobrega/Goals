const WIDTH = 96;
const HEIGHT = 28;

export default function Sparkline({ values, className }) {
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0;
  const points = values.map((v, i) => [values.length > 1 ? i * step : WIDTH / 2, HEIGHT - 3 - (v / max) * (HEIGHT - 6)]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${HEIGHT} L${points[0][0].toFixed(1)},${HEIGHT} Z`;
  const [lastX, lastY] = points.at(-1);

  return (
    <svg className={className} viewBox={`-3 0 ${WIDTH + 6} ${HEIGHT}`} width={WIDTH} height={HEIGHT} aria-hidden="true">
      <path d={area} fill="var(--gym-accent-soft)" />
      <path d={line} fill="none" stroke="var(--gym-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill="var(--gym-accent)" />
    </svg>
  );
}
