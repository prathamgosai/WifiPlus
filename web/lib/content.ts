import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bot,
  Boxes,
  Building2,
  Cable,
  CircleDollarSign,
  Cloud,
  Compass,
  Cpu,
  Database,
  Gauge,
  Globe2,
  Layers,
  LineChart,
  MessageSquare,
  Newspaper,
  Radar,
  Rocket,
  Router,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2,
  Waypoints,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  copy: string;
  /** Drives the per-card accent so a grid never reads as one flat colour. */
  tone: "brand" | "accent" | "violet" | "mint";
}

/* -------------------------------------------------------------------------- */
/*  Platform pillars                                                          */
/* -------------------------------------------------------------------------- */
export const features: FeatureItem[] = [
  {
    icon: Bot,
    title: "AI Internet Analyzer",
    copy: "Explains connection quality, detects bottlenecks, and recommends improvements from your real measured results.",
    tone: "brand",
  },
  {
    icon: Database,
    title: "Worldwide ISP Database",
    copy: "Modelled around Country, State, City, ISP, Plan, Reviews and Speed Test Results — extensible to 200+ markets.",
    tone: "accent",
  },
  {
    icon: Compass,
    title: "Recommendation Engine",
    copy: "Matches country, city, budget, gaming, streaming and work needs against the providers actually available to you.",
    tone: "violet",
  },
  {
    icon: Search,
    title: "Location SEO Engine",
    copy: "Generates search-ready pages like Best ISP in New York, London, Dubai, Sydney, Mumbai, Tokyo and Singapore.",
    tone: "mint",
  },
];

/* -------------------------------------------------------------------------- */
/*  Full ecosystem                                                            */
/* -------------------------------------------------------------------------- */
export const ecosystem: FeatureItem[] = [
  {
    icon: Zap,
    title: "Real speed testing",
    copy: "Download, upload, ping, jitter, packet loss, DNS response and stability, measured from live network evidence.",
    tone: "accent",
  },
  {
    icon: Wand2,
    title: "AI internet doctor",
    copy: "Explains bottlenecks, recommends router changes, suggests DNS upgrades and helps you pick a smarter plan.",
    tone: "brand",
  },
  {
    icon: Globe2,
    title: "Global ISP database",
    copy: "Provider profiles, regional availability, pricing, reviews, scorecards and comparison-ready data structures.",
    tone: "violet",
  },
  {
    icon: Radar,
    title: "Outage intelligence",
    copy: "Regional outage pages, live incident maps, provider status timelines and user-reported issue signals.",
    tone: "mint",
  },
  {
    icon: Wrench,
    title: "Tool Hub",
    copy: "A growing library of free networking tools that attract traffic, build authority and support affiliate revenue.",
    tone: "accent",
  },
  {
    icon: Newspaper,
    title: "News and content",
    copy: "Telecom news, ISP updates, outage reports and evergreen troubleshooting guides that sustain organic traffic.",
    tone: "brand",
  },
  {
    icon: Users,
    title: "Community and reviews",
    copy: "Local discussions, ISP reviews, router feedback and user-generated insight that improves trust and retention.",
    tone: "violet",
  },
  {
    icon: Building2,
    title: "Enterprise API",
    copy: "Analytics, partner dashboards and API access for ISPs, MSPs, telecom vendors and enterprise buyers.",
    tone: "mint",
  },
];

/* -------------------------------------------------------------------------- */
/*  Monetization                                                              */
/* -------------------------------------------------------------------------- */
export const monetization: FeatureItem[] = [
  {
    icon: CircleDollarSign,
    title: "Affiliate and lead generation",
    copy: "High-intent traffic from speed tests and comparison pages makes ISP and router recommendations highly monetizable.",
    tone: "mint",
  },
  {
    icon: BadgeCheck,
    title: "Premium subscriptions",
    copy: "Advanced diagnostics, historical reports, alerts and richer insight for power users and professionals.",
    tone: "brand",
  },
  {
    icon: BarChart3,
    title: "Enterprise analytics",
    copy: "Dashboards, APIs and white-label services for telecom brands, local ISPs and B2B buyers.",
    tone: "accent",
  },
  {
    icon: Rocket,
    title: "Growth and retention",
    copy: "Shareable results, ranking pages and community engagement compound through repeat visits and virality.",
    tone: "violet",
  },
];

