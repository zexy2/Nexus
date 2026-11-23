import { DashboardShell } from "@/components/layout";
import { ZeroProvider } from "@/lib/sync/zero";
import { AIWriteProvider } from "@/lib/ai/ai-write";
import { ToastProvider } from "@/components/shared/toast-provider";
import { OnboardingWrapper } from "@/components/shared/onboarding-wrapper";
import { ModalProvider } from "@/components/shared/modal-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { userSettings } from "@nexus/database/schema";
import { eq } from "drizzle-orm";
import { AppearanceSync } from "@/components/shared/appearance-sync";
import { getOnboardingEligibility } from "@/lib/onboarding-server";

async function getAppearance(userId: string) {
  try {
    const [row] = await db
      .select({ theme: userSettings.theme, compactMode: userSettings.compactMode })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return { theme: row?.theme ?? "system", compact: row?.compactMode ?? false };
  } catch (error) {
    console.error("[Dashboard] Could not load appearance settings:", error);
    return null;
  }
}

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const [appearance, onboardingEligible] = await Promise.all([
    getAppearance(session.user.id),
    getOnboardingEligibility(session.user.id, session.user.createdAt),
  ]);

  return (
    <ZeroProvider userId={session.user.id}>
      <AIWriteProvider>
        <ToastProvider />
        {appearance && <AppearanceSync theme={appearance.theme} compact={appearance.compact} />}
        <OnboardingWrapper eligible={onboardingEligible} />
        <ModalProvider />
        <SidebarProvider className="contents">
          <DashboardShell>{children}</DashboardShell>
        </SidebarProvider>
      </AIWriteProvider>
    </ZeroProvider>
  );
}
