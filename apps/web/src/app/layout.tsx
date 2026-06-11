import type { Metadata } from "next";
import { Inter, Geist_Mono, Newsreader, Playfair_Display } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

// Primary body font - Clean, modern
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Monospace for code
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Serif for documents
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Display font for hero headlines
const playfairDisplay = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexus - AI-Powered Workspace",
  description:
    "Build faster with intelligent agents. Local-first, real-time collaboration, enterprise-ready.",
  keywords: ["AI", "workspace", "collaboration", "agents", "local-first", "productivity"],
  authors: [{ name: "Nexus Team" }],
  openGraph: {
    title: "Nexus - AI-Powered Workspace",
    description: "Build faster with intelligent agents. Local-first, real-time collaboration, enterprise-ready.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus - AI-Powered Workspace",
    description: "Build faster with intelligent agents. Local-first, real-time collaboration, enterprise-ready.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} ${newsreader.variable} ${playfairDisplay.variable} antialiased`}
        suppressHydrationWarning
      >
        <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
