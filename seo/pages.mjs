/**
 * Search-intent landing pages.
 * -----------------------------------------------------------------------------
 * The site had exactly one indexable page trying to rank for every query at
 * once. Google ranks pages, not sites, so a page about everything competes for
 * nothing: "ping test" and "bufferbloat test" are different intents and need
 * different pages, each with its own title, H1, copy and FAQ.
 *
 * Every page here answers a question the tool genuinely measures. Nothing is
 * padded to hit a word count — thin near-duplicates read as doorway pages and
 * get demoted, which is worse than not publishing them.
 *
 * `scripts/build-seo.mjs` turns this into static HTML plus the sitemap.
 */

export const SITE = {
  url: "https://wifiplus.prathamgosai.in",
  name: "WifiPlus",
  author: "Pratham Gosai",
  /** Home page <lastmod>. Bump when the home page's content actually changes. */
  updated: "2026-08-05",
};

/**
 * @typedef {object} FaqItem
 * @property {string} q
 * @property {string} a
 */

/**
 * @typedef {object} SeoPage
 * @property {string} slug URL path segment.
 * @property {string} updated ISO date the CONTENT last changed — this becomes
 *   <lastmod>. Deliberately declared rather than taken from the build clock: a
 *   lastmod that always says "today" is treated as noise and ignored, and a
 *   build whose output changes daily can never be checked for staleness in CI.
 * @property {string} title <title> and og:title.
 * @property {string} description meta description, 140-165 chars.
 * @property {string} h1
 * @property {string} standfirst One sentence under the H1.
 * @property {string} metric Which measurement the dial leads with.
 * @property {string[]} intro Opening paragraphs — the substance of the page.
 * @property {{ heading: string, body: string }[]} sections
 * @property {FaqItem[]} faq
 * @property {string[]} related slugs
 */

