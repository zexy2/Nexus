import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { NexusMark } from "@/components/shared/nexus-mark";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center">
              <NexusMark size={19} className="text-primary-foreground" />
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
            Last updated: June 22, 2026
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
              Nexus is a public portfolio demo for versioned project plans, plan-impact
              review, task alignment, realtime document collaboration, and coding-agent
              handoff. It is not presented as a commercial SaaS service or a replacement
              for a production project-management platform.
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
              <li>Use AI features to generate harmful or deliberately misleading content</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Intellectual Property</h2>
            <p>
              The Nexus source code is distributed under the license published in its
              GitHub repository. You remain responsible for content you submit to the demo
              and must have the right to use that content.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Data and Privacy</h2>
            <p>
              Your use of the service is also governed by the Privacy Policy. Authenticated
              workspace data is stored in the server database. Limited browser caching and
              an offline command queue do not provide a full offline-first guarantee.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. AI-Generated Content</h2>
            <p>
              Nexus uses server-configured AI providers for plan generation, analysis,
              research, and suggestions. AI-generated content may be wrong, incomplete, or
              outdated. Human review is required before applying proposed work changes or
              relying on generated output.
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
              These terms may change as the portfolio demo evolves. Material changes will
              be reflected on this page by updating the revision date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">10. Contact</h2>
            <p>
              Questions and issues can be submitted through the
              {" "}<a href="https://github.com/zexy2/Nexus">Nexus GitHub repository</a>.
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
