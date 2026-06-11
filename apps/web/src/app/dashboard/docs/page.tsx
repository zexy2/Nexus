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
  Edit3,
  SortAsc,
  Calendar,
  User,
} from "lucide-react";

// Premium Components
import {
  PremiumBackground,
  PremiumHeroHeader,
  PremiumStatCard,
} from "@/components/premium";
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

// Emoji picker options
const emojiOptions = [
  "📄", "📋", "📝", "📊", "📈", "📉", "📁", "📂",
  "💡", "🎯", "🚀", "⭐", "🔥", "💎", "🎨", "🔧",
  "📌", "🏷️", "🔖", "📎", "✏️", "🖊️", "📚", "📖",
  "💼", "🗂️", "🗃️", "📦", "🎁", "🏆", "🎪", "🎭",
];

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

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes} dakika önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return date.toLocaleDateString("tr-TR");
  };

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
        className="group relative flex items-center gap-4 p-4 border-b border-white/5 transition-colors"
      >
        {/* Emoji Icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-xl">
          {doc.iconEmoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/docs/${doc.id}`}
              className="font-medium hover:underline truncate"
            >
              {doc.title}
            </Link>
            {doc.isFavorite && (
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
            )}
            {doc.isAI && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-violet-500/20 text-violet-400 text-xs rounded-full flex-shrink-0">
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
                    {doc.isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
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
                      Görüntüle
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/dashboard/docs/${doc.id}/edit`}
                      className="flex items-center gap-2"
                    >
                      <Edit3 className="w-4 h-4" />
                      Düzenle
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDuplicate(doc.id)}
                    className="flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Çoğalt
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onArchive(doc.id)}
                    className="flex items-center gap-2"
                  >
                    <Archive className="w-4 h-4" />
                    Arşivle
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(doc.id)}
                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
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
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative bg-white/[0.02] backdrop-blur-md border border-white/[0.06] rounded-3xl overflow-hidden transition-all duration-300 hover:border-white/20 hover:bg-white/[0.04]"
    >
      {/* Hover glow effect */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        className="absolute inset-0 -z-10 blur-2xl bg-blue-500/10 transition-opacity duration-500"
      />

      {/* Gradient border on hover */}
      <div
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none"
      />

      {/* Favorite badge */}
      {doc.isFavorite && (
        <motion.div 
          className="absolute top-4 right-4 z-10"
          animate={{ scale: isHovered ? 1.1 : 1 }}
        >
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
        </motion.div>
      )}

      {/* Card content */}
      <Link href={`/dashboard/docs/${doc.id}`} className="block p-5">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-4">
          {doc.iconEmoji}
        </div>

        {/* Title */}
        <h3 className="font-semibold mb-2 line-clamp-2 group-hover:text-white/80 transition-colors">
          {doc.title}
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
            <span className="flex items-center gap-1 px-2 py-1 bg-violet-500/20 text-violet-400 text-xs rounded-full">
              <Sparkles className="w-3 h-3" />
              AI Oluşturdu
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
            className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/90 to-transparent pt-10"
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
                      {doc.isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
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
                    <TooltipContent>Çoğalt</TooltipContent>
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
                    Arşivle
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(doc.id)}
                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    Sil
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

  // Fetch documents: local-first (instant cache + offline), then refresh online.
  const fetchDocuments = useCallback(async () => {
    let renderedFromCache = false;
    if (engine) {
      try {
        const local = await engine.query<SyncDoc>("docs");
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
          data.map((d: { id: string; title: string; iconEmoji: string | null; updatedAt: string; createdBy: string | null }) => ({
            id: d.id,
            title: d.title,
            iconEmoji: d.iconEmoji || "📄",
            updatedAt: new Date(d.updatedAt),
            createdAt: new Date(d.updatedAt),
            createdBy: d.createdBy || "User",
            isAI: false,
            isFavorite: false,
          }))
        );
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setIsLoading(false);
    }
  }, [engine]);

  // Load on mount, and re-read the local store when background sync updates it.
  useEffect(() => {
    fetchDocuments();
    if (!engine) return;
    return engine.subscribe("docs", async () => {
      try {
        const local = await engine.query<SyncDoc>("docs");
        setDocuments(local.filter((d) => !d.isArchived).map(fromSyncDoc));
      } catch {
        // ignore
      }
    });
  }, [engine, fetchDocuments]);

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
      showToast.warning("Lütfen döküman adı girin");
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
      showToast.success("Döküman oluşturuldu");
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
        isAI: false,
        isFavorite: false,
      };

      setDocuments((prev) => [newDoc, ...prev]);
      setNewDocTitle("");
      setNewDocEmoji("📄");
      setIsCreateOpen(false);
      showToast.success("Döküman oluşturuldu");
    } catch (error) {
      console.error("Failed to create document:", error);
      showToast.error("Döküman oluşturulamadı");
    } finally {
      setIsCreating(false);
    }
  }, [newDocTitle, newDocEmoji, engine, workspaceId, userId]);

  const handleDuplicate = useCallback(async (id: string) => {
    if (!(engine && workspaceId && userId)) {
      showToast.error("Çoğaltma için bağlantı bekleniyor");
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
    showToast.success("Döküman çoğaltıldı");
  }, [engine, workspaceId, userId]);

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
    showToast.info("Döküman arşivlendi");
  }, [archiveDoc]);

  const handleDelete = useCallback(async (id: string) => {
    await archiveDoc(id);
    showToast.success("Döküman silindi");
  }, [archiveDoc]);

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
    <div className="relative min-h-screen pb-32">
      {/* Premium Animated Background */}
      <PremiumBackground colorScheme="blue-violet" blobCount={3} />

      {/* Content Layer */}
      <div className="relative z-10 px-4 md:px-6 lg:px-8">
        {/* Premium Hero Header */}
        <PremiumHeroHeader
          label="DOCUMENT MANAGEMENT"
          title="Dökümanlar"
          description={
            <>
              <span className="text-white/70 font-medium">{stats.total}</span> döküman
              <span className="mx-2 text-white/20">•</span>
              <span className="text-amber-400/80">{stats.favorites}</span> favori
              <span className="mx-2 text-white/20">•</span>
              <span className="text-violet-400/80">{stats.aiGenerated}</span> AI oluşturdu
            </>
          }
          action={
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="gap-2 rounded-full px-6 bg-white text-black hover:bg-white/90 shadow-lg shadow-white/10"
            >
              <Plus className="w-4 h-4" />
              Yeni Döküman
            </Button>
          }
        />

        {/* Premium Stats Bar */}
        <section className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <PremiumStatCard
              icon={FileText}
              value={stats.total}
              label="Toplam Döküman"
              color="blue"
              delay={0.2}
            />
            <PremiumStatCard
              icon={Star}
              value={stats.favorites}
              label="Favori"
              color="amber"
              delay={0.28}
            />
            <PremiumStatCard
              icon={Sparkles}
              value={stats.aiGenerated}
              label="AI Oluşturdu"
              color="violet"
              delay={0.36}
            />
          </div>
        </section>

        {/* Toolbar */}
        <section className="mb-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4"
          >
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input
                placeholder="Döküman ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/[0.03] border-white/10 rounded-full w-full text-white placeholder:text-white/40"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Favorites filter */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showFavoritesOnly ? "default" : "outline"}
                      size="icon"
                      onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                      className={cn(
                        "rounded-full border-white/20",
                        showFavoritesOnly && "bg-amber-500 hover:bg-amber-600 border-amber-500"
                      )}
                    >
                      <Star className={cn("w-4 h-4", showFavoritesOnly && "fill-white")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {showFavoritesOnly ? "Tümünü göster" : "Sadece favoriler"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Sort dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 rounded-full border-white/20">
                    <SortAsc className="w-4 h-4" />
                    Sırala
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-black/90 backdrop-blur-xl border-white/10">
                  <DropdownMenuItem
                    onClick={() => setSortBy("updated")}
                    className={cn(sortBy === "updated" && "bg-white/10")}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Son güncellenen
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortBy("created")}
                    className={cn(sortBy === "created" && "bg-white/10")}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    Oluşturulma tarihi
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("title")}
                  className={cn(sortBy === "title" && "bg-white/10")}
                >
                  <SortAsc className="w-4 h-4 mr-2" />
                  Başlık (A-Z)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("favorite")}
                  className={cn(sortBy === "favorite" && "bg-white/10")}
                >
                  <Star className="w-4 h-4 mr-2" />
                  Favoriler önce
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View toggle */}
            <div className="flex items-center border border-white/10 rounded-full p-1 bg-white/5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDocumentsView("grid")}
                      className={cn(
                        "p-2 rounded-full transition-colors",
                        documentsView === "grid"
                          ? "bg-white text-black"
                          : "text-muted-foreground hover:text-white"
                      )}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Izgara görünümü</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setDocumentsView("list")}
                      className={cn(
                        "p-2 rounded-full transition-colors",
                        documentsView === "list"
                          ? "bg-white text-black"
                          : "text-muted-foreground hover:text-white"
                      )}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Liste görünümü</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            </div>
          </motion.div>
        </section>

        {/* Content */}
        <section>
          {isLoading ? (
            <SkeletonDocumentList count={6} />
          ) : filteredDocuments.length === 0 ? (
            searchQuery ? (
              <EmptyState
                type="search"
                title="Sonuç bulunamadı"
                description={`"${searchQuery}" araması için döküman bulunamadı`}
                action={{
                  label: "Aramayı temizle",
                  onClick: () => setSearchQuery(""),
                }}
              />
            ) : (
              <EmptyState
                type="documents"
              title="Henüz döküman yok"
              description="İlk dökümanınızı oluşturarak başlayın"
              action={{
                label: "Yeni Döküman",
                onClick: () => setIsCreateOpen(true),
                icon: <Plus className="w-4 h-4" />,
              }}
            />
          )
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {documentsView === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-5">
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
              <div className="glass-premium border-white/10 rounded-2xl overflow-hidden">
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

            {/* Results count */}
            <div className="mt-6 text-center text-sm text-white/40">
              {filteredDocuments.length} döküman gösteriliyor
              {showFavoritesOnly && " (sadece favoriler)"}
            </div>
          </motion.div>
        )}
        </section>
      </div>

      {/* Create Document Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md bg-black/90 backdrop-blur-xl border-white/10">
          <DialogHeader>
            <DialogTitle>Yeni Döküman Oluştur</DialogTitle>
            <DialogDescription>
              Dökümanınız için bir başlık ve ikon seçin
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Emoji picker */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                İkon
              </label>
              <div className="flex flex-wrap gap-2 p-3 bg-white/5 rounded-2xl max-h-32 overflow-y-auto">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setNewDocEmoji(emoji)}
                    className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center text-lg transition-all",
                      newDocEmoji === emoji
                        ? "bg-white text-black scale-110"
                        : "hover:bg-white/10"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Title input */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Başlık
              </label>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{newDocEmoji}</span>
                <Input
                  placeholder="Döküman başlığı..."
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateDocument()}
                  className="flex-1 bg-white/5 border-white/10 rounded-full"
                  autoFocus
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-full border-white/20">
              İptal
            </Button>
            <Button
              onClick={handleCreateDocument}
              className="rounded-full"
            >
              Oluştur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
