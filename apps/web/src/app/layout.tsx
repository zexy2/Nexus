import type { Metadata } from "next";
import { Inter, Geist_Mono, Newsreader, Playfair_Display } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/i18n/provider";
import { APPEARANCE_BOOT_SCRIPT } from "@/lib/appearance";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveInitialLocale } from "@/lib/i18n/locale";

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
  title: "Nexus - Controlled Plan Change Demo",
  description:
    "A public portfolio demo that reviews plan changes, traces affected work, applies approved task updates, and records the workflow history.",
  keywords: ["AI", "change control", "workflow", "Kanban", "Temporal", "portfolio demo"],
  authors: [{ name: "Nexus Team" }],
  openGraph: {
    title: "Nexus - Controlled Plan Change Demo",
    description:
      "Change the plan once. Nexus finds the impact, proposes task updates, waits for approval, and keeps delivery work aligned.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexus - Controlled Plan Change Demo",
    description:
      "Change the plan once. Nexus finds the impact, proposes task updates, waits for approval, and keeps delivery work aligned.",
  },
  icons: {
    icon: [{ url: "/brand/nexus-mark.svg", type: "image/svg+xml" }],
    apple: "/brand/nexus-mark.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-rendered language: cookie (saved preference) → Accept-Language → en.
  // The provider then applies a localStorage preference after mount.
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const initialLocale = resolveInitialLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });

  return (
    <html lang={initialLocale} className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Applies the cached dashboard theme/compact mode before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${newsreader.variable} ${playfairDisplay.variable} antialiased`}
        suppressHydrationWarning
      >
        <LocaleProvider initialLocale={initialLocale}>
          <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
