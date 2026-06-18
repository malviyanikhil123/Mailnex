/**
 * Seed data: 10 email templates across 5 categories (2 per category).
 * Placeholders: {{company}}, {{location}}, {{candidateName}}, {{signature}}
 */
export const TEMPLATE_SEED = [
  // ── software (2) ─────────────────────────────────────────────────────────
  {
    name: "Software Developer — Intro",
    category: "software",
    subject: "Software Engineer application — {{candidateName}}",
    body: "Hi {{company}} team,\n\nI'm {{candidateName}}, a Software Engineer with ~1 year of experience building backend and full-stack systems. I'd love to contribute to your team in {{location}}.\n\n{{signature}}",
  },
  {
    name: "Software Developer — Follow-up",
    category: "software",
    subject: "Following up — Software Engineer role at {{company}}",
    body: "Hello {{company}} hiring team,\n\nI recently applied for the Software Engineer position and wanted to reiterate my enthusiasm. My background in designing scalable software solutions aligns well with what you're building in {{location}}.\n\nI'd welcome the chance to discuss further.\n\n{{signature}}",
  },

  // ── backend (2) ───────────────────────────────────────────────────────────
  {
    name: "Backend Engineer — Intro",
    category: "backend",
    subject: "Backend Engineer application — {{candidateName}}",
    body: "Hi {{company}} team,\n\nI'm {{candidateName}}, a backend-focused engineer with hands-on experience in REST APIs, databases, and server-side architecture. I'm excited about the opportunity to bring this expertise to your {{location}} team.\n\n{{signature}}",
  },
  {
    name: "Backend Engineer — Value Pitch",
    category: "backend",
    subject: "Interested in Backend Engineering at {{company}}",
    body: "Hello {{company}},\n\nAs a backend engineer passionate about performance and reliability, I was drawn to {{company}}'s work. I have experience building and maintaining production APIs and would love to be part of what you're creating in {{location}}.\n\nLooking forward to connecting.\n\n{{signature}}",
  },

  // ── nodejs (2) ────────────────────────────────────────────────────────────
  {
    name: "Node.js Developer — Intro",
    category: "nodejs",
    subject: "Node.js Developer application — {{candidateName}}",
    body: "Hi {{company}} team,\n\nI'm {{candidateName}}, a Node.js developer with experience building fast, event-driven services using Express and Fastify. I believe my skills would add real value to your engineering team in {{location}}.\n\n{{signature}}",
  },
  {
    name: "Node.js Developer — Project Highlight",
    category: "nodejs",
    subject: "Node.js Engineer interested in {{company}}",
    body: "Hello {{company}},\n\nI've been working with Node.js to build microservices and background-job systems, with a focus on clean code and observability. I'd love to bring that experience to your team based in {{location}}.\n\nWould appreciate the opportunity to chat.\n\n{{signature}}",
  },

  // ── fullstack (2) ─────────────────────────────────────────────────────────
  {
    name: "Full-Stack Developer — Intro",
    category: "fullstack",
    subject: "Full-Stack Developer application — {{candidateName}}",
    body: "Hi {{company}} team,\n\nI'm {{candidateName}}, a full-stack developer comfortable across the entire web stack — from React frontends to Node.js backends and PostgreSQL databases. I'd be excited to join your team in {{location}}.\n\n{{signature}}",
  },
  {
    name: "Full-Stack Developer — Product Focus",
    category: "fullstack",
    subject: "Full-Stack Engineer eager to join {{company}}",
    body: "Hello {{company}},\n\nI enjoy owning features end-to-end, from database schema to polished UI. I've shipped full-stack features independently and I'm enthusiastic about doing the same at {{company}} in {{location}}.\n\nLet's connect!\n\n{{signature}}",
  },

  // ── mern (2) ──────────────────────────────────────────────────────────────
  {
    name: "MERN Stack Developer — Intro",
    category: "mern",
    subject: "MERN Stack Developer application — {{candidateName}}",
    body: "Hi {{company}} team,\n\nI'm {{candidateName}}, a MERN stack developer with experience building full-featured web apps using MongoDB, Express, React, and Node.js. I'd love to bring this skill set to your team in {{location}}.\n\n{{signature}}",
  },
  {
    name: "MERN Stack Developer — Startup Fit",
    category: "mern",
    subject: "MERN Developer interested in {{company}}",
    body: "Hello {{company}},\n\nI specialise in the MERN stack and thrive in fast-moving environments where I can contribute across the stack. I'd be thrilled to help {{company}} ship great products from {{location}}.\n\nHope to hear from you soon.\n\n{{signature}}",
  },
] as const;
