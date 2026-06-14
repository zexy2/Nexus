import type { Metadata } from "next";
import { Inter, Geist_Mono, Newsreader, Playfair_Display } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/i18n/provider";

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
  title: "Nexus - AI Workflow Workspace Demo",
  description:
    "A public portfolio demo that turns a project idea into an AI document, task breakdown, Kanban board, and workflow history.",
  keywords: ["AI", "workspace", "workflow", "Kanban", "Temporal", "portfolio demo"],
  authors: [{ name: "Nexus Team" }],
  openGraph: {
    title: "Nexus - AI Workflow Workspace Demo",
    description:
      "Generate a document, extract tasks, manage Kanban, and inspect every AI workflow step behind it.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus - AI Workflow Workspace Demo",
    description:
      "Generate a document, extract tasks, manage Kanban, and inspect every AI workflow step behind it.",
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
        <LocaleProvider>
          <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
