"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  MoreVertical,
  Trash2,
  RotateCcw,
  Clock,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { showToast } from "@/components/shared/toast-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { friendlyError } from "@/lib/friendly-error";
import { plural } from "@/lib/i18n/plural";

interface Document {
  id: string;
  title: string;
  iconEmoji: string | null;
  updatedAt: string;
  createdBy: string | null;
  canDeletePermanently?: boolean;
}

function formatRelativeTime(timestamp: string, t: (path: string) => string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return t("archive.minutesAgo").replace("{n}", String(minutes));
  if (hours < 24) return t("archive.hoursAgo").replace("{n}", String(hours));
  return t("archive.daysAgo").replace("{n}", String(days));
}

export default function ArchivePage() {
  const t = useT();
  const router = useRouter();
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Document | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchArchivedDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/docs/archived", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch archived docs: ${res.status}`);
      setDocs(await res.json());
      setLoadFailed(false);
    } catch (error) {
      console.error("Failed to fetch archived docs:", error);
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- false positive: every setState in fetchArchivedDocs runs after an await.
    void fetchArchivedDocs();
  }, [fetchArchivedDocs]);

  const handleRestoreDoc = async (docId: string) => {
    setRestoringId(docId);
    try {
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showToast.error(friendlyError(body, t, t("feedback.docRestoreFailed")));
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      showToast.success(t("feedback.docRestored"), {
        action: {
          label: t("feedback.openDoc"),
          onClick: () => router.push(`/dashboard/docs/${docId}`),
        },
      });
    } catch (error) {
      console.error("Failed to restore doc:", error);
      showToast.error(t("feedback.docRestoreFailed"));
    } finally {
      setRestoringId(null);
    }
  };

  const deletePermanently = async (doc: Document) => {
    try {
      const res = await fetch(`/api/docs/${doc.id}?permanent=1`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showToast.error(friendlyError(body, t, t("feedback.docDeleteFailed")));
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      showToast.success(t("feedback.docDeleted"));
    } catch (error) {
      console.error("Failed to delete doc:", error);
      showToast.error(t("feedback.docDeleteFailed"));
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <SidebarTrigger />
        <Button asChild variant="ghost" size="icon" aria-label={t("archive.backToDocs")}>
          <Link href="/dashboard/docs">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Archive className="size-5 text-muted-foreground" />
            {t("archive.title")}
          </h1>
          {!loadFailed && (
            <p className="text-sm text-muted-foreground">
              {plural(t, "feedback.archivedCount", docs.length)}
            </p>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : loadFailed ? (
          <div role="alert" className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-foreground">{t("feedback.archiveLoadFailed")}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoading(true);
                void fetchArchivedDocs();
              }}
            >
              {t("ux.retry")}
            </Button>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Archive className="size-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("archive.emptyTitle")}</h2>
            <p className="text-muted-foreground mb-4">
              {t("archive.emptyDesc")}
            </p>
            <Button asChild>
              <Link href="/dashboard/docs">{t("archive.backToDocs")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {docs.map((doc) => (
              <Card
                key={doc.id}
                data-testid="archived-doc"
                data-doc-id={doc.id}
                className="group opacity-90"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{doc.iconEmoji || "📄"}</span>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("feedback.docActions")}
                          className="size-8 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void handleRestoreDoc(doc.id)}>
                          <RotateCcw className="size-4 mr-2" />
                          {t("archive.restore")}
                        </DropdownMenuItem>
                        {doc.canDeletePermanently !== false && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onSelect={() => setPendingDelete(doc)}
                          >
                            <Trash2 className="size-4 mr-2" />
                            {t("archive.deletePermanently")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-medium truncate mb-2">{doc.title}</h3>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatRelativeTime(doc.updatedAt, t)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={restoringId === doc.id}
                      onClick={() => void handleRestoreDoc(doc.id)}
                    >
                      {restoringId === doc.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3" />
                      )}
                      {t("archive.restore")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("archive.deletePermanently")}
        description={t("archive.confirmDelete")}
        confirmLabel={t("archive.deletePermanently")}
        destructive
        onConfirm={async () => {
          if (pendingDelete) await deletePermanently(pendingDelete);
        }}
      />
    </div>
  );
}
