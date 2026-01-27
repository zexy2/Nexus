import {
  Navigation,
  HeroCinematic,
  StatsSection,
  BentoGallery,
  FeatureBlocks,
  MarqueeBanner,
  SimpleMarquee,
  Testimonials,
  FooterMinimal,
} from "@/components/landing";
import { SmoothScrollProvider } from "@/components/animations";

export default function LandingPage() {
  return (
    <SmoothScrollProvider>
      <div className="min-h-screen bg-black">
        {/* Navigation - Floating, minimal */}
        <Navigation />

        <main>
          {/* Hero - Full-screen cinematic */}
          <HeroCinematic />

          {/* Stats - White section with counters */}
          <StatsSection />

          {/* Simple Marquee - Divider */}
          <SimpleMarquee />

          {/* Bento Gallery - Black section */}
          <section id="gallery">
            <BentoGallery />
          </section>

          {/* Feature Blocks - White section, alternating layout */}
          <section id="features">
            <FeatureBlocks />
          </section>

          {/* Large Marquee - Text banner */}
          <MarqueeBanner
            lines={[
              "AI-POWERED",
              "LOCAL-FIRST",
              "ENTERPRISE-READY",
            ]}
          />

          {/* Testimonials - Light gray section */}
          <section id="testimonials">
            <Testimonials />
          </section>
        </main>

        {/* Footer with CTA */}
        <FooterMinimal />
      </div>
    </SmoothScrollProvider>
  );
}
