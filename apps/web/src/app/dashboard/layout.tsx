import { DashboardShell } from "@/components/layout";
import { ZeroProvider } from "@/lib/sync/zero";
import { AIWriteProvider } from "@/lib/ai/ai-write";
import { ToastProvider } from "@/components/shared/toast-provider";
import { OnboardingWrapper } from "@/components/shared/onboarding-wrapper";
import { ModalProvider } from "@/components/shared/modal-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ZeroProvider>
      <AIWriteProvider>
        <ToastProvider />
        <OnboardingWrapper />
        <ModalProvider />
        <DashboardShell>{children}</DashboardShell>
      </AIWriteProvider>
    </ZeroProvider>
  );
}
