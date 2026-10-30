type IconName = "arrow" | "globe" | "signal" | "spark";

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "arrow" && <path d="M5 19 19 5M5 5h14v14" />}
      {name === "globe" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0" />
        </>
      )}
      {name === "signal" && (
        <>
          <path d="M4 10v4m4-8v12m4-15v18m4-15v12m4-8v4" />
        </>
      )}
      {name === "spark" && <path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5" />}
    </svg>
  );
}
