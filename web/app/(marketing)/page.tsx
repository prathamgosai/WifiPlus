import { SpeedTestProvider } from "@/components/providers/SpeedTestProvider";
import { IspProvider } from "@/components/providers/IspProvider";

import { Hero } from "@/components/sections/Hero";
import { SpeedDashboard } from "@/components/sections/SpeedDashboard";
import { Features } from "@/components/sections/Features";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Ecosystem } from "@/components/sections/Ecosystem";
import { Intelligence } from "@/components/sections/Intelligence";
import { Compare } from "@/components/sections/Compare";
import { Rankings } from "@/components/sections/Rankings";
import { Recommend } from "@/components/sections/Recommend";
import { Tools } from "@/components/sections/Tools";
import { Doctor } from "@/components/sections/Doctor";
import { Pricing } from "@/components/sections/Pricing";
import { Testimonials } from "@/components/sections/Testimonials";
import { About } from "@/components/sections/About";
import { SeoPages } from "@/components/sections/SeoPages";
import { ContentHubs } from "@/components/sections/ContentHubs";
import { Architecture } from "@/components/sections/Architecture";
import { Monetization } from "@/components/sections/Monetization";
import { Community } from "@/components/sections/Community";
import { Faq } from "@/components/sections/Faq";
import { Contact } from "@/components/sections/Contact";

/**
 * The page is a server component; every section below is a client island.
 *
 * Order follows the reader's questions rather than the feature list:
 *   measure → what it means → what the platform is → who else is out there →
 *   what should I do → what does it cost → who built it → everything else.
 *
 * SpeedTestProvider is above Hero and Doctor so one test run feeds both.
 * IspProvider is above Intelligence, Compare and SeoPages so a location card
 * can scope the comparison table.
 */
export default function HomePage() {
  return (
    <SpeedTestProvider>
      <IspProvider>
        <Hero />
        {/* The report is a sibling of the hero rather than a child of it: the
            hero owns the instrument and the CTA, this owns everything the run
            produced. Keeping them separate is what lets the hero avoid
            subscribing to the store at all. */}
        <SpeedDashboard />
        <Features />
        <HowItWorks />
        <Ecosystem />

        <Intelligence />
        <Compare />
        <Rankings />
        <Recommend />

        <Tools />
        <Doctor />

        <Pricing />
        <Testimonials />
        <About />

        <SeoPages />
        <ContentHubs />
        <Architecture />
        <Monetization />
        <Community />

        <Faq />
        <Contact />
      </IspProvider>
    </SpeedTestProvider>
  );
}
