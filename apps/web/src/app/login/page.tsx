"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { signIn } from "@/lib/auth-client";
import { Github, Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Login failed");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError("An unexpected error occurred");
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
    } catch (err) {
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
    } catch (err) {
      setError("Google login failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mb-10">
            <div className="size-8 rounded-lg bg-foreground flex items-center justify-center">
              <Sparkles className="size-4 text-background" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Nexus</span>
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Welcome back. Enter your credentials to continue.
            </p>
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Button
              variant="outline"
              onClick={handleGithubLogin}
              disabled={isLoading}
              className="h-10"
            >
              <Github className="size-4 mr-2" />
              GitHub
            </Button>
            <Button
              variant="outline"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="h-10"
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
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or
              </span>
            </div>
          </div>

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground transition-base"
                >
                  Forgot?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 py-2 px-3 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full h-10" disabled={isLoading}>
              {isLoading ? (
                <div className="size-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-sm text-muted-foreground text-center mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-foreground font-medium hover:underline">
              Sign up
            </Link>
          </p>

          <Link 
            href="/dashboard" 
            className="block text-center text-xs text-muted-foreground hover:text-foreground transition-base mt-4"
          >
            Continue without account →
          </Link>
        </div>
      </div>

      {/* Right side - Visual */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-muted/30 border-l border-border p-12">
        <div className="max-w-md">
          <blockquote className="space-y-4">
            <p className="text-lg leading-relaxed text-foreground/80">
              &ldquo;Nexus has transformed how our team handles documentation and task management. 
              The AI agents save us hours every week.&rdquo;
            </p>
            <footer className="text-sm text-muted-foreground">
              — Demo User, Early Adopter
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
