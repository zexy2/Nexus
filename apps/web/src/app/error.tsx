"use client";

import { RouteError } from "@/components/shared/route-error";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-background">
      <RouteError error={error} reset={reset} homeHref="/" />
    </main>
  );
}
