"use client";

import { RouteError } from "@/components/shared/route-error";

// Rendered inside the dashboard layout, so navigation and sync stay mounted.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} homeHref="/dashboard" />;
}
