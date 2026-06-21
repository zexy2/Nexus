"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/shared/toast-provider";
import { useT } from "@/lib/i18n/provider";

type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

export default function NewTaskPage() {
  const router = useRouter();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as TaskPriority,
    status: "todo" as TaskStatus,
  });

  const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
    { value: "low", label: t("tasks.prioLow") },
    { value: "medium", label: t("tasks.prioMedium") },
    { value: "high", label: t("tasks.prioHigh") },
    { value: "urgent", label: t("tasks.prioUrgent") },
  ];

  const statusOptions: Array<{ value: TaskStatus; label: string }> = [
    { value: "todo", label: t("tasks.colTodo") },
    { value: "in_progress", label: t("tasks.colInProgress") },
    { value: "done", label: t("tasks.colDone") },
  ];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.title.trim()) {
      showToast.warning(t("tasks.toastEnterTitle"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          status: formData.status,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const task = await response.json();
      showToast.success(t("tasks.toastCreated"));
      router.push(`/dashboard/tasks/${task.id}`);
    } catch (error) {
      console.error("Failed to create task:", error);
      showToast.error(t("tasks.toastCreateFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-8">
          <div className="space-y-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
              <Link href="/dashboard/tasks">
                <ArrowLeft className="size-4" />
                {t("nav.work")}
              </Link>
            </Button>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-white/40">
                {t("tasks.label")}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                {t("tasks.dialogCreateTitle")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white/50">
                {t("tasks.description")}
              </p>
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit}>
          <Card className="max-w-3xl rounded-2xl border-white/10 bg-white/[0.04] text-white shadow-none">
            <CardHeader className="border-b border-white/10">
              <CardTitle>{t("tasks.dialogCreateTitle")}</CardTitle>
              <CardDescription>{t("tasks.dialogCreateDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label htmlFor="title">{t("tasks.fieldTitle")}</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder={t("tasks.fieldTitlePlaceholder")}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("tasks.fieldDesc")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder={t("tasks.fieldDescPlaceholder")}
                  className="min-h-36"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("tasks.fieldPriority")}</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: TaskPriority) =>
                      setFormData((current) => ({ ...current, priority: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t("tasks.fieldStatus")}</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: TaskStatus) =>
                      setFormData((current) => ({ ...current, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-white/10 pt-6">
                <Button type="button" variant="outline" asChild>
                  <Link href="/dashboard/tasks">{t("common.cancel")}</Link>
                </Button>
                <Button type="submit" disabled={!formData.title.trim() || loading} className="gap-2">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {loading ? t("common.loading") : t("tasks.newTask")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </main>
  );
}