/** @type {SeoPage[]} */
export const PAGES = [
  {
    slug: "internet-speed-test",
    updated: "2026-08-05",
    title: "Internet Speed Test — Download, Upload, Ping and Jitter | WifiPlus",
    description:
      "Free internet speed test for download, upload, ping, jitter, packet loss, DNS and bufferbloat. Real browser measurement with no app or signup.",
    h1: "Internet speed test",
    standfirst:
      "Run one complete browser test for the numbers that decide how your internet actually feels.",
    metric: "download",
    intro: [
      "A good internet speed test should not stop at a single download number. Browsing, gaming, streaming, video calls and cloud backup stress different parts of the connection, so WifiPlus measures throughput, latency, jitter, packet loss, DNS latency and latency under load in one run.",
      "The test moves real bytes over HTTP streams, times repeated small probes and reports the sustained result after warm-up. That avoids the most common failure in browser tests: showing a short startup burst as if it were the speed your connection can hold.",
    ],
    sections: [
      {
        heading: "What each number means",
        body: "Download controls how quickly pages, videos and files arrive. Upload controls sending files, livestreaming and video calls. Ping is the delay before anything responds. Jitter is how much that delay changes between packets. Packet loss is data that never arrives. DNS latency is the lookup delay before a site starts loading. Bufferbloat is the latency added when the connection is busy.",
      },
      {
        heading: "Why the result can differ from your plan",
        body: "Your plan is the maximum rate sold by the provider. The result is the rate your current device, WiFi link, router, provider route and test server can sustain right now. VPNs, old wireless cards, weak signal, peak-hour congestion and background uploads can all lower the measured number without changing the plan itself.",
      },
      {
        heading: "How to get a clean test",
        body: "Run once on WiFi where you normally use the device, then run again near the router or over Ethernet. Close large downloads, pause cloud backup and avoid testing through a VPN unless the VPN is the thing you want to measure. Two or three consistent runs are more useful than one unusually high result.",
      },
    ],
    faq: [
      {
        q: "Is this internet speed test accurate?",
        a: "It measures real transferred bytes and real timed probes, so it accurately describes the browser and network path being tested. Device limits, VPNs, WiFi quality and server routing still affect the result because they are part of that real path.",
      },
      {
        q: "What is a good internet speed?",
        a: "For a single person, 50-100 Mbps down is comfortable. A busy household with 4K streams, game downloads and calls usually benefits from 250 Mbps or more. Upload, latency and stability matter as much as download for work and calls.",
      },
      {
        q: "Why does speed change every time I test?",
        a: "Shared networks change minute by minute. WiFi airtime, router queues, provider congestion and background traffic all vary, so the useful result is the pattern across repeated tests.",
      },
    ],
    related: ["wifi-speed-test", "ping-test", "bufferbloat-test"],
  },

  {
    slug: "wifi-speed-test",
    updated: "2026-08-05",
    title: "WiFi Speed Test — Measure Your Actual Wireless Speed | WifiPlus",
    description:
      "Free WiFi speed test that measures real download, upload, ping and packet loss in your browser. See what your wireless link actually delivers — no app, no signup.",
    h1: "WiFi speed test",
    standfirst:
      "Measure what your wireless connection actually delivers right now — not what the plan promises.",
    metric: "download",
    intro: [
      "A WiFi speed test measures the connection between your device and the internet across the wireless hop in between. That distinction matters more than most people expect: your broadband line can be perfectly healthy while the WiFi in front of it throws away half the speed you pay for.",
      "This test moves real bytes over your connection and times them. It opens up to eight parallel streams to the nearest edge node, discards the first half-second while the congestion window ramps up, and reports the sustained rate over the remaining window. That is why the number settles rather than spiking — the spike is the ramp, and reporting it would flatter your connection.",
    ],
    sections: [
      {
        heading: "Why your WiFi speed is lower than your plan speed",
        body: "Wireless is a shared, half-duplex medium. Every device on the band takes turns, and each one that is far from the router or stuck on 2.4 GHz slows the turns down for everyone. Distance, walls, neighbouring networks on the same channel, and older devices that force the access point down to a slower rate all take their cut. A 300 Mbps plan measured at 90 Mbps over WiFi usually means the line is fine and the wireless hop is the bottleneck — which is worth knowing, because it is the part you can actually fix.",
      },
      {
        heading: "Test on WiFi, then test on a cable",
        body: "The fastest way to separate the two is to run this test twice: once on WiFi, once with an Ethernet cable to the same router. If the wired result is close to your plan and the wireless result is not, the problem is placement, channel or band — not your provider. If both are low, the line or the provider is the constraint and no amount of router tuning will help.",
      },
      {
        heading: "What a good result looks like",
        body: "For streaming and browsing, sustained download matters most. For video calls and cloud backups, upload matters more and is usually a fraction of download. For games and calls, neither number decides the experience — latency, jitter and latency under load do, which is why this test measures all of them in the same run rather than reporting a headline speed alone.",
      },
    ],
    faq: [
      {
        q: "Why is my WiFi speed test slower than my internet plan?",
        a: "The wireless hop between your device and router is almost always the narrowest part of the path. Distance, walls, 2.4 GHz congestion and older devices all reduce the rate your access point can sustain. Testing over an Ethernet cable tells you whether the line or the WiFi is responsible.",
      },
      {
        q: "Does a browser speed test give accurate results?",
        a: "For the link itself, yes — it measures bytes actually transferred over your real connection. What it cannot separate is your device's own limits: an old wireless card, a busy CPU, or a VPN will all cap the result below what the line could carry.",
      },
      {
        q: "How many times should I test?",
        a: "Run it two or three times a few minutes apart. A single result captures one moment, and shared media like WiFi and cable broadband vary minute to minute. Consistent results across runs are far more meaningful than one high number.",
      },
      {
        q: "Does this test use my data allowance?",
        a: "Yes. Measuring throughput requires moving real data — expect roughly 50-150 MB depending on how fast your connection is. On a metered mobile plan, test sparingly.",
      },
    ],
    related: ["ping-test", "bufferbloat-test", "packet-loss-test"],
  },

  {
    slug: "wifi-analyzer",
    updated: "2026-08-05",
    title: "WiFi Analyzer — Diagnose Slow Wireless, Jitter and Coverage | WifiPlus",
    description:
      "Free WiFi analyzer for speed, ping, jitter, packet loss, DNS and bufferbloat. Diagnose slow wireless, weak signal and router queueing.",
    h1: "WiFi analyzer",
    standfirst:
      "Find whether your slow internet is really the provider, the router, or the wireless hop in your home.",
    metric: "jitter",
    intro: [
      "A WiFi analyzer is useful only if it separates symptoms. Slow download suggests weak signal or congestion. High jitter suggests inconsistent airtime. Packet loss points to interference or a failing path. Bufferbloat points to router queues. WifiPlus measures those symptoms together so you can fix the right layer.",
      "The browser cannot see every radio detail your router sees, but it can measure the end result: how the network behaves from the device you actually use. That is often the more important view, because a perfect router status page does not help if your laptop in the bedroom drops packets.",
    ],
    sections: [
      {
        heading: "The fastest diagnosis path",
        body: "Start with the test where the problem happens. If WiFi is slow, repeat near the router. If it improves sharply, coverage or interference is the issue. If it stays bad, repeat over Ethernet. If Ethernet is also poor, look at the provider, modem or router CPU. If only calls fail while downloads are fast, look at jitter, loss and bufferbloat before buying a faster plan.",
      },
      {
        heading: "What weak WiFi looks like",
        body: "Weak WiFi usually shows lower download, lower upload, higher jitter and sometimes packet loss. The result may change dramatically when you move a few meters because walls, furniture, neighboring networks and device antenna orientation all change the radio path.",
      },
      {
        heading: "What router queueing looks like",
        body: "Router queueing looks different: idle ping can be excellent, but latency under load jumps when a download or upload starts. That means the wireless signal may be fine while the router buffers too much data. Smart Queue Management is the fix; a speed upgrade often leaves the problem untouched.",
      },
    ],
    faq: [
      {
        q: "Can a browser analyze WiFi?",
        a: "It cannot read every router radio statistic, but it can measure the user-visible effects: throughput, ping, jitter, loss and latency under load from the device you are using.",
      },
      {
        q: "How do I know if my router placement is bad?",
        a: "If results improve greatly near the router and degrade in one room, placement, walls or interference are likely. Put the router central, elevated and away from metal, cabinets and thick walls.",
      },
      {
        q: "Should I use 2.4 GHz, 5 GHz or 6 GHz?",
        a: "Use 5 GHz or 6 GHz when you are near the router and need speed or low jitter. Use 2.4 GHz for range and low-bandwidth smart devices, but expect more congestion.",
      },
    ],
    related: ["wifi-speed-test", "jitter-test", "bufferbloat-test"],
  },

  {
    slug: "ping-test",
    updated: "2026-08-05",
    title: "Ping Test — Measure Latency, Median and p95 | WifiPlus",
    description:
      "Free browser ping test showing median latency, the p95 tail and packet loss from up to 20 probes. See the delay that actually affects calls and games.",
    h1: "Ping test",
    standfirst: "Latency decides how responsive your connection feels. Speed does not.",
    metric: "ping",
    intro: [
      "Ping is the round trip time between your device and a server: how long a single small request takes to go out and come back. It is measured in milliseconds, and it is the number that decides whether a video call feels natural, whether a game registers your input, and whether a web page appears instantly or after a beat.",
      "This test sends up to twenty separate probes and reports the whole distribution rather than one number — the minimum, the median, the 95th percentile and the maximum. A single ping figure hides the thing that actually ruins calls: the occasional probe that takes five times as long as the rest.",
    ],
    sections: [
      {
        heading: "Why the median, not the average",
        body: "One scheduling hiccup on a busy device can add hundreds of milliseconds to a single probe. An average drags that outlier into every reported result; a median ignores it and describes the typical round trip honestly. That is why the headline figure here is the median of the samples, with the outliers reported separately where you can see them for what they are.",
      },
      {
        heading: "The p95 is the number that hurts",
        body: "The 95th percentile is the latency your worst one-in-twenty packets experience. A connection with a 20 ms median and a 400 ms p95 will feel unpredictable — mostly fine, then suddenly stuttering — even though its headline ping looks excellent. Calls and competitive games break on the tail, not the median, so this test measures and reports it.",
      },
      {
        heading: "What counts as good latency",
        body: "Under 20 ms is excellent and typical of fibre to a nearby server. 20-50 ms is good and will not be noticed in normal use. 50-100 ms is fine for browsing and video but noticeable in fast games. Above 150 ms, calls start to develop the talking-over-each-other problem. Satellite links sit far above this range by physics, not by fault.",
      },
    ],
    faq: [
      {
        q: "What is a good ping for gaming?",
        a: "Under 30 ms to the game server is comfortable for most competitive titles, and under 50 ms is playable. Consistency matters as much as the number: 40 ms that never varies beats 20 ms that spikes to 200.",
      },
      {
        q: "Why does my ping change between tests?",
        a: "Ping depends on the route, the server you reach, and how busy your own link is at that moment. Testing while something is downloading will inflate the result — which is itself worth measuring, and is what the bufferbloat test isolates.",
      },
      {
        q: "Can I lower my ping?",
        a: "Some of it is physics — distance to the server sets a floor no equipment can beat. The part you can change: use Ethernet instead of WiFi, avoid a congested 2.4 GHz band, close background uploads, and enable Smart Queue Management on your router to stop latency rising under load.",
      },
      {
        q: "Is ping the same as latency?",
        a: "In everyday use, yes. Strictly, latency is the one-way delay and ping is the round trip, so ping is roughly double the one-way latency plus the server's own processing time.",
      },
    ],
    related: ["jitter-test", "bufferbloat-test", "packet-loss-test"],
  },

  {
    slug: "jitter-test",
    updated: "2026-08-05",
    title: "Jitter Test — Measure Latency Variation | WifiPlus",
    description:
      "Free jitter test measuring how much your latency varies between packets. High jitter is why calls sound robotic even when your speed test looks fine.",
    h1: "Jitter test",
    standfirst: "Jitter is why a call breaks up on a connection whose speed test looks perfect.",
    metric: "jitter",
    intro: [
      "Jitter is the variation in latency between consecutive packets. If ten packets arrive 20 ms apart and the eleventh arrives 90 ms later, that gap is jitter — and it is the reason voices turn robotic, video freezes for a beat, and games rubber-band while every headline number on your speed test still looks healthy.",
      "This test measures it the way real-time protocols do: the mean absolute difference between consecutive round trips, computed in arrival order. That ordering matters. Sorting the samples first and then measuring the spread produces a nice-looking number that describes nothing a call would ever experience.",
    ],
    sections: [
      {
        heading: "Why jitter breaks calls and speed tests do not catch it",
        body: "Voice and video are streams with a deadline. Each packet has a moment when it must be played, and one that arrives late is not late — it is lost, because the moment has passed. Applications hide this with a jitter buffer that holds audio for a few tens of milliseconds before playing it, but the buffer can only absorb variation it was sized for. Beyond that, you hear the gaps. A bulk download does not care about any of this, which is why throughput can look excellent on a connection nobody can hold a call on.",
      },
      {
        heading: "What causes it",
        body: "WiFi contention is the most common source: every device sharing the band takes turns, and the wait for a turn is not constant. Overloaded router queues add more, especially while something else is uploading. Powerline adapters, interference from neighbouring networks, and aggressive power saving on laptops and phones all contribute. Wired connections to an uncongested router typically show jitter under 2 ms.",
      },
      {
        heading: "Reading the result",
        body: "Below 5 ms is excellent and will never be audible. 5-20 ms is normal for WiFi and fine for most calls. Between 20 and 50 ms, longer calls start to develop dropouts. Above 50 ms, real-time use is genuinely degraded, and the fix is usually the wireless hop or the router queue rather than the internet connection itself.",
      },
    ],
    faq: [
      {
        q: "What is a good jitter value?",
        a: "Under 5 ms is excellent, under 20 ms is fine for video calls, and above 50 ms will cause audible dropouts and stuttering video.",
      },
      {
        q: "Why is my jitter high but my speed good?",
        a: "They measure different things. Throughput is about volume over time; jitter is about the consistency of individual packet timing. WiFi contention and router queueing wreck the second while leaving the first untouched.",
      },
      {
        q: "How do I fix high jitter?",
        a: "Move to Ethernet or 5 GHz WiFi, get closer to the router, stop large background uploads during calls, and enable Smart Queue Management (fq_codel or CAKE) if your router supports it.",
      },
    ],
    related: ["ping-test", "bufferbloat-test", "wifi-speed-test"],
  },

  {
    slug: "packet-loss-test",
    updated: "2026-08-05",
    title: "Packet Loss Test — Find Dropped Packets | WifiPlus",
    description:
      "Free packet loss test. Even 1-2% loss causes stalling video, dropped calls and rubber-banding in games while your speed test still looks normal.",
    h1: "Packet loss test",
    standfirst: "A connection can lose packets and still report a perfect download speed.",
    metric: "loss",
    intro: [
      "Packet loss is the share of data that never arrives and has to be sent again. Small amounts are normal on any network, but the effect is wildly disproportionate: 1-2% loss is enough to stall video, drop words out of calls and make games rubber-band, while a speed test that retransmits quietly in the background still reports a healthy number.",
      "This test counts probes that never came back, as a percentage of probes actually sent. It is deliberately measured on small requests rather than during a bulk transfer, so what you see is the network dropping data — not your own download saturating the link and causing drops as a side effect.",
    ],
    sections: [
      {
        heading: "Why a little loss causes a lot of damage",
        body: "TCP, which carries most web traffic, treats loss as a congestion signal: it retransmits the missing data and then deliberately slows down. So loss costs you the round trip needed to notice and resend, plus a throughput reduction afterwards. Real-time traffic has it worse. Voice and video usually run over UDP with no retransmission at all, because a packet that arrives late is useless — so a lost packet is simply a gap you hear.",
      },
      {
        heading: "Common causes",
        body: "On WiFi: weak signal, interference, and a band so congested that transmissions collide. On the wire: a failing cable, a dying port, or an overloaded link somewhere upstream. Inside your home: a router whose queues are full, which drops what it cannot hold. Persistent loss on a wired connection to the router almost always points at hardware or at the provider, and is worth reporting with evidence from repeated tests.",
      },
      {
        heading: "Reading the result",
        body: "0% is what a healthy connection reports and what you should expect most of the time. Anything sustained above 1% will be noticeable in calls and games. Above 5%, ordinary browsing starts to feel broken. Loss that appears only while something else is downloading is a queue problem rather than a line fault — the bufferbloat test measures that case directly.",
      },
      {
        heading: "What a browser can and cannot see",
        body: "Be aware of what this figure is. A web page cannot watch individual packets: TCP quietly resends anything that goes missing, so by the time data reaches the browser the loss has already been repaired and hidden. What this test measures is the share of its latency probes that never came back at all within a deadline. That is a genuine signal — a connection dropping whole requests is in worse shape than one merely resending packets — but it is a proxy, and it will read 0% on a line that is quietly retransmitting. A dedicated tool running outside the browser, or your router's own statistics, can see the real per-packet figure.",
      },
    ],
    faq: [
      {
        q: "How much packet loss is acceptable?",
        a: "Effectively zero for real-time use. Under 1% is tolerable for browsing and downloads; above 1% degrades calls and games; above 5% makes normal use feel broken.",
      },
      {
        q: "Can packet loss cause buffering even on fast internet?",
        a: "Yes, and it is one of the most common reasons for it. Lost packets force retransmission and slow the connection down, so a nominally fast line delivers stuttering video.",
      },
      {
        q: "How do I find what is dropping packets?",
        a: "Test on WiFi, then on a cable to the same router. If loss disappears on the cable, the wireless hop is responsible. If it persists on the cable, test at different times — loss that only appears at peak hours usually indicates congestion upstream of your home.",
      },
    ],
    related: ["ping-test", "jitter-test", "bufferbloat-test"],
  },

  {
    slug: "bufferbloat-test",
    updated: "2026-08-05",
    title: "Bufferbloat Test — Latency Under Load, Graded A+ to F | WifiPlus",
    description:
      "Free bufferbloat test measuring how far your latency rises while the connection is saturated, graded A+ to F. This is why calls break when someone downloads.",
    h1: "Bufferbloat test",
    standfirst:
      "This is the measurement that explains why your call falls apart the moment someone else starts a download.",
    metric: "bufferbloat",
    intro: [
      "Bufferbloat is what happens when a network device holds on to far more data than it should. Memory is cheap, so routers and modems shipped with large buffers on the theory that holding packets is better than dropping them. The result is the opposite of what was intended: when the link fills, that buffer fills too, and every packet behind it waits in a queue that can be seconds deep.",
      "The symptom is unmistakable once you know it. Everything is fine until someone starts a large upload or download, and then calls stutter, pages hang and games become unplayable — while a speed test run at the same moment still reports the full advertised speed. The bandwidth was never the problem. The queue was.",
    ],
    sections: [
      {
        heading: "How this test measures it",
        body: "Idle latency is measured first, on an unloaded connection. Then latency is probed again during the real download, while the link is genuinely saturated by the test's own traffic. The difference between those two medians is your bufferbloat, and it is graded from A+ (under 5 ms of added latency) to F (over 200 ms). Measuring during the actual download rather than a synthetic load means the result reflects a condition your connection really experiences.",
      },
      {
        heading: "What the grade means for you",
        body: "A+ or A means your router keeps queues short and your calls will survive other people's downloads. B or C means noticeable queueing that you will feel during video calls. D or F means your latency multiplies under load — a 20 ms connection becoming 500 ms whenever anyone downloads — and no speed upgrade will fix it, because the constraint is the queue, not the capacity.",
      },
      {
        heading: "How to fix it",
        body: "The fix is Smart Queue Management: an algorithm such as fq_codel or CAKE that keeps queues short and shares the link fairly between connections. Many modern routers include it under names like SQM, Smart Queues, Bufferbloat control or Adaptive QoS. OpenWrt supports it fully. Setting it up typically means enabling SQM and telling it your line's real speed, slightly under-declared so the queue forms in your router — where the smart algorithm controls it — rather than in your provider's equipment, where nothing does.",
      },
    ],
    faq: [
      {
        q: "What is bufferbloat?",
        a: "Excess latency caused by oversized network buffers. When a link saturates, packets queue in those buffers instead of being dropped, so delay climbs from milliseconds to hundreds of milliseconds while throughput stays high.",
      },
      {
        q: "How do I know if I have bufferbloat?",
        a: "Run this test. If your latency under load is far above your idle latency — a grade of C or worse — you have it. The everyday sign is calls and games breaking specifically when someone else in the house is downloading.",
      },
      {
        q: "Does more bandwidth fix bufferbloat?",
        a: "No. A faster plan fills its buffers just as completely, only faster. The fix is queue management, not capacity, which is why upgrading a plan so often fails to solve the problem people bought it to solve.",
      },
      {
        q: "What is a good bufferbloat grade?",
        a: "A+ or A. That means under 30 ms of added latency while the link is saturated, which keeps real-time applications usable no matter what else is running.",
      },
    ],
    related: ["ping-test", "jitter-test", "wifi-speed-test"],
  },

  {
    slug: "dns-speed-test",
    updated: "2026-08-05",
    title: "DNS Speed Test — Measure Domain Resolution Time | WifiPlus",
    description:
      "Free DNS speed test measuring uncached domain resolution time. Slow DNS makes every site feel sluggish before a single byte of the page is requested.",
    h1: "DNS speed test",
    standfirst:
      "Every page load starts with a DNS lookup. A slow resolver delays everything that follows.",
    metric: "dns",
    intro: [
      "Before your browser can request a page, it has to turn the domain name into an IP address. That lookup happens before anything else — before the connection, before the first byte, before any of the speed you pay for is involved at all. When it is slow, every site feels sluggish in a way no speed test explains.",
      "This test measures an uncached lookup deliberately. It requests a randomly generated hostname so the answer cannot already be sitting in a cache, which means what you see is the true cost of a real recursive resolution rather than the near-zero time of a repeat lookup.",
    ],
    sections: [
      {
        heading: "Which resolver this actually times",
        body: "This test times a DNS-over-HTTPS lookup against Cloudflare's resolver at 1.1.1.1. It is not querying whichever resolver your operating system is configured to use, because a web page has no way to reach that: the browser gives JavaScript no access to the system resolver. So treat this as a reading of what a fast public resolver costs you from where you are sitting — a good benchmark for the network path and a fair comparison point, but not a verdict on your ISP's own DNS. If this number is good and browsing still feels slow to start, your configured resolver is worth testing separately from the command line with dig or nslookup.",
      },
      {
        heading: "Why uncached is the honest measurement",
        body: "Measuring a domain you just visited tells you how fast your cache is, which is not useful — it will always be fast. The first visit to any new domain pays the full resolution cost, and a page pulling assets from several different hosts pays it several times over. That is the number that shapes how the web actually feels, so that is the one measured here.",
      },
      {
        heading: "Reading the result",
        body: "Under 20 ms indicates a well-placed resolver and is what a good public DNS service delivers. 20-60 ms is normal. Above 100 ms is slow enough to be perceptible on every first visit to a site. Consistently high figures usually point at an ISP resolver that is overloaded or geographically distant.",
      },
      {
        heading: "Changing your DNS resolver",
        body: "You are not required to use your provider's resolver. Cloudflare's 1.1.1.1, Google's 8.8.8.8 and Quad9's 9.9.9.9 are all free, and are frequently faster than an ISP's default. Change it once in your router and every device on the network benefits. Worth knowing before you switch: your resolver sees every domain you look up, so the choice is about privacy as much as speed — all three publish policies on what they log, and they differ.",
      },
    ],
    faq: [
      {
        q: "What is a good DNS response time?",
        a: "Under 20 ms is excellent, under 60 ms is normal, and above 100 ms is slow enough to notice on the first visit to any new site.",
      },
      {
        q: "Will changing DNS make my internet faster?",
        a: "It will not raise your bandwidth. It reduces the delay before each new domain starts loading, which makes browsing feel faster even though the measured speed is unchanged.",
      },
      {
        q: "Why does this test use a random hostname?",
        a: "To defeat caching. A domain you have visited before answers from cache almost instantly and tells you nothing about your resolver's real speed.",
      },
    ],
    related: ["ping-test", "wifi-speed-test", "packet-loss-test"],
  },
];

/** Slug → page, for cross-linking. */
export const BY_SLUG = Object.fromEntries(PAGES.map((page) => [page.slug, page]));
