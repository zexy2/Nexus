"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles } from "lucide-react";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#gallery", label: "Showcase" },
  { href: "#testimonials", label: "Testimonials" },
  { href: "/pricing", label: "Pricing" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled
            ? "bg-white/80 backdrop-blur-xl border-b border-neutral-200/50 py-3"
            : "bg-transparent py-6"
        }`}
      >
        <nav className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div
              className={`size-9 rounded-xl flex items-center justify-center transition-colors ${
                isScrolled ? "bg-black" : "bg-white"
              }`}
            >
              <Sparkles
                className={`size-5 ${isScrolled ? "text-white" : "text-black"}`}
              />
            </div>
            <span
              className={`text-xl font-semibold tracking-tight transition-colors ${
                isScrolled ? "text-black" : "text-white"
              }`}
            >
              Nexus
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                  isScrolled
                    ? "text-neutral-600 hover:text-black hover:bg-neutral-100"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                isScrolled
                  ? "text-neutral-600 hover:text-black"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className={`px-5 py-2.5 text-sm font-medium rounded-full transition-all ${
                isScrolled
                  ? "bg-black text-white hover:bg-neutral-800"
                  : "bg-white text-black hover:bg-white/90"
              }`}
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`md:hidden size-10 rounded-full flex items-center justify-center transition-colors ${
              isScrolled
                ? "text-black hover:bg-neutral-100"
                : "text-white hover:bg-white/10"
            }`}
          >
            {isMobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </nav>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-white pt-24 md:hidden"
          >
            <div className="px-6 py-8">
              <nav className="space-y-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block px-4 py-3 text-lg font-medium text-black rounded-xl hover:bg-neutral-100 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-8 pt-8 border-t border-neutral-200 space-y-3">
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-4 py-3 text-lg font-medium text-neutral-600 rounded-xl hover:bg-neutral-100 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-4 py-3 text-lg font-medium text-white bg-black rounded-xl text-center hover:bg-neutral-800 transition-colors"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
