"use client";

/**
 * Admin-only AI usage report (data: GET /api/admin/ai-usage, which enforces
 * ADMIN_EMAILS + verified email; this page only renders what it returns).
 */
import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useLocale } from "@/lib/i18n/provider";
import type { AiUsageReport } from "@/lib/ai/usage-report";

type WindowReport = AiUsageReport["today"];
type LoadState =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; report: AiUsageReport };

async function fetchReport(): Promise<LoadState> {
  try {
    const res = await fetch("/api/admin/ai-usage", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { kind: "forbidden" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ready", report: (await res.json()) as AiUsageReport };
  } catch {
    return { kind: "error" };
  }
}

function useFormatters(locale: string) {
  const intl = locale === "tr" ? "tr-TR" : "en-US";
  const number = new Intl.NumberFormat(intl);
  const percent = new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 1 });
  const usd = new Intl.NumberFormat(intl, { style: "currency", currency: "USD", maximumFractionDigits: 4 });
  const time = new Intl.DateTimeFormat(intl, { dateStyle: "short", timeStyle: "short" });
  return {
    n: (v: number) => number.format(v),
    pct: (v: number) => percent.format(v),
    usd: (v: number) => usd.format(v),
    time: (iso: string | null) => (iso ? time.format(new Date(iso)) : "—"),
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground dark:border-neutral-700">
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b last:border-0 dark:border-neutral-800">
              {row.map((cell, i) => (
                <td key={i} className={`py-2 pr-3 ${i > 0 ? "text-right tabular-nums" : "break-all"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AiUsagePage() {
  const { t, locale } = useLocale();
  const f = useFormatters(locale);
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void fetchReport().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const reload = () => {
    setState({ kind: "loading" });
    void fetchReport().then(setState);
  };

  const windowCard = (title: string, w: WindowReport, configured: boolean) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <Stat label={t("adminUsage.calls")} value={f.n(w.calls)} />
          <Stat label={t("adminUsage.errorRate")} value={`${f.pct(w.errorRate)} (${f.n(w.errors)})`} />
          <Stat label={t("adminUsage.tokens")} value={f.n(w.totalTokens)} />
          <Stat label={t("adminUsage.avgLatency")} value={`${f.n(w.avgLatencyMs)} ms`} />
          <Stat label={t("adminUsage.inputTokens")} value={f.n(w.inputTokens)} />
          <Stat label={t("adminUsage.outputTokens")} value={f.n(w.outputTokens)} />
          <div className="col-span-2 rounded-md bg-muted/60 p-3">
            <p className="text-xs text-muted-foreground">{t("adminUsage.cost")}</p>
            {configured ? (
              <>
                <p className="text-sm font-semibold tabular-nums">{f.usd(w.estimatedCost.usd)}</p>
                {w.estimatedCost.unpricedCalls > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("adminUsage.unpricedCalls").replace("{n}", f.n(w.estimatedCost.unpricedCalls))}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("adminUsage.costNotConfigured")}</p>
            )}
          </div>
        </div>

        {w.calls === 0 ? (
          <p className="text-sm text-muted-foreground">{t("adminUsage.noData")}</p>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("adminUsage.byAgentType")}</h3>
              <Table
                head={[t("adminUsage.agentType"), t("adminUsage.calls"), t("adminUsage.errorRate"), t("adminUsage.tokens")]}
                rows={w.byAgentType.map((r) => [r.agentType, f.n(r.calls), f.pct(r.errorRate), f.n(r.totalTokens)])}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t("adminUsage.byModel")}</h3>
              <Table
                head={[
                  `${t("adminUsage.provider")} / ${t("adminUsage.model")}`,
                  t("adminUsage.calls"),
                  t("adminUsage.errorRate"),
                  t("adminUsage.tokens"),
                  t("adminUsage.avgLatency"),
                ]}
                rows={w.byModel.map((r) => [
                  `${r.provider} / ${r.model}`,
                  f.n(r.calls),
                  f.pct(r.errorRate),
                  f.n(r.totalTokens),
                  `${f.n(r.avgLatencyMs)} ms`,
                ])}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <header className="flex items-center gap-4 border-b border-border dark:border-neutral-800 px-4 md:px-6 py-3 shrink-0">
        <SidebarTrigger />
        <h1 className="text-lg md:text-xl font-semibold">{t("adminUsage.title")}</h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={reload}
          disabled={state.kind === "loading"}
          aria-label={t("common.refresh")}
        >
          <RefreshCw className={`size-4 ${state.kind === "loading" ? "animate-spin" : ""}`} />
          <span className="ml-2 hidden sm:inline">{t("common.refresh")}</span>
        </Button>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-4xl mx-auto py-4 md:py-8 px-4 md:px-6 space-y-4 md:space-y-6">
          <p className="text-sm text-muted-foreground">{t("adminUsage.description")}</p>

          {state.kind === "loading" && (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {state.kind === "forbidden" && <p className="text-sm">{t("adminUsage.forbidden")}</p>}
          {state.kind === "error" && <p className="text-sm text-amber-600">{t("adminUsage.loadError")}</p>}

          {state.kind === "ready" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("adminUsage.limits")}</CardTitle>
                  <CardDescription>{f.time(state.report.generatedAt)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ["globalDaily", state.report.limits.globalDaily],
                        ["globalMinute", state.report.limits.globalMinute],
                      ] as const
                    ).map(([key, l]) => (
                      <div key={key} className="rounded-md bg-muted/60 p-3">
                        <p className="text-xs text-muted-foreground">{t(`adminUsage.${key}`)}</p>
                        <p className="text-sm font-semibold tabular-nums">
                          {f.n(l.used)} / {f.n(l.limit)}
                        </p>
                        <div className="mt-2 h-1.5 rounded bg-muted">
                          <div
                            className="h-1.5 rounded bg-primary"
                            style={{ width: `${Math.min(100, (l.used / Math.max(1, l.limit)) * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("adminUsage.resetsAt")}: {f.time(l.resetAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-medium">{t("adminUsage.perUserLimits")}</h3>
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                      <Stat label={t("adminUsage.userDaily")} value={f.n(state.report.limits.perUser.userDaily)} />
                      <Stat label={t("adminUsage.userMinute")} value={f.n(state.report.limits.perUser.userMinute)} />
                      <Stat label={t("adminUsage.chatDaily")} value={f.n(state.report.limits.perUser.chatDaily)} />
                      <Stat label={t("adminUsage.workflowDaily")} value={f.n(state.report.limits.perUser.workflowDaily)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {windowCard(t("adminUsage.today"), state.report.today, state.report.costEstimateConfigured)}
              {windowCard(t("adminUsage.last7d"), state.report.last7d, state.report.costEstimateConfigured)}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("adminUsage.topUsers")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {state.report.topUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("adminUsage.noData")}</p>
                  ) : (
                    <Table
                      head={[
                        t("adminUsage.user"),
                        t("adminUsage.calls"),
                        t("adminUsage.callsToday"),
                        t("adminUsage.errors"),
                        t("adminUsage.tokens"),
                      ]}
                      rows={state.report.topUsers.map((u) => [
                        u.email ?? u.userId ?? t("adminUsage.deletedUser"),
                        f.n(u.calls),
                        f.n(u.callsToday),
                        f.n(u.errors),
                        f.n(u.totalTokens),
                      ])}
                    />
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
