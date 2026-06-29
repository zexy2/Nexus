"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Archive,
  ArrowLeft,
  MoreVertical,
  Trash2,
  RotateCcw,
  Clock,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface Document {
  id: string;
  title: string;
  iconEmoji: string | null;
  updatedAt: string;
  createdBy: string | null;
}

function formatRelativeTime(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function ArchivePage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchArchivedDocs() {
      try {
        const res = await fetch("/api/docs/archived");
        if (res.ok) {
          const data = await res.json();
          setDocs(data);
        }
      } catch (error) {
        console.error("Failed to fetch archived docs:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchArchivedDocs();
  }, []);

  const handleRestoreDoc = async (docId: string) => {
    try {
      const res = await fetch(`/api/docs/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: 0 }),
      });
      
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (error) {
      console.error("Failed to restore doc:", error);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Bu dokümanı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
    
    try {
      const res = await fetch(`/api/docs/${docId}`, { method: "DELETE" });
      if (res.ok) {
        setDocs((prev) => prev.filter((d) => d.id !== docId));
      }
    } catch (error) {
      console.error("Failed to delete doc:", error);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <SidebarTrigger />
        <Link href="/dashboard/docs">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Archive className="size-5 text-muted-foreground" />
            Arşiv
          </h1>
          <p className="text-sm text-muted-foreground">
            {docs.length} arşivlenmiş doküman
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Archive className="size-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Arşiv boş</h2>
            <p className="text-muted-foreground mb-4">
              Arşivlenmiş doküman bulunmuyor
            </p>
            <Link href="/dashboard/docs">
              <Button>Dokümanlara Dön</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {docs.map((doc) => (
              <Card 
                key={doc.id} 
                className="group hover:shadow-md transition-shadow cursor-pointer opacity-75"
                onClick={() => router.push(`/dashboard/docs/${doc.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{doc.iconEmoji || "📄"}</span>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleRestoreDoc(doc.id); }}>
                          <RotateCcw className="size-4 mr-2" />
                          Geri Yükle
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onSelect={(e) => { e.preventDefault(); handleDeleteDoc(doc.id); }}>
                          <Trash2 className="size-4 mr-2" />
                          Kalıcı Olarak Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-medium truncate mb-2">{doc.title}</h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatRelativeTime(doc.updatedAt)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
