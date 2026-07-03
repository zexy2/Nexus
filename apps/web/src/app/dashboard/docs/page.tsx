"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { type Doc as SyncDoc } from "@/lib/sync/zero";
import { useLocalFirstContext } from "@/lib/sync/local-first";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Plus,
  Search,
  Grid3X3,
  List,
  MoreHorizontal,
  Copy,
  Archive,
  Trash2,
  Sparkles,
  Clock,
  Star,
  StarOff,
  Eye,
  SortAsc,
  Calendar,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  EmptyState,
  SkeletonDocumentList,
} from "@/components/shared";
import { showToast } from "@/components/shared/toast-provider";
import { useUIStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/format";
import { cleanDocTitle } from "@/lib/text";
import { useT, useLocale } from "@/lib/i18n/provider";
import { localizeGeneratedCopy } from "@/lib/i18n/generated-copy";
import Link from "next/link";

// Document type
interface Document {
  id: string;
  title: string;
  iconEmoji: string;
  content?: string;
  updatedAt: Date;
  createdAt: Date;
  createdBy: string;
  isAI: boolean;
  isFavorite: boolean;
  tags?: string[];
}

// Map a locally-synced doc (IndexedDB store, numeric timestamps) to the page
// shape, for the local-first read path (instant render + offline from cache).
function fromSyncDoc(d: SyncDoc): Document {
  return {
    id: d.id,
    title: d.title,
    iconEmoji: d.iconEmoji || "📄",
    updatedAt: new Date(d.updatedAt),
    createdAt: new Date(d.createdAt ?? d.updatedAt),
    createdBy: d.createdBy || "User",
    isAI: false,
    isFavorite: false,
  };
}

// Sort options
type SortOption = "updated" | "created" | "title" | "favorite";

// Document card component
function DocumentCard({
  doc,
  viewMode,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleFavorite,
}: {
  doc: Document;
  viewMode: "grid" | "list";
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const t = useT();
  const { locale } = useLocale();
  const formatDate = (date: Date) => formatRelativeDate(date, locale);
  const displayTitle = localizeGeneratedCopy(cleanDocTitle(doc.title), locale);

  if (viewMode === "list") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        className="group relative flex items-center gap-4 border-b border-white/10 py-4 transition-colors"
      >
        {/* Emoji Icon */}
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white/[0.04] flex items-center justify-center">
          <FileText className="w-5 h-5 text-white/70" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/docs/${doc.id}`}
              className="font-medium hover:underline truncate"
            >
              {displayTitle}
            </Link>
            {doc.isFavorite && (
              <Star className="w-3.5 h-3.5 text-white fill-white flex-shrink-0" />
            )}
            {doc.isAI && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-white/10 text-white/70 text-xs rounded-full flex-shrink-0">
                <Sparkles className="w-3 h-3" />
                AI
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(doc.updatedAt)}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {doc.createdBy}
            </span>
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex items-center gap-1">
                {doc.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1"
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-white/10"
                      onClick={() => onToggleFavorite(doc.id)}
                    >
                      {doc.isFavorite ? (
                        <StarOff className="w-4 h-4" />
                      ) : (
                        <Star className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {doc.isFavorite ? t('docs.favRemove') : t('docs.favAdd')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/10">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 glass-premium border-white/10">
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/dashboard/docs/${doc.id}`}
                      className="flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      {t('common.view')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/dashboard/docs/${doc.id}`}
                      className="flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      {t('common.edit')}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDuplicate(doc.id)}
                    className="flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    {t('common.duplicate')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onArchive(doc.id)}
                    className="flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    {t('common.archive')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(doc.id)}
                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Grid view
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] transition-all duration-200 hover:border-white/20 hover:bg-white/[0.035]"
    >
      {/* Favorite badge */}
      {doc.isFavorite && (
        <motion.div 
          className="absolute top-4 right-4 z-10"
          animate={{ scale: isHovered ? 1.1 : 1 }}
        >
          <Star className="w-4 h-4 text-white fill-white" />
        </motion.div>
      )}

      {/* Card content */}
      <Link href={`/dashboard/docs/${doc.id}`} className="block p-5">
        {/* Icon */}
        <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
          <FileText className="w-6 h-6 text-white/70" />
        </div>

        {/* Title */}
        <h3 className="font-semibold mb-2 line-clamp-2 group-hover:text-white/80 transition-colors">
          {displayTitle}
        </h3>

        {/* Preview text */}
        {doc.content && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {doc.content}
          </p>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatDate(doc.updatedAt)}</span>
        </div>
      </Link>

      {/* Footer with tags and AI badge */}
      <div className="px-5 pb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {doc.isAI && (
            <span className="flex items-center gap-1 px-2 py-1 bg-white/10 text-white/70 text-xs rounded-full">
              <Sparkles className="w-3 h-3" />
              {t('docs.aiBadge')}
            </span>
          )}
          {doc.tags && doc.tags.length > 0 && (
            <span className="px-2 py-1 bg-white/5 border border-white/10 text-muted-foreground text-xs rounded-full">
              {doc.tags[0]}
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-background/95 p-4 backdrop-blur"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-white/10"
                        onClick={(e) => {
                          e.preventDefault();
                          onToggleFavorite(doc.id);
                        }}
                      >
                        {doc.isFavorite ? (
                          <StarOff className="w-4 h-4" />
                        ) : (
                          <Star className="w-4 h-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {doc.isFavorite ? t('docs.favRemove') : t('docs.favAdd')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-white/10"
                        onClick={(e) => {
                          e.preventDefault();
                          onDuplicate(doc.id);
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('common.duplicate')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-white/10"
                    onClick={(e) => e.preventDefault()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 glass-premium border-white/10">
                  <DropdownMenuItem
                    onClick={() => onArchive(doc.id)}
                    className="flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    {t('common.archive')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(doc.id)}
                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocEmoji, setNewDocEmoji] = useState("📄");
  const { engine, userId, workspaceId } = useLocalFirstContext();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("updated");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const { documentsView, setDocumentsView } = useUIStore();
  const t = useT();

  // Fetch documents: local-first (instant cache + offline), then refresh online.
  const fetchDocuments = useCallback(async () => {
    let renderedFromCache = false;
    if (engine && workspaceId) {
      try {
        const local = await engine.query<SyncDoc>("docs", workspaceId);
        const active = local.filter((d) => !d.isArchived);
        if (active.length > 0) {
          setDocuments(active.map(fromSyncDoc));
          setIsLoading(false);
          renderedFromCache = true;
        }
      } catch {
        // Cache miss is non-fatal; fall through to the network.
      }
    }

    if (!renderedFromCache) setIsLoading(true);

    try {
      const res = await fetch("/api/docs");
      if (res.ok) {
        const data = await res.json();
        setDocuments(
          data.map((d: { id: string; title: string; iconEmoji: string | null; updatedAt: string; createdBy: string | null; isAiGenerated?: boolean }) => ({
            id: d.id,
            title: d.title,
            iconEmoji: d.iconEmoji || "📄",
            updatedAt: new Date(d.updatedAt),
            createdAt: new Date(d.updatedAt),
            createdBy: d.createdBy || "User",
            isAI: d.isAiGenerated === true,
            isFavorite: false,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [engine, workspaceId]);

  // Load on mount, and re-read the local store when background sync updates it.
  useEffect(() => {
    fetchDocuments();
    if (!engine || !workspaceId) return;
    return engine.subscribe("docs", async () => {
      try {
        const local = await engine.query<SyncDoc>("docs", workspaceId);
        setDocuments(local.filter((d) => !d.isArchived).map(fromSyncDoc));
      } catch {
        // ignore
      }
    });
  }, [engine, workspaceId, fetchDocuments]);

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let filtered = documents.filter((doc) =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (showFavoritesOnly) {
      filtered = filtered.filter((doc) => doc.isFavorite);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        case "created":
          return b.createdAt.getTime() - a.createdAt.getTime();
        case "title":
          return a.title.localeCompare(b.title, "tr");
        case "favorite":
          if (a.isFavorite === b.isFavorite) return 0;
          return a.isFavorite ? -1 : 1;
        default:
          return 0;
      }
    });

    return filtered;
  }, [documents, searchQuery, sortBy, showFavoritesOnly]);

  // Handlers
  const handleCreateDocument = useCallback(async () => {
    if (!newDocTitle.trim()) {
      showToast.warning(t('docs.toastEnterName'));
      return;
    }

    // Local-first: optimistic insert + queued sync (works offline).
    if (engine && workspaceId && userId) {
      const now = Date.now();
      await engine.mutate<SyncDoc>("docs", "insert", {
        id: crypto.randomUUID(),
        workspaceId,
        title: newDocTitle.trim(),
        content: [],
        iconEmoji: newDocEmoji,
        isArchived: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      setNewDocTitle("");
      setNewDocEmoji("📄");
      setIsCreateOpen(false);
      showToast.success(t('docs.toastCreated'));
      return;
    }

    // Fallback: network create.
    try {
      setIsCreating(true);
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newDocTitle,
          iconEmoji: newDocEmoji,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create document");
      }

      const data = await res.json();

      const newDoc: Document = {
        id: data.id,
        title: data.title,
        iconEmoji: data.iconEmoji || newDocEmoji,
        updatedAt: new Date(data.updatedAt),
        createdAt: new Date(data.updatedAt),
        createdBy: data.createdBy || "User",
        isAI: data.isAiGenerated === true,
        isFavorite: false,
      };

      setDocuments((prev) => [newDoc, ...prev]);
      setNewDocTitle("");
      setNewDocEmoji("📄");
      setIsCreateOpen(false);
      showToast.success(t('docs.toastCreated'));
    } catch (error) {
      console.error("Failed to create document:", error);
      showToast.error(t('docs.toastCreateFailed'));
    } finally {
      setIsCreating(false);
    }
  }, [newDocTitle, newDocEmoji, engine, workspaceId, userId, t]);

  const handleDuplicate = useCallback(async (id: string) => {
    if (!(engine && workspaceId && userId)) {
      showToast.error(t('docs.toastDupWaiting'));
      return;
    }
    const source = await engine.get<SyncDoc>("docs", id);
    if (!source) return;
    const now = Date.now();
    await engine.mutate<SyncDoc>("docs", "insert", {
      id: crypto.randomUUID(),
      workspaceId,
      title: `${source.title} (Kopya)`,
      content: source.content ?? [],
      iconEmoji: source.iconEmoji,
      isArchived: false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    showToast.success(t('docs.toastDuplicated'));
  }, [engine, workspaceId, userId, t]);

  // Soft-delete/archive: mark the doc archived locally and queue the sync. This
  // also fixes a prior bug where delete/archive only updated React state and
  // never persisted (docs reappeared on reload).
  const archiveDoc = useCallback(async (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (!engine) return;
    const existing = await engine.get<SyncDoc>("docs", id);
    if (existing) {
      await engine.mutate<SyncDoc>("docs", "update", {
        ...existing,
        isArchived: true,
        updatedAt: Date.now(),
      });
    }
  }, [engine]);

  const handleArchive = useCallback(async (id: string) => {
    await archiveDoc(id);
    showToast.info(t('docs.toastArchived'));
  }, [archiveDoc, t]);

  const handleDelete = useCallback(async (id: string) => {
    await archiveDoc(id);
    showToast.success(t('docs.toastDeleted'));
  }, [archiveDoc, t]);

  const handleToggleFavorite = useCallback((id: string) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, isFavorite: !d.isFavorite } : d
      )
    );
  }, []);

  // Stats
  const stats = useMemo(() => ({
    total: documents.length,
    favorites: documents.filter((d) => d.isFavorite).length,
    aiGenerated: documents.filter((d) => d.isAI).length,
  }), [documents]);

  return (
    <div className="mx-auto min-h-screen max-w-[1500px] px-4 pb-24 pt-10 md:px-8">
      <header className="mb-8 flex flex-col justify-between gap-5 border-b border-white/10 pb-7 md:flex-row md:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-white/35">
            <FileText className="size-4" />
            {t('docs.label')}
          </div>
          <h1 className="text-3xl font-semibold text-white md:text-4xl">{t('docs.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            {t('docs.description')}
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t('docs.newDoc')}
        </Button>
      </header>

      <section className="mb-8 grid grid-cols-1 gap-px border-y border-white/10 bg-white/10 sm:grid-cols-3">
        {[
          { label: t('docs.statTotal'), value: stats.total, icon: <FileText className="size-4" /> },
          { label: t('docs.statFavorites'), value: stats.favorites, icon: <Star className="size-4" /> },
          { label: t('docs.statAi'), value: stats.aiGenerated, icon: <Sparkles className="size-4" /> },
        ].map((stat) => (
          <div key={stat.label} className="bg-background px-4 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-xs text-white/40">{stat.label}</span>
              <span className="text-white/45">{stat.icon}</span>
            </div>
            <div className="text-3xl font-semibold tabular-nums text-white">{stat.value}</div>
          </div>
        ))}
      </section>

      <section className="mb-6 border-b border-white/10 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center md:gap-4"
        >
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <Input
              placeholder={t('docs.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border-white/10 bg-white/[0.03] pl-10 text-white placeholder:text-white/40"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showFavoritesOnly ? "default" : "outline"}
                    size="icon"
                    onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                    className={cn(
                      "rounded-lg border-white/20",
                      showFavoritesOnly && "bg-amber-500 hover:bg-amber-600 border-amber-500"
                    )}
                  >
                    <Star className={cn("w-4 h-4", showFavoritesOnly && "fill-white")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showFavoritesOnly ? t('docs.showAll') : t('docs.onlyFavorites')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 rounded-lg border-white/20">
                  <SortAsc className="w-4 h-4" />
                  {t('docs.sort')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-black/90 backdrop-blur-xl border-white/10">
                <DropdownMenuItem
                  onClick={() => setSortBy("updated")}
                  className={cn(sortBy === "updated" && "bg-white/10")}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  {t('docs.sortUpdated')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("created")}
                  className={cn(sortBy === "created" && "bg-white/10")}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  {t('docs.sortCreated')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("title")}
                  className={cn(sortBy === "title" && "bg-white/10")}
                >
                  <SortAsc className="w-4 h-4 mr-2" />
                  {t('docs.sortTitle')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("favorite")}
                  className={cn(sortBy === "favorite" && "bg-white/10")}
                >
                  <Star className="w-4 h-4 mr-2" />
                  {t('docs.sortFavorite')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDocumentsView("grid")}
                      className={cn(
                        "p-2 rounded-md transition-colors",
                        documentsView === "grid"
                          ? "bg-white text-black"
                          : "text-muted-foreground hover:text-white"
                      )}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('docs.gridView')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDocumentsView("list")}
                      className={cn(
                        "p-2 rounded-md transition-colors",
                        documentsView === "list"
                          ? "bg-white text-black"
                          : "text-muted-foreground hover:text-white"
                      )}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('docs.listView')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </motion.div>
      </section>

      <section>
        {isLoading ? (
          <SkeletonDocumentList count={6} />
        ) : filteredDocuments.length === 0 ? (
          searchQuery ? (
            <EmptyState
              type="search"
              title={t('docs.searchEmptyTitle')}
              description={`"${searchQuery}"`}
              action={{
                label: t('docs.clearSearch'),
                onClick: () => setSearchQuery(""),
              }}
            />
          ) : (
            <EmptyState
              type="documents"
              title={t('docs.emptyTitle')}
              description={t('docs.emptyDesc')}
              action={{
                label: t('docs.newDoc'),
                onClick: () => setIsCreateOpen(true),
                icon: <Plus className="w-4 h-4" />,
              }}
            />
          )
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            {documentsView === "grid" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <AnimatePresence mode="popLayout">
                  {filteredDocuments.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      viewMode="grid"
                      onDuplicate={handleDuplicate}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="border-y border-white/10">
                <AnimatePresence mode="popLayout">
                  {filteredDocuments.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      viewMode="list"
                      onDuplicate={handleDuplicate}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            <div className="mt-6 text-center text-sm text-white/40">
              {filteredDocuments.length} {t('docs.shown')}
              {showFavoritesOnly && ` ${t('docs.onlyFavoritesSuffix')}`}
            </div>
          </motion.div>
        )}
      </section>

      {/* Create Document Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md bg-black/90 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle>{t('docs.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('docs.dialogDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Title input */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                {t('docs.titleLabel')}
              </label>
              <Input
                placeholder={t('docs.titlePlaceholder')}
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateDocument()}
                className="bg-white/5 border-white/10 rounded-full"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-full border-white/20">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreateDocument}
              disabled={isCreating}
              className="rounded-full"
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
