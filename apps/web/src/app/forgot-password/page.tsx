"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/lib/i18n/provider";
import { NexusMark } from "@/components/shared/nexus-mark";

export default function ForgotPasswordPage() {
  const { t } = useLocale();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: "/reset-password",
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message || t("auth.resetFailed"));
      }

      setIsSubmitted(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : t("auth.resetFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
            <NexusMark size={24} className="text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold">Nexus</span>
        </div>

        <Card>
          {!isSubmitted ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">{t("auth.forgotTitle")}</CardTitle>
                <CardDescription>
                  {t("auth.forgotDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  {error && (
                    <div className="text-sm text-destructive text-center">
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        {t("auth.sending")}
                      </>
                    ) : (
                      <>
                        <Mail className="size-4 mr-2" />
                        {t("auth.sendResetLink")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="size-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="size-6 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <CardTitle className="text-2xl">{t("auth.resetSentTitle")}</CardTitle>
                <CardDescription>
                  {t("auth.resetSentDesc")}
                  <br />
                  <span className="font-medium text-foreground">{email}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center text-sm text-muted-foreground">
                <p>
                  {t("auth.resetSentNote")}{" "}
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="text-primary hover:underline"
                  >
                    {t("auth.sendResetLink")}
                  </button>
                </p>
              </CardContent>
            </>
          )}
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
