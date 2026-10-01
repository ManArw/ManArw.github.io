// Everything personal on the site lives here, so edits never touch layout code.
import { API_BASE, SUBSTACK } from './endpoints.mjs';

export const site = {
  // Change this (and `site` in astro.config.mjs) when you add a custom domain.
  url: 'https://manarw.github.io',
  name: 'Manas H Arawalli',
  firstName: 'Manas',
  lastName: 'H Arawalli',
  tagline: 'Writing toward the question.',
  description:
    'Essays, poems, and notes by Manas H Arawalli: engineering student, editor, and founder-in-progress from Mysore.',
  location: 'Mysore, Karnataka',
  email: 'manasarawalli@gmail.com',
  substack: SUBSTACK.base,
  substackNotes: `https://substack.com/@${SUBSTACK.handle}/notes`,
  // The site's Cloudflare Worker (reactions + Substack relay). See worker/.
  api: API_BASE,
  instagram: 'https://www.instagram.com/man_arw12/',
  instagramHandle: '@man_arw12',
  linkedin: 'https://www.linkedin.com/in/manas-h-arawalli',
  github: 'https://github.com/ManArw',
};

export const socials = [
  { label: 'Substack', href: site.substack },
  { label: 'Instagram', href: site.instagram },
  { label: 'LinkedIn', href: site.linkedin },
  { label: 'GitHub', href: site.github },
];

// `also` marks the item as current on related pages (Fragments sits with the Blog).
export const nav = [
  { href: '/about', label: 'About', also: [] },
  { href: '/articles', label: 'Articles', also: [] },
  { href: '/blog', label: 'Blog', also: ['/fragments'] },
  { href: '/now', label: 'Now', also: [] },
  { href: '/#contact', label: 'Contact', also: [] },
];

// The household, shown on the home page. `kind` picks the illustration.
// `says` are the speech bubbles they cycle through when clicked.
export const family = [
  {
    name: 'Subbi',
    kind: 'cat',
    note: 'the cat, and ranking officer',
    says: ['mrrp.', '…', '*slow blink*', 'feed me.', '*ignores you*', 'you may pet me. once.'],
  },
  {
    name: 'Cashew',
    kind: 'dog',
    note: 'mother of four',
    says: ['woof!', '*counts puppies*', 'have you eaten?', '*protective mum noises*', 'woof woof!'],
  },
  {
    name: 'Swashbuckles',
    kind: 'puppy',
    note: 'puppy, and pirate',
    says: ['yip!', 'arrr!', '*zoomies*', 'yip yip!', '*steals your sock*'],
  },
  {
    name: 'Mantuckles',
    kind: 'puppy',
    note: 'puppy',
    says: ['arf!', '*tucks in*', 'arf arf!', '*zoomies*', '*falls asleep mid-play*'],
  },
  {
    name: 'Camus',
    kind: 'puppy',
    note: 'puppy, and resident absurdist',
    says: ['yip?', 'one must imagine the ball happy.', '*stares into the void*', 'arf. why not.', '*zoomies*'],
  },
  {
    name: 'Simba',
    kind: 'puppy',
    note: 'puppy, and future king',
    says: ['ROAR. (yip)', '*practises roaring*', 'everything the light touches is mine.', '*zoomies*', 'yip!'],
  },
] as const;

// The D2C business teaser (home + now page). Move `stage` along as it grows:
// 'idea' → 'build' → 'launch'.
export const d2c = {
  name: 'An untitled D2C brand',
  blurb: 'Still in the ideation phase. Nothing to show yet, but it’s coming.',
  stage: 'idea' as 'idea' | 'build' | 'launch',
  notifyHref: 'https://manas1211.substack.com/subscribe',
};

// Visitor counter via GoatCounter (free, no cookies). Paste your GoatCounter
// code here (e.g. 'manas' for manas.goatcounter.com) to switch it on.
export const analytics = {
  goatcounter: 'manarw',
};

