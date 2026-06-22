"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { signUp, signIn } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n/provider";
import { Loader2, Github, Sparkles, Check } from "lucide-react";
import { useAuthProviders } from "@/lib/use-auth-providers";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useLocale();
  const authProviders = useAuthProviders();
  const hasSocialProvider = authProviders.github || authProviders.google;
  const signupEnabled = process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED !== "false";
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!acceptTerms) {
      setError(`${t("auth.acceptTermsPrefix")} ${t("auth.terms")} ${t("auth.and")} ${t("auth.privacy")}`);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      if (!signupEnabled) {
        setError(t("auth.registerSubtitleDisabled"));
        return;
      }

      const result = await signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || t("auth.registerSubtitleDisabled"));
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError(t("auth.unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubLogin = async () => {
    setIsLoading(true);
    try {
      await signIn.social({ 
        provider: "github",
        callbackURL: "/dashboard"
      });
    } catch {
      setError("GitHub login failed");
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await signIn.social({ 
        provider: "google",
        callbackURL: "/dashboard"
      });
    } catch {
      setError("Google login failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-background via-background to-primary/5">
      {/* Left Side - Features */}
      <div className="hidden lg:flex flex-1 flex-col justify-center p-12 bg-primary/5">
        <div className="max-w-md">
          <div className="flex items-center gap-2 mb-8">
            <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Sparkles className="size-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">Nexus</span>
          </div>

          <h2 className="text-3xl font-bold mb-4">
            {t("auth.registerFeatureTitle")}
          </h2>
          <p className="text-muted-foreground mb-8">
            {t("auth.registerFeatureDesc")}
          </p>

          <div className="space-y-4">
            {[
              t("auth.featureLivingPlan"),
              t("auth.featureChangeReview"),
              t("auth.featureKanban"),
              t("auth.featureRuns"),
              t("auth.featureQuota"),
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="size-4 text-primary" />
                </div>
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 p-4 rounded-lg border bg-card/50">
            <p className="text-sm italic text-muted-foreground">
              &ldquo;{t("auth.demoNote")}&rdquo;
            </p>
            <div className="flex items-center gap-2 mt-3">
              <div className="size-8 rounded-full bg-primary/20" />
              <div>
                <p className="text-sm font-medium">{t("auth.demoName")}</p>
                <p className="text-xs text-muted-foreground">{t("auth.demoTagline")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Sparkles className="size-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">Nexus</span>
          </div>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">{t("auth.registerTitle")}</CardTitle>
              <CardDescription>
                {signupEnabled ? t("auth.registerSubtitleEnabled") : t("auth.registerSubtitleDisabled")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!signupEnabled && (
                  <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {t("auth.registerDisabledNotice")}
                </div>
              )}

              {/* Social Login */}
              <div className={signupEnabled && hasSocialProvider ? `grid gap-3 ${authProviders.github && authProviders.google ? "grid-cols-2" : "grid-cols-1"}` : "hidden"}>
                {authProviders.github && (
                <Button
                  variant="outline"
                  onClick={handleGithubLogin}
                  disabled={isLoading}
                >
                  <Github className="size-4 mr-2" />
                  GitHub
                </Button>
                )}
                {authProviders.google && (
                <Button
                  variant="outline"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                >
                  <svg className="size-4 mr-2" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Google
                </Button>
                )}
              </div>

              {signupEnabled && hasSocialProvider && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    {t("auth.or")}
                  </span>
                </div>
              </div>
              )}

              {/* Email Signup Form */}
              <form onSubmit={handleEmailSignup} className={signupEnabled ? "space-y-4" : "hidden"}>
                <div className="space-y-2">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder={t("auth.fullNamePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("auth.minPassword")}
                  </p>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                  />
                  <label
                    htmlFor="terms"
                    className="text-xs text-muted-foreground leading-tight"
                  >
                    {t("auth.acceptTermsPrefix")}{" "}
                    <Link href="/terms" className="text-primary hover:underline">
                      {t("auth.terms")}
                    </Link>{" "}
                    {t("auth.and")}{" "}
                    <Link href="/privacy" className="text-primary hover:underline">
                      {t("auth.privacy")}
                    </Link>
                  </label>
                </div>

                {error && (
                  <div className="text-sm text-destructive text-center">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                  {t("auth.createAccount")}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="justify-center">
              <p className="text-sm text-muted-foreground">
                {demoMode ? `${t("auth.readyDemo")} ` : `${t("auth.alreadyAccount")} `}
                <Link href="/login" className="text-primary hover:underline">
                  {t("common.signIn")}
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