/* -------------------------------------------------------------------------- */
/*  How it works — 4-step timeline                                            */
/* -------------------------------------------------------------------------- */
export interface Step {
  icon: LucideIcon;
  kicker: string;
  title: string;
  copy: string;
  detail: string[];
}

export const steps: Step[] = [
  {
    icon: Gauge,
    kicker: "Step 01",
    title: "Measure your real connection",
    copy: "One tap opens six parallel streams to the nearest Cloudflare edge and moves real bytes for five seconds in each direction.",
    detail: ["Warm-up discarded", "6 down / 3 up streams", "Median-based latency"],
  },
  {
    icon: Activity,
    kicker: "Step 02",
    title: "Score what the numbers mean",
    copy: "Throughput, jitter, loss and DNS response are folded into six readable scores — gaming, streaming, calls, work, DNS and overall health.",
    detail: ["0-100 health score", "Per-use-case grading", "Stability from variance"],
  },
  {
    icon: Layers,
    kicker: "Step 03",
    title: "Compare against real providers",
    copy: "Your result is placed next to providers in your city, then ranked across speed, reliability, value, gaming and streaming.",
    detail: ["24 countries sampled", "Five ranking systems", "Coverage mix per city"],
  },
  {
    icon: ShieldCheck,
    kicker: "Step 04",
    title: "Fix it, or switch",
    copy: "Upload a router screenshot and the AI Doctor flags weak security, congested channels and placement problems — or recommends a better plan.",
    detail: ["WPA3 / WPS checks", "Channel congestion", "Plan matching"],
  },
];

/* -------------------------------------------------------------------------- */
/*  Pricing — placeholder commercial packaging, swap before launch            */
/* -------------------------------------------------------------------------- */
export interface Plan {
  id: string;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  featured?: boolean;
  cta: string;
  features: string[];
}

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Everything you need to test and understand one connection.",
    monthly: 0,
    yearly: 0,
    cta: "Start testing",
    features: [
      "Unlimited real speed tests",
      "Ping, jitter, packet loss & DNS",
      "WiFi health + six use-case scores",
      "Global ISP comparison & rankings",
      "Shareable result cards",
      "No signup, no tracking wall",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For people who need evidence, not a snapshot.",
    monthly: 6,
    yearly: 58,
    featured: true,
    cta: "Upgrade to Pro",
    features: [
      "Everything in Free",
      "Scheduled background tests",
      "12-month result history & trends",
      "AI WiFi Doctor screenshot analysis",
      "Outage alerts for your provider",
      "Export to CSV, JSON and PDF",
      "Priority measurement endpoints",
    ],
  },
  {
    id: "business",
    name: "Business",
    tagline: "Multi-site monitoring and API access for teams.",
    monthly: 49,
    yearly: 470,
    cta: "Talk to us",
    features: [
      "Everything in Pro",
      "Unlimited sites and devices",
      "Team dashboards & roles",
      "Enterprise ISP intelligence API",
      "SLA-grade uptime reporting",
      "White-label result cards",
      "Dedicated support channel",
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  Testimonials                                                              */
/*  PLACEHOLDER CONTENT — these are illustrative, not real customer quotes.   */
/*  Replace with attributed reviews before this page goes to production.      */
/* -------------------------------------------------------------------------- */
export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  /** Initials render inside a gradient orb; no avatar images to load. */
  initials: string;
  rating: number;
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "The jitter and packet-loss breakdown found a bad patch cable in about four minutes. Every other speed test just told me the download number was fine.",
    name: "Sample Reviewer A",
    role: "Network engineer · placeholder",
    initials: "SA",
    rating: 5,
  },
  {
    quote:
      "I ran it before and after moving the router two metres. Seeing the WiFi health score jump 22 points made the argument for me.",
    name: "Sample Reviewer B",
    role: "Remote worker · placeholder",
    initials: "SB",
    rating: 5,
  },
  {
    quote:
      "The comparison table is the only place I have found that puts upload speed next to price. That is the number that actually matters for my uploads.",
    name: "Sample Reviewer C",
    role: "Video editor · placeholder",
    initials: "SC",
    rating: 4,
  },
  {
    quote:
      "Uploaded a screenshot of my router admin page and it immediately flagged WPS still being enabled. I had no idea.",
    name: "Sample Reviewer D",
    role: "Small business owner · placeholder",
    initials: "SD",
    rating: 5,
  },
  {
    quote:
      "Ping grading per game is a small thing but it is the reason I check this before a ranked session instead of guessing.",
    name: "Sample Reviewer E",
    role: "Competitive player · placeholder",
    initials: "SE",
    rating: 5,
  },
  {
    quote:
      "We use the result cards in support tickets. Customers send one image and we know whether it is their line or their WiFi.",
    name: "Sample Reviewer F",
    role: "ISP support lead · placeholder",
    initials: "SF",
    rating: 4,
  },
];

