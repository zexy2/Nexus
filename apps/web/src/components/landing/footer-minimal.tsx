"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Github, Twitter, Linkedin, Mail } from "lucide-react";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { MagneticButton } from "@/components/animations/magnetic-button";

export function FooterMinimal() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="relative bg-black text-white overflow-hidden" suppressHydrationWarning>
      {/* CTA Section */}
      <section className="relative py-32 md:py-40 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <ScrollReveal animation="fade-up">
            <h2 className="text-4xl md:text-5xl lg:text-7xl font-semibold tracking-tight mb-6">
              Try the public
              <br />
              <span className="text-white/40">portfolio demo</span>
            </h2>
          </ScrollReveal>

          <ScrollReveal animation="fade-up" delay={0.1}>
            <p className="text-lg text-white/60 max-w-xl mx-auto mb-10">
              Open the demo account, generate an AI document, convert it into
              tasks, and inspect the workflow history.
            </p>
          </ScrollReveal>

          <ScrollReveal animation="fade-up" delay={0.2}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <MagneticButton strength={0.2}>
                <Link
                  href="/login"
                  suppressHydrationWarning
                  className="group inline-flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-medium text-lg hover:bg-white/90 transition-colors"
                >
                  Try Demo
                  <ArrowRight className="size-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </MagneticButton>

              <MagneticButton strength={0.2}>
                <Link
                  href="https://github.com/zexy2/Nexus"
                  target="_blank"
                  suppressHydrationWarning
                  className="inline-flex items-center gap-3 px-8 py-4 border border-white/20 text-white rounded-full font-medium text-lg hover:bg-white/10 transition-colors"
                >
                  View GitHub
                </Link>
              </MagneticButton>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer Content */}
      <div className="py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
            {/* Brand */}
            <div className="col-span-2 lg:col-span-1">
              <Link href="/" className="inline-flex items-center gap-2 mb-4">
                <div className="size-8 rounded-lg bg-white flex items-center justify-center">
                  <span className="text-black font-bold text-lg">N</span>
                </div>
                <span className="text-xl font-semibold">Nexus</span>
              </Link>
              <p className="text-white/50 text-sm leading-relaxed">
                Portfolio demo for an AI workspace: documents, task breakdown,
                Kanban, and workflow history.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-4">
                Product
              </h4>
              <ul className="space-y-3">
                <FooterLink href="#features">Features</FooterLink>
                <FooterLink href="#gallery">Showcase</FooterLink>
                <FooterLink href="#testimonials">Demo Scope</FooterLink>
                <FooterLink href="/login">Try Demo</FooterLink>
              </ul>
            </div>

            {/* Project */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-4">
                Project
              </h4>
              <ul className="space-y-3">
                <FooterLink href="https://github.com/zexy2/Nexus">GitHub</FooterLink>
                <FooterLink href="/docs">Docs</FooterLink>
                <FooterLink href="/status">Health</FooterLink>
                <FooterLink href="/login">Demo Login</FooterLink>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-4">
                Resources
              </h4>
              <ul className="space-y-3">
                <FooterLink href="/docs">Documentation</FooterLink>
                <FooterLink href="/help">Help Center</FooterLink>
                <FooterLink href="/community">Community</FooterLink>
                <FooterLink href="/status">Status</FooterLink>
              </ul>
            </div>

            {/* Newsletter */}
            <div className="col-span-2 md:col-span-4 lg:col-span-1">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-white/40 mb-4">
                Stay Updated
              </h4>
              {subscribed ? (
                <p className="text-white/60 text-sm">Thanks for subscribing!</p>
              ) : (
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 text-sm"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-white text-black rounded-lg font-medium text-sm hover:bg-white/90 transition-colors"
                  >
                    <Mail className="size-4" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/10">
            <p className="text-white/40 text-sm">
              © {new Date().getFullYear()} Nexus. All rights reserved.
            </p>

            {/* Social links */}
            <div className="flex items-center gap-4">
              <SocialLink href="https://github.com" icon={<Github className="size-5" />} />
              <SocialLink href="https://twitter.com" icon={<Twitter className="size-5" />} />
              <SocialLink href="https://linkedin.com" icon={<Linkedin className="size-5" />} />
            </div>

            {/* Legal */}
            <div className="flex items-center gap-6 text-sm">
              <Link href="/privacy" suppressHydrationWarning className="text-white/40 hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" suppressHydrationWarning className="text-white/40 hover:text-white transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        suppressHydrationWarning
        className="text-white/60 hover:text-white transition-colors text-sm"
      >
        {children}
      </Link>
    </li>
  );
}

function SocialLink({ href, icon }: { href: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      suppressHydrationWarning
      className="size-10 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-colors"
    >
      {icon}
    </a>
  );
}
