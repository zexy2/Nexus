"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/i18n/provider";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { NexusMark } from "@/components/shared/nexus-mark";

export default function ResetPasswordPage() {
  const { t } = useLocale();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
    setError(params.get("error") ? t("auth.tokenMissing") : "");
  }, [t]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setError(t("auth.tokenMissing"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || t("auth.resetFailed"));
      }

      setSuccess(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("auth.resetFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80">
            <NexusMark size={24} className="text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold">Nexus</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {success ? t("auth.resetSentTitle") : t("auth.resetTitle")}
            </CardTitle>
            <CardDescription>
              {success ? t("auth.resetSuccess") : t("auth.resetDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex justify-center py-6">
                <div className="flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="size-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading || !token}>
                  {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {t("auth.resetPassword")}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="justify-center">
            <Link
              href="/login"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              <ArrowLeft className="size-4" />
              {t("auth.backToSignIn")}
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
