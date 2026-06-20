"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles } from "lucide-react";

const navLinks = [
  { href: "#proof", label: "Proof" },
  { href: "#workflow", label: "Workflow" },
  { href: "#stack", label: "Stack" },
  { href: "#demo", label: "Demo Scope" },
];

/** Section IDs that can be active via scroll spy */
const SECTION_IDS = ["proof", "workflow", "stack", "demo"];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [logoGlow, setLogoGlow] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // ── Scroll morph ──────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Logo glow pulse on mount ──────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setLogoGlow(true), 400);
    const off = setTimeout(() => setLogoGlow(false), 1800);
    return () => {
      clearTimeout(timer);
      clearTimeout(off);
    };
  }, []);

  // ── Scroll spy with IntersectionObserver ──────────────────────
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      // Pick the first section that is currently intersecting
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => {
          // Prefer the one highest on screen
          return a.boundingClientRect.top - b.boundingClientRect.top;
        });

      if (visible.length > 0) {
        setActiveSection(visible[0].target.id);
      }
    },
    [],
  );

  useEffect(() => {
    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin: "-20% 0px -60% 0px",
      threshold: 0,
    });

    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current!.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleIntersect]);

  // Lock body when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${isScrolled
            ? "bg-black/75 backdrop-blur-xl border-b border-white/10 py-2 shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
            : "bg-transparent py-6"
          }`}
      >
        <nav className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className={`rounded-xl flex items-center justify-center transition-all duration-500 ${isScrolled ? "size-7 bg-white" : "size-9 bg-white"
                }`}
              style={{
                boxShadow: logoGlow
                  ? isScrolled
                    ? "0 0 16px 4px rgba(255,255,255,0.35)"
                    : "0 0 20px 6px rgba(255,255,255,0.35)"
                  : "none",
                transition:
                  "box-shadow 0.8s cubic-bezier(0.4,0,0.2,1), width 0.5s, height 0.5s, background-color 0.5s",
              }}
            >
              <Sparkles
                className={`transition-all duration-500 ${isScrolled ? "size-4 text-black" : "size-5 text-black"
                  }`}
              />
            </div>
            <span
              className="text-xl font-semibold tracking-tight text-white transition-colors"
            >
              Nexus
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isAnchor = link.href.startsWith("#");
              const sectionId = isAnchor ? link.href.slice(1) : null;
              const isActive = sectionId
                ? activeSection === sectionId
                : false;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-2 text-sm font-medium rounded-full transition-colors group ${isActive
                      ? isScrolled
                        ? "text-white bg-white/15"
                        : "text-white bg-white/15"
                      : isScrolled
                        ? "text-white/65 hover:text-white hover:bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/10"
                    }`}
                >
                  {link.label}
                  {/* Sliding underline on hover */}
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 h-px bg-current w-0 group-hover:w-3/4 transition-all duration-300"
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className={`px-5 py-2.5 text-sm font-medium rounded-full transition-all ${isScrolled
                  ? "bg-white text-black hover:bg-white/90"
                  : "bg-white text-black hover:bg-white/90"
                }`}
            >
              Try Demo
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden size-10 rounded-full flex items-center justify-center transition-colors ${isScrolled
                ? "text-white hover:bg-white/10"
                : "text-white hover:bg-white/10"
              }`}
          >
            {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </nav>
      </header>

      {/* Mobile Menu — Dark Fullscreen Takeover */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="fixed inset-0 z-40 bg-black md:hidden flex flex-col"
          >
            {/* Top gradient overlay */}
            <div
              className="absolute inset-x-0 top-0 h-32 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,1) 0%, transparent 100%)",
              }}
            />

            {/* Close button — animated X with rotation on mount */}
            <div className="flex justify-end px-6 pt-6">
              <motion.button
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="size-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              >
                <X className="size-6" />
              </motion.button>
            </div>

            {/* Links */}
            <div className="flex-1 flex flex-col justify-center px-8">
              <nav className="space-y-4">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{
                      duration: 0.4,
                      delay: i * 0.05,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block text-4xl font-light text-white/80 hover:text-white transition-colors py-2"
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>

              <div className="mt-12 pt-8 border-t border-white/10 space-y-4">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: navLinks.length * 0.05,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                >
                  <Link
                    href="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="inline-block px-8 py-4 text-lg font-medium text-black bg-white rounded-full text-center hover:bg-white/90 transition-colors"
                  >
                    Try Demo
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
