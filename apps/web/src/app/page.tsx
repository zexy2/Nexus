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

export default function LandingPage() {
  return (
    <>
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
                "IDEA TO DOCUMENT",
                "DOCUMENT TO TASKS",
                "TASKS TO KANBAN",
                "WORKFLOW HISTORY",
              ]}
            />

            <section id="demo">
              <Testimonials />
            </section>
          </main>

          <FooterMinimal />
      </div>
    </>
  );
}