// "Now" page (nownownow.com style). Update whenever life moves: change
// `updated`, then edit, add or delete items. `label` is the small
// "Currently …" line above each title.
export const now = {
  updated: '2026-10-01',
  items: [
    {
      label: 'Building',
      title: 'A D2C business',
      body: 'Still in the ideation phase: working out the product, the story, and who it’s really for. More when there’s something to show.',
      teaser: true,
    },
    {
      label: 'Thinking about',
      title: 'What my purpose is',
      body: 'Not in a hurry, not standing still. Most of the essays are a record of this search.',
    },
    {
      label: 'Leading',
      title: 'VentureX SJCE, as Vice President',
      body: 'Steering the brand narrative and flagship-event communication for a 100+ student entrepreneurship community.',
    },
    {
      label: 'Writing',
      title: 'Essays on Substack',
      body: 'Essays and poems about identity, love, belonging, and hope, published most weeks.',
    },
    {
      label: 'Learning',
      title: 'Engineering, and Japanese',
      body: 'B.E. at JSS Science and Technology University, and slowly climbing Japanese.',
    },
    // Uncomment and fill in when you want them on the page:
    // { label: 'Reading', title: 'Book title, by Author', body: 'One line on why.' },
    // { label: 'Listening to', title: 'Album or podcast', body: 'One line on why.' },
    // { label: 'Planning', title: 'Something ahead', body: 'One line on what and when.' },
  ] as { label: string; title: string; body: string; teaser?: boolean }[],
};

export const education = [
  {
    school: 'JSS Science and Technology University',
    place: 'Mysore, Karnataka',
    degree: 'Bachelor of Engineering (B.E.)',
    when: 'Expected 2028',
  },
];

export const experience = [
  {
    org: 'VentureX SJCE (SJCE-STEP)',
    place: 'Mysore, Karnataka',
    area: 'Executive Leadership & Editorial Direction',
    roles: [
      {
        title: 'Vice President',
        when: 'Apr 2026 – Present',
        points: [
          'Drive entrepreneurship messaging and the overall brand narrative across a 100+ student community.',
          'Lead communication strategy for flagship events: outreach, storytelling, and public relations end to end.',
          'Oversee content, visual design alignment, and brand consistency across digital and print.',
        ],
      },
      {
        title: 'Lead Editor',
        when: 'Oct 2025 – Apr 2026',
        points: [
          'Directed narrative strategy and scriptwriting for major university events.',
          'Managed a team of content writers keeping one brand voice across social and official channels.',
          'Refined promotional copy and event documentation to fit institutional goals.',
        ],
      },
      {
        title: 'Editor & Content Writer',
        when: 'Dec 2024 – Oct 2025',
        points: [
          'Edited event scripts and marketing collateral alongside the design team.',
          'Wrote 50+ pieces of targeted content that raised student participation and engagement.',
        ],
      },
    ],
  },
  {
    org: 'Pantheon Consulting Club',
    place: 'Mysore, Karnataka',
    area: 'Strategy',
    roles: [
      {
        title: 'Analyst',
        when: 'Dec 2025 – Present',
        points: [
          'Quantitative and qualitative market research and business analysis.',
          'Work on strategic problem-solving cases and present structured recommendations.',
        ],
      },
    ],
  },
];

export const projects = [
  {
    title: 'IdeaForge 2.0 — Campus Shark Tank',
    role: 'Project Lead',
    when: 'Mar – Apr 2026',
    body: 'Ran end-to-end communication for a campus-wide startup competition with 200+ participants and a 50+ person cross-functional team: outreach, logistics, multi-stage selection messaging, briefing packs, and judges’ documentation.',
  },
  {
    title: 'Substack & independent publishing',
    role: 'Author',
    when: '2024 – Present',
    body: 'Personal essays and poetry on identity, human connection, and introspection, with a reader base grown one honest post at a time.',
  },
];

export const skills = [
  {
    group: 'Writing & editorial',
    items: ['Scriptwriting', 'Narrative strategy', 'Brand voice', 'Storytelling', 'Copywriting', 'Content strategy'],
  },
  {
    group: 'Management & strategy',
    items: ['Event management', 'Strategic communication', 'Team leadership', 'Business analysis'],
  },
  {
    group: 'Languages',
    items: ['English (professional)', 'Kannada (native)', 'Japanese (elementary)', 'Hindi (limited)'],
  },
];
