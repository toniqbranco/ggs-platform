import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="badge">
      <span className="badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
