import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicyPage() {
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
        <div className="flex items-center gap-3 mb-8">
          <Shield className="size-10 text-primary" />
          <h1 className="text-4xl font-bold">Privacy Policy</h1>
        </div>
        
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          <p className="text-muted-foreground">
            Last updated: January 18, 2026
          </p>

          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 my-6">
            <p className="text-sm font-medium">
              🔒 Nexus is built with a local-first architecture. This means your data 
              is stored in the application database for authenticated workspace features, with limited local caching for responsiveness.
            </p>
          </div>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
            <p>We collect information you provide directly to us:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Account Information:</strong> Name, email address, and password when you create an account</li>
              <li><strong>Profile Information:</strong> Optional profile photo and display preferences</li>
              <li><strong>Content:</strong> Documents, tasks, and other content you create within the app</li>
              <li><strong>Usage Data:</strong> How you interact with the service for improving user experience</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. Data Storage and Sync</h2>
            <p>
              Nexus v1 uses server-backed workspace storage with local cache and queued sync behavior. This means:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Documents, tasks, requirements, workflow runs, and audit events are stored on the server database</li>
              <li>Some client-side data may be cached locally for faster navigation or offline queue behavior</li>
              <li>AI features require server connectivity and configured provider keys</li>
              <li>Production Zero cache support is deferred and is not currently claimed as a full offline sync guarantee</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Power AI agents to assist with your tasks (with your explicit consent)</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">4. AI and Your Data</h2>
            <p>
              When you use AI features in Nexus:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>AI agents only access content you explicitly share with them</li>
              <li>We use industry-standard AI providers (OpenAI, Anthropic)</li>
              <li>Your data is not used to train external AI models</li>
              <li>You can disable AI features at any time in settings</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Data Sharing</h2>
            <p>We do not sell your personal information. We may share data with:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Service Providers:</strong> Third parties that help us operate the service</li>
              <li><strong>AI Providers:</strong> When you use AI features (with your consent)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect rights</li>
              <li><strong>Business Transfers:</strong> In connection with a merger or acquisition</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Data Security</h2>
            <p>
              We implement appropriate security measures to protect your information:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>End-to-end encryption for data in transit</li>
              <li>Encryption at rest for stored data</li>
              <li>Regular security audits and penetration testing</li>
              <li>Access controls and authentication requirements</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Request correction of inaccurate data</li>
              <li><strong>Deletion:</strong> Request deletion of your data</li>
              <li><strong>Portability:</strong> Export your data in a standard format</li>
              <li><strong>Opt-out:</strong> Opt out of marketing communications</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">8. Cookies and Tracking</h2>
            <p>
              We use essential cookies for authentication and preferences. We do not 
              use tracking cookies for advertising purposes. You can manage cookie 
              preferences in your browser settings.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">9. Children&apos;s Privacy</h2>
            <p>
              Nexus is not intended for children under 13. We do not knowingly collect 
              personal information from children. If you believe a child has provided 
              us with personal information, please contact us.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you 
              of any changes by posting the new policy on this page and updating the 
              &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">11. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at:
            </p>
            <ul className="list-none space-y-1 ml-4">
              <li>📧 Email: privacy@nexus.app</li>
              <li>🌐 Website: https://nexus.app/contact</li>
            </ul>
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
