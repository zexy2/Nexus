import { DashboardShell } from "@/components/dashboard-shell";
import { ZeroProvider } from "@/lib/zero";
import { AIWriteProvider } from "@/lib/ai-write";
import { ToastProvider } from "@/components/shared/toast-provider";
import { OnboardingWrapper } from "@/components/onboarding-wrapper";
import { ModalProvider } from "@/components/modal-provider";

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
