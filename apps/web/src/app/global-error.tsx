"use client";

import "./globals.css";
import { RouteError } from "@/components/shared/route-error";
import { LocaleProvider } from "@/lib/i18n/provider";

// Replaces the root layout when it fails, so it renders its own <html>/<body>
// and providers. `reset` is not offered: re-rendering a broken root layout
// rarely recovers, a full reload does.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <LocaleProvider>
          <RouteError error={error} homeHref="/" />
        </LocaleProvider>
      </body>
    </html>
  );
}
