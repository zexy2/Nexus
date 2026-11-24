import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

type NexusMarkProps = SVGProps<SVGSVGElement> & {
  size?: number;
  label?: string;
};

/** A compact connection mark for the Nexus plan-to-delivery graph. */
export function NexusMark({ size = 24, label, className, ...props }: NexusMarkProps) {
  const labelled = Boolean(label);

  return (
    <svg
      {...props}
      className={cn("shrink-0", className)}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role={labelled ? "img" : "presentation"}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      <path
        d="M9 12h7c4.4 0 8 3.6 8 8v8c0 4.4 3.6 8 8 8h7"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 36h7c4.4 0 8-3.6 8-8v-8c0-4.4 3.6-8 8-8h7"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="12" r="3.25" fill="currentColor" />
      <circle cx="39" cy="12" r="3.25" fill="currentColor" />
      <circle cx="9" cy="36" r="3.25" fill="currentColor" />
      <circle cx="39" cy="36" r="3.25" fill="currentColor" />
    </svg>
  );
}
