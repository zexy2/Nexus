import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="size-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Nexus</span>
          </Link>
          <Link href="/register">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="size-4 mr-2" />
              Back to Register
            </Button>
          </Link>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Last updated: January 18, 2026
          </p>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
            <p>
              By accessing and using Nexus, you accept and agree to be bound by the terms 
              and provision of this agreement. If you do not agree to abide by the above, 
              please do not use this service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. Description of Service</h2>
            <p>
              Nexus is an AI-powered collaboration platform that provides users with 
              multi-agent AI automation, local-first data synchronization, and real-time 
              collaboration features. The service includes document editing, task management, 
              and AI agent interactions.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. User Accounts</h2>
            <p>
              To access certain features of the service, you may be required to create 
              an account. You are responsible for maintaining the confidentiality of your 
              account credentials and for all activities that occur under your account.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You must provide accurate and complete registration information</li>
              <li>You must keep your password confidential</li>
              <li>You are responsible for all activities under your account</li>
              <li>You must notify us immediately of any unauthorized use</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">4. Acceptable Use</h2>
            <p>You agree not to use the service to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on the rights of others</li>
              <li>Distribute malware or harmful code</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Use the AI agents for generating harmful or misleading content</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Intellectual Property</h2>
            <p>
              The service and its original content, features, and functionality are owned 
              by Nexus and are protected by international copyright, trademark, and other 
              intellectual property laws. Your content remains yours, and you grant us a 
              license to use it solely for providing the service.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Data and Privacy</h2>
            <p>
              Your use of the service is also governed by our Privacy Policy. We use 
              local-first architecture, meaning your data is stored primarily on your 
              device and synced securely when online. Please review our Privacy Policy 
              to understand how we handle your information.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. AI-Generated Content</h2>
            <p>
              Nexus uses AI agents to assist with various tasks. While we strive for 
              accuracy, AI-generated content may contain errors or inaccuracies. You are 
              responsible for reviewing and verifying any AI-generated content before 
              relying on it.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">8. Limitation of Liability</h2>
            <p>
              In no event shall Nexus be liable for any indirect, incidental, special, 
              consequential, or punitive damages, including without limitation, loss of 
              profits, data, use, goodwill, or other intangible losses.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">9. Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. We will notify 
              users of any material changes via email or through the service. Your 
              continued use of the service after such modifications constitutes acceptance 
              of the updated terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">10. Contact</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us 
              at support@nexus.app.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <Link href="/register">
            <Button>
              <ArrowLeft className="size-4 mr-2" />
              Back to Register
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
