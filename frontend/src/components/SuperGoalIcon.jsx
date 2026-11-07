export default function SuperGoalIcon({ size = 24, strokeWidth = 2, className, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M7 2.75h10" />
      <path d="M4.75 5.75h14.5" />
      <rect x="2.75" y="8.75" width="18.5" height="12.5" rx="3.25" />
      <circle cx="12" cy="15" r="3.25" />
      <circle cx="12" cy="15" r="0.6" fill="currentColor" />
    </svg>
  );
}
