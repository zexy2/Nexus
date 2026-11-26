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
  Preloader,
} from "@/components/landing";
import { ForceDocumentLang } from "@/lib/i18n/provider";

export default function LandingPage() {
  // The landing copy is English-only: pin `lang` so CSS uppercase does not use
  // Turkish casing ("PUBLİC") for visitors whose UI locale is Turkish.
  return (
    <div lang="en">
      <ForceDocumentLang lang="en" />
      <Preloader />
      <div className="min-h-screen bg-[#0a0a0a]">
          <Navigation />

          <main>
            <HeroCinematic />

            <section id="proof">
              <StatsSection />
            </section>

            <SimpleMarquee />

            <section id="workflow">
              <BentoGallery />
            </section>

            <section id="stack">
              <FeatureBlocks />
            </section>

            <MarqueeBanner
              lines={[
                "VERSIONED PLAN",
                "IMPACT REVIEW",
                "HUMAN APPROVAL",
                "ALIGNED BOARD",
              ]}
            />

            <section id="demo">
              <Testimonials />
            </section>
          </main>

          <FooterMinimal />
      </div>
    </div>
  );
}