/* -------------------------------------------------------------------------- */
/*  About                                                                     */
/* -------------------------------------------------------------------------- */
export interface Milestone {
  year: string;
  title: string;
  copy: string;
}

export const milestones: Milestone[] = [
  {
    year: "Phase 1",
    title: "Real measurement, in the browser",
    copy: "A speed test that moves actual bytes across parallel streams instead of estimating, with jitter, loss and DNS as first-class metrics.",
  },
  {
    year: "Phase 2",
    title: "Global ISP intelligence",
    copy: "A normalized model for country, state, city, ISP, plan and coverage — seeded with 38 providers across 24 countries.",
  },
  {
    year: "Phase 3",
    title: "AI diagnosis",
    copy: "Router screenshot analysis behind an edge Worker, so the API key never ships to the browser and findings stay grounded in what is on screen.",
  },
  {
    year: "Phase 4",
    title: "Open ecosystem",
    copy: "Outage intelligence, community reviews, a public tool hub and an enterprise API for ISPs, MSPs and telecom vendors.",
  },
];

export interface Achievement {
  icon: LucideIcon;
  label: string;
  copy: string;
}

export const achievements: Achievement[] = [
  { icon: Wifi, label: "Real measurement", copy: "No simulated throughput, anywhere in the product." },
  { icon: ShieldCheck, label: "Privacy first", copy: "No account, no ad network, no result sold on." },
  { icon: Globe2, label: "15 languages", copy: "Including full right-to-left layout support." },
  { icon: Sparkles, label: "Installable", copy: "Works offline as a PWA on every major platform." },
];

/* -------------------------------------------------------------------------- */
/*  Architecture                                                              */
/* -------------------------------------------------------------------------- */
export const architecture: FeatureItem[] = [
  {
    icon: Cpu,
    title: "Frontend",
    copy: "Next.js App Router, React 19, TypeScript contracts, Tailwind design tokens and Framer Motion state choreography.",
    tone: "brand",
  },
  {
    icon: Server,
    title: "Backend",
    copy: "Node APIs, PostgreSQL for canonical ISP data, Redis for rankings and live session state, queue workers for ingestion.",
    tone: "accent",
  },
  {
    icon: Cloud,
    title: "Infrastructure",
    copy: "Cloudflare CDN and Workers, global edge measurement nodes, object storage and end-to-end observability.",
    tone: "violet",
  },
];

export const pipeline = [
  { n: "1", title: "Ingest", copy: "Regulators, provider APIs, public datasets, user submissions and verified partners." },
  { n: "2", title: "Normalize", copy: "Map country, province, city, technology, plans, currencies and coverage." },
  { n: "3", title: "Verify", copy: "Deduplicate, score confidence, flag suspicious changes and review edge cases." },
  { n: "4", title: "Rank", copy: "Aggregate speed tests, reviews, reliability, uptime, latency and value." },
  { n: "5", title: "Publish", copy: "Update APIs, search indexes, sitemap pages, comparison tables and recommendations." },
  { n: "6", title: "Learn", copy: "Feed results and reviews back into availability and quality predictions." },
];

