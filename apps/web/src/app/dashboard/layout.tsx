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

  return (
    <ZeroProvider>
      <AIWriteProvider>
        <ToastProvider />
        <OnboardingWrapper />
        <ModalProvider />
        <SidebarProvider className="contents">
          <DashboardShell>{children}</DashboardShell>
        </SidebarProvider>
      </AIWriteProvider>
    </ZeroProvider>
  );
}
