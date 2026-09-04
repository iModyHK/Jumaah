// English copy. Every string here is product-facing and verified against the Jumaah codebase.
export default {
  lang: "en",
  dir: "ltr",
  path: "/en/",
  altPath: "/",
  altLabel: "العربية",
  demoPath: "/en/demo",
  title: "Jumaah · Live Friday khutbah translation for mosques",
  description: "Jumaah shows the Friday khutbah on your mosque's screens and on worshippers' phones, paragraph by paragraph, in their languages, while the imam reads in Arabic. Free forever, works offline.",

  nav: { how: "How it works", features: "Features", install: "Install", faq: "FAQ", contact: "Contact", cta: "Get it now" },

  hero: {
    h1: "Every worshipper understands the Friday khutbah.",
    lede: "The imam reads in Arabic. Screens and phones show each paragraph in the languages of the people in the hall.",
    cta1: "Get it now",
    cta2: "See how it works",
    tags: ["Free forever", "Local-first", "Works offline"],
    control: { title: "Imam control", prev: "Previous", next: "Next", paragraph: "Paragraph", of: "of", hint: "Tap Next and watch the display update" },
    display: { mosque: "Demo mosque · Main hall", live: "LIVE", measured: "measured in your browser", quran: "Qur'an · published translation" },
  },

  how: {
    eyebrow: "How a Friday works",
    h2: "Prepare once. On Friday, one button.",
    steps: [
      { title: "Prepare", line: "Paste or upload the khutbah. It is split into paragraphs." },
      { title: "Translate", line: "Machine draft in every language you need." },
      { title: "Human review", line: "A reviewer approves each translation." },
      { title: "Imam goes live", line: "The imam taps Next on a tablet." },
      { title: "Displays & phones", line: "Every screen and phone follows instantly." },
    ],
  },

  demo: {
    eyebrow: "Product demo",
    h2: "Try the whole Friday in your browser.",
    line: "Drive the imam control, switch the display language, and cut the internet to see the khutbah continue.",
    cta: "Open the full demo",
    bullets: ["Imam control: Next / Previous", "Display language: English, Urdu, Bengali", "Simulate internet loss"],
  },

  quran: {
    eyebrow: "Qur'an and human review",
    h2: "Sacred text stays sacred.",
    quranTitle: "Qur'anic verses are never machine-translated",
    quranPoints: [
      "Detected by ornate brackets ﴿ ﴾, curly braces, the phrase \"قال تعالى\", or a surah:ayah reference. A reviewer can correct the mark by hand.",
      "The reviewer enters a published translation per language. For English we recommend Saheeh International. Jumaah ships no Qur'an translation of its own.",
    ],
    hadithTitle: "Hadith is handled separately",
    hadithPoints: [
      "Detected by narration formulas such as \"قال رسول الله\", \"رواه البخاري\" or \"متفق عليه\", and kept out of machine translation by default. The mosque may machine-draft it, but it still needs approval.",
    ],
    reviewTitle: "Human review is required, not optional",
    reviewPoints: [
      "Screens show a translation only after the mosque administration or a designated translator approves it, paragraph by paragraph or all at once.",
    ],
    flow: { detected: "Detected", excluded: "Excluded from machine translation", published: "Published translation entered", approved: "Approved by reviewer", shown: "Shown on screen", draft: "Machine draft", verseTag: "Qur'an · 62:9", hadithTag: "Hadith · Muslim" },
  },

  offline: {
    eyebrow: "Offline architecture",
    h2: "Everything runs inside the mosque.",
    line: "A small box on the mosque Wi-Fi serves the imam, the screens and the phones. The cloud is optional and only syncs.",
    toggle: "Disconnect internet",
    nodes: { imam: "Imam tablet", box: "Jumaah Box", displays: "Displays", projectors: "Projectors", phones: "Phones", cloud: "Cloud", cloudSub: "optional · sync only", boundary: "Mosque local network", active: "Active", offline: "Offline", stillLive: "Local network · still live" },
  },

  features: {
    eyebrow: "Features",
    cards: [
      { title: "Qur'an-safe", line: "Verses are detected and excluded from machine translation." },
      { title: "Human-reviewed", line: "Nothing reaches a screen without approval." },
      { title: "Offline-first", line: "Runs on the mosque network without internet." },
      { title: "Multilingual", line: "Up to four languages per screen, correct script and direction." },
      { title: "Any display", line: "Any TV, projector or tablet with a browser." },
      { title: "Private by default", line: "Khutbahs stay on the mosque's own box." },
    ],
  },

  languages: {
    eyebrow: "Languages",
    h2: "The right script, the right direction.",
    line: "Switch the display below. Each language uses its own font and text direction.",
  },

  phone: {
    eyebrow: "On the worshipper's phone",
    h2: "Scan, pick a language, follow along.",
    steps: ["Scan the QR on the screen", "The khutbah opens in the browser", "Pick a language", "Follow live"],
    noApp: "No app required.",
    mock: { title: "Choose your language", following: "Following live" },
    qrCaption: "Scan to open the demo on your phone",
  },

  install: {
    eyebrow: "Installation",
    h2: "Three parts. Three steps.",
    parts: [
      { title: "Jumaah Box", line: "Any small computer on the mosque network." },
      { title: "Mosque Wi-Fi", line: "The network you already have." },
      { title: "Any browser display", line: "TV, projector or tablet." },
    ],
    steps: [
      { title: "Connect", line: "Plug the box into the mosque network." },
      { title: "Install", line: "Run the installer. It sets everything up and prints the admin login." },
      { title: "Open", line: "Open the screen link on each display. Add the imam tablet." },
    ],
  },

  free: {
    eyebrow: "Pricing",
    h2: "Free. For every mosque, forever.",
    line: "$0 · Unlimited khutbahs · Unlimited languages · Unlimited screens · No ads · No premium tier",
    why: "Why is it free?",
    whyBody: "Jumaah is given as sadaqah jariyah. The only costs are your own hardware and, if you choose a paid AI provider, its usage on your own account.",
  },

  hadith: {
    ar: "إِذَا مَاتَ الإِنْسَانُ انْقَطَعَ عَنْهُ عَمَلُهُ إِلا مِنْ ثَلاثَةٍ: إِلا مِنْ صَدَقَةٍ جَارِيَةٍ، أَوْ عِلْمٍ يُنْتَفَعُ بِهِ، أَوْ وَلَدٍ صَالِحٍ يَدْعُو لَهُ",
    text: "When a person dies, their deeds come to an end except for three: ongoing charity, knowledge that benefits others, or a righteous child who prays for them.",
    source: "Sahih Muslim",
  },

  proof: { eyebrow: "In mosques today", counters: { mosques: "Mosques", languages: "Languages", khutbahs: "Khutbahs", worshippers: "Worshippers" } },

  faq: {
    eyebrow: "FAQ",
    h2: "Questions mosques ask",
    items: [
      { q: "What hardware do I need?", a: "A small x86 or ARM computer with 4 GB of RAM for the box, and any TV, projector or tablet with a browser." },
      { q: "Which languages are supported?", a: "Any language your translation engine can produce, shown in the correct script and direction. Up to four per screen." },
      { q: "Where is our data?", a: "On the box inside your mosque. Sharing a khutbah with other mosques is opt-in per khutbah." },
      { q: "Does the imam need to change anything?", a: "No. He reads in Arabic at his own pace and taps Next. If he departs from the text, one tap shows \"the imam is speaking\" on the screens until he returns." },
    ],
  },

  reliability: {
    eyebrow: "Built for reliability",
    bullets: ["Local-first", "Realtime", "Docker deployment", "ARM / x86", "PostgreSQL"],
  },

  cta: {
    h2: "Get Jumaah for your mosque",
    tags: ["Free forever", "Local-first", "Works offline"],
    get: "Get it now",
    sub: "The installer, the source code and the setup guide are on GitHub.",
    form: { title: "Have a question?", mosque: "Your name or mosque", contact: "Email or WhatsApp", question: "Your question", submit: "Send question", fine: "Protected by Cloudflare Turnstile. We only use this to reply to you." },
    status: { sending: "Sending…", ok: "Received. We will reply soon.", err: "Could not send. Please try again in a moment.", captcha: "Please complete the verification first.", required: "Please fill in all three fields." },
  },

  repo: { label: "Source code on GitHub", version: "Version", issues: "Report a problem", license: "License:" },

  installPath: "/en/install",
  installPage: {
    title: "Install Jumaah in your mosque",
    h1: "Install Jumaah in your mosque.",
    lede: "Written for the person who will set it up. No programming needed. If anything is unclear, ask through the form and we will help.",
    copy: "Copy", copied: "Copied",
    needTitle: "What you need",
    need: [
      { title: "The Jumaah Box", line: "Any small computer: a mini PC, a Raspberry Pi 4 or 5, or an old laptop. 4 GB of RAM is enough. Debian or Ubuntu installed, x86 or ARM." },
      { title: "Mosque Wi-Fi or LAN", line: "The box, the screens and the imam's tablet must be on the same network. Internet is optional." },
      { title: "Screens", line: "Any TV, projector or tablet with a browser. A cheap Android TV box or a Raspberry Pi behind an existing TV also works." },
      { title: "A tablet for the imam", line: "Any tablet with a browser. It shows the Arabic text in large type and the Next button." },
    ],
    steps: [
      { title: "Connect the box", body: "Plug the box into the mosque network with a cable if you can, or join the Wi-Fi. Note its IP address from your router or with the command below.", code: "hostname -I" },
      { title: "Run the installer", body: "Open a terminal on the box and run this one command. It installs Docker, downloads Jumaah, starts it, and prints the first administrator login at the end. Keep that login.", code: "curl -fsSL https://raw.githubusercontent.com/iModyHK/Jumaah/main/infra/scripts/edge-install.sh | bash" },
      { title: "First login", body: "On any device on the same network open the admin page, sign in with the printed login, change the password, and set your mosque name and the languages your congregation needs.", code: "http://<box-ip>:8080/admin/" },
      { title: "Add the screens", body: "Admin → Displays → Add. Choose the languages (up to four) and the layout. Open the screen link on each TV or projector once and tap it to go full screen. It reconnects by itself after a power cut.", code: "http://<box-ip>:8080/display/<screen-token>" },
      { title: "Add the imam", body: "Admin → Users → Add, role Imam. On the imam's tablet open the imam page and sign in. Add it to the home screen so it opens like an app.", code: "http://<box-ip>:8080/imam/" },
      { title: "The first khutbah", body: "Admin → Khutbahs → New. Paste the Arabic text or upload a Word file. Click Translate, then review and approve each language. On Friday the imam picks the khutbah, taps Go live, and then Next after each paragraph." },
    ],
    optionalTitle: "Optional",
    optional: [
      { title: "Translate without internet", body: "Run a local AI model on the box (needs 8 GB of RAM or more). Then add it in Admin → Translation providers as Ollama at http://ollama:11434.", code: "cd /opt/jumaah && docker compose -f docker-compose.edge.yml --profile local-ai up -d && docker compose -f docker-compose.edge.yml exec ollama ollama pull qwen2.5:7b" },
      { title: "Use a paid AI provider", body: "Admin → Translation providers → Add. Paste your own API key for Claude, OpenAI, Google Translate or DeepL. The key is stored encrypted on the box." },
      { title: "Update later", body: "Run the update script on the box. It pulls the newest image and restarts.", code: "/opt/jumaah/infra/scripts/edge-update.sh" },
    ],
    helpTitle: "Stuck?",
    helpBody: "Send your question through the form on the home page, with the mosque name and where you got stuck. Screenshots help.",
    helpCta: "Ask a question",
  },
  footer: { line: "Jumaah · free for every mosque", contact: "Contact" },

  demoPage: {
    title: "Jumaah demo · Drive a Friday khutbah",
    h1: "Drive a Friday khutbah.",
    lede: "You are the imam. Tap Next and watch the mosque display follow. Switch the display language, then cut the internet.",
    back: "Back to site",
    control: "Imam control",
    display: "Mosque display",
    language: "Display language",
    internet: "Simulate internet loss",
    online: "Internet connected",
    offline: "Internet lost",
    stillLive: "Local network · still live",
    cloud: "Cloud sync",
    paused: "paused",
    synced: "idle",
    section: "First khutbah",
    ready: "Ready",
  },
};
