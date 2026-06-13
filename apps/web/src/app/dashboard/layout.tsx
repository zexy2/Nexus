import { DashboardShell } from "@/components/layout";
import { LocaleProvider } from "@/lib/i18n/provider";
import { ZeroProvider } from "@/lib/sync/zero";
import { AIWriteProvider } from "@/lib/ai/ai-write";
import { ToastProvider } from "@/components/shared/toast-provider";
import { OnboardingWrapper } from "@/components/shared/onboarding-wrapper";
import { ModalProvider } from "@/components/shared/modal-provider";
import { SidebarProvider } from "@/components/ui/sidebar";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LocaleProvider>
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
    </LocaleProvider>
  );
}