/* -------------------------------------------------------------------------- */
/*  Community                                                                 */
/* -------------------------------------------------------------------------- */
export const community: FeatureItem[] = [
  { icon: Users, title: "User accounts", copy: "Save speed history, devices, locations, plans, favorites and alerts.", tone: "brand" },
  { icon: MessageSquare, title: "ISP reviews", copy: "Collect ratings for speed, support, value, uptime and installation quality.", tone: "accent" },
  { icon: Boxes, title: "Discussion forums", copy: "Organize local ISP issues, router problems, outages and optimization tips.", tone: "violet" },
  { icon: ShieldCheck, title: "Trust signals", copy: "SSL, privacy policy, terms, moderation and transparent data methodology.", tone: "mint" },
];

/* -------------------------------------------------------------------------- */
/*  Editorial hubs                                                            */
/* -------------------------------------------------------------------------- */
export const contentHubs = [
  {
    icon: Router,
    kicker: "ISP reviews",
    links: ["Jio Fiber Review", "Xfinity vs Verizon Fios", "Starlink Availability Guide", "BT vs Virgin Media"],
  },
  {
    icon: Wrench,
    kicker: "Troubleshooting",
    links: ["Why Is My Internet Slow?", "What Is Jitter?", "Fix YouTube Buffering", "Router Placement Guide"],
  },
  {
    icon: LineChart,
    kicker: "Use cases",
    links: ["Best Ping for Valorant", "Netflix 4K Speed Needed", "WiFi 6 vs WiFi 7", "Fiber vs Cable Internet"],
  },
];

/* -------------------------------------------------------------------------- */
/*  FAQ                                                                       */
/* -------------------------------------------------------------------------- */
export const faqs = [
  {
    q: "How are the speed tests actually measured?",
    a: "Download and upload throughput are measured by moving real bytes over six and three parallel HTTP streams against the nearest Cloudflare edge, discarding the first second while the congestion window ramps. Ping, jitter and packet loss come from repeated timed probes with the cold-handshake sample dropped. DNS latency comes from uncached DNS-over-HTTPS lookups against random hostnames.",
  },
  {
    q: "Is the ISP data real?",
    a: "No — and every screen that shows it says so. The 38 providers across 24 countries are an illustrative seed dataset that demonstrates the data model and the ranking logic. Only your own speed test reports measured numbers. Do not choose a provider based on the sample figures.",
  },
  {
    q: "Can this support 200+ countries?",
    a: "Yes, by design. The data model stores country, state, city, ISP, plan, review, speed result, coverage and ranking as separate entities, so adding a market is a data operation rather than a code change.",
  },
  {
    q: "What happens to my router screenshot?",
    a: "It is downscaled and re-encoded in your browser first, which strips EXIF metadata including GPS coordinates. The re-encoded image is then sent to a Cloudflare Worker that holds the API key server-side. The key is never shipped to the browser, and the image is not stored.",
  },
  {
    q: "Does it work offline?",
    a: "The interface is installable as a PWA and the shell is cached by a service worker, so it opens offline. The speed test itself needs a connection for obvious reasons.",
  },
  {
    q: "Why do results differ from other speed tests?",
    a: "Most tests report a peak burst. This one reports sustained throughput over a five-second window with the ramp-up excluded, which is closer to what a large download or a video call will actually get. Latency is reported as a median rather than a best case.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Hero trust strip                                                          */
/* -------------------------------------------------------------------------- */
export const heroStats = [
  { value: 38, suffix: "", label: "ISPs in sample data" },
  { value: 24, suffix: "", label: "countries covered" },
  { value: 15, suffix: "", label: "languages shipped" },
  { value: 7, suffix: "", label: "live metrics per test" },
];

export const capabilityChips = [
  { icon: Zap, label: "Real throughput" },
  { icon: Waypoints, label: "Jitter & loss" },
  { icon: Cable, label: "DNS latency" },
  { icon: ShieldCheck, label: "No signup" },
];
