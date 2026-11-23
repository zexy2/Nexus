"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

/**
 * Shared fallback for the App Router error boundaries (app/error.tsx,
 * app/global-error.tsx, app/dashboard/error.tsx). Next passes `error` and
 * `reset`; `homeHref` picks where the escape link goes.
 */
export function RouteError({
  error,
  reset,
  homeHref = "/",
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  homeHref?: string;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] w-full flex-col items-center justify-center px-6 py-16 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-foreground">{t("ux.errorTitle")}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("ux.errorDesc")}</p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          {t("ux.errorRef")}: {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {reset ? (
          <Button onClick={() => reset()} className="gap-2">
            <RefreshCw className="size-4" />
            {t("ux.retry")}
          </Button>
        ) : (
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="size-4" />
            {t("ux.reload")}
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href={homeHref}>
            {homeHref.startsWith("/dashboard") ? t("ux.goDashboard") : t("ux.goHome")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Body of app/not-found.tsx (client so it can read the persisted locale). */
export function RouteNotFound() {
  const t = useT();
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-foreground">{t("ux.notFoundTitle")}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("ux.notFoundDesc")}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/dashboard">{t("ux.goDashboard")}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">{t("ux.goHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
