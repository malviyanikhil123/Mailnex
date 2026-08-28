/**
 * Seed data: 20 professional, universal email templates across core outreach strategies.
 * All templates are role-agnostic and dynamically adapt to ANY profession/role
 * (e.g. Software Engineer, UI/UX Designer, Product Manager, Data Analyst, Marketing Lead, Operations, etc.)
 * using dynamic placeholders: {{role}}, {{targetRole}}, {{company}}, {{location}}, {{candidateName}}, {{experience}}, {{skills}}, {{signature}}
 */
export const TEMPLATE_SEED = [
  // ── 1. General & Professional Applications (4) ────────────────────────────
  {
    name: "Standard Professional Application",
    category: "general",
    subject: "{{role}} Application — {{candidateName}}",
    body: "Dear {{company}} Hiring Team,\n\nI am writing to express my strong interest in {{role}} opportunities at {{company}} in {{location}}.\n\nThroughout my career, I have focused on driving meaningful outcomes, collaborating effectively with cross-functional teams, and solving core business challenges. I admire the work {{company}} is doing and would love to bring my dedication and background to your team.\n\nPlease find my resume attached. I would appreciate the opportunity to speak with you about how my experience can support your upcoming initiatives.\n\n{{signature}}",
  },
  {
    name: "Warm Introduction & Opportunity Inquiry",
    category: "general",
    subject: "Application for {{role}} at {{company}} — {{candidateName}}",
    body: "Hi {{company}} Team,\n\nI hope this email finds you well. I have been following {{company}}'s recent developments in {{location}} with great interest, and I am reaching out to explore potential opportunities as a {{role}}.\n\nI bring hands-on experience in delivering high-quality work, streamlining workflows, and contributing to high-performing teams. I am confident that my background aligns well with your team's standards and goals.\n\nMy resume is attached for your review. Thank you for your time and consideration, and I look forward to connecting.\n\n{{signature}}",
  },
  {
    name: "Enthusiastic Role Application",
    category: "general",
    subject: "Interest in {{role}} Roles with {{company}} — {{candidateName}}",
    body: "Hello {{company}} Team,\n\nI am writing to express my enthusiasm for {{role}} positions with {{company}} in {{location}}.\n\nWhat excites me most about {{company}} is your commitment to quality and forward-thinking solutions. With a proven record of execution, continuous learning, and cross-team communication, I am eager to contribute to your team's continued success.\n\nPlease feel free to review my attached resume. I would welcome the chance for a brief conversation at your convenience.\n\n{{signature}}",
  },
  {
    name: "Comprehensive Candidate Introduction",
    category: "general",
    subject: "{{role}} Candidate — {{candidateName}} for {{company}}",
    body: "Dear {{company}} Team,\n\nI am reaching out regarding {{role}} opportunities at {{company}} in {{location}}.\n\nI specialize in taking ownership of projects from conception to completion, ensuring every deliverable meets the highest standards. I am eager to apply my skill set to help {{company}} achieve its strategic objectives.\n\nI have attached my resume for your consideration and would love to discuss how I can add immediate value to your team.\n\n{{signature}}",
  },

  // ── 2. Direct & High-Impact (4) ───────────────────────────────────────────
  {
    name: "Direct & Concise Application",
    category: "direct",
    subject: "{{role}} candidate interested in {{company}} ({{location}})",
    body: "Hi {{company}} Team,\n\nI will keep this brief — I am an experienced professional interested in {{role}} openings with {{company}} in {{location}}.\n\nMy background is centered on delivering results quickly, maintaining high standards of execution, and adapting seamlessly to evolving team priorities.\n\nMy resume is attached. If you have an opening that matches my profile, I would be thrilled to connect for a quick 10-minute chat.\n\n{{signature}}",
  },
  {
    name: "High-Impact Contributor",
    category: "direct",
    subject: "Experienced {{role}} — {{candidateName}} for {{company}}",
    body: "Dear {{company}} Hiring Manager,\n\nIf your team in {{location}} is looking for a proactive {{role}} who can hit the ground running, I would love to introduce myself.\n\nI take pride in solving problems efficiently, optimizing key processes, and fostering strong collaborative relationships across teams. I am confident I can make an immediate and positive impact at {{company}}.\n\nThank you for considering my application. My resume is attached for your review.\n\n{{signature}}",
  },
  {
    name: "Action-Oriented Candidate",
    category: "direct",
    subject: "Ready to contribute as {{role}} at {{company}} — {{candidateName}}",
    body: "Hello {{company}} Team,\n\nI am reaching out to share my interest in joining {{company}} as a {{role}} in {{location}}.\n\nI am known for taking initiative, communicating clearly, and consistently delivering high-impact work on schedule. I am eager to bring this same energy and standard of excellence to your organization.\n\nAttached is my resume. I would appreciate the opportunity to discuss any relevant openings.\n\n{{signature}}",
  },
  {
    name: "Focused & Goal-Driven Application",
    category: "direct",
    subject: "Application: {{role}} at {{company}} — {{candidateName}}",
    body: "Hi {{company}} Team,\n\nI am contacting you regarding potential {{role}} roles at {{company}} in {{location}}.\n\nI combine analytical thinking with practical execution to achieve measurable results. I have attached my resume and would welcome the opportunity to discuss how my skill set can support your team's roadmap.\n\nThank you for your time and review.\n\n{{signature}}",
  },

  // ── 3. Value Proposition & Impact (4) ─────────────────────────────────────
  {
    name: "Value & Results Focused",
    category: "value_proposition",
    subject: "Adding Value as {{role}} at {{company}} — {{candidateName}}",
    body: "Dear {{company}} Team,\n\nI am writing to explore how my experience can add value to your team as a {{role}} in {{location}}.\n\nThroughout my work, I have consistently focused on efficiency, quality, and measurable impact. I am eager to apply this background to help {{company}} scale its operations and exceed its targets.\n\nPlease find my resume attached. I would welcome the opportunity to connect and discuss how my skills align with your current needs.\n\n{{signature}}",
  },
  {
    name: "Problem Solver & Collaborator",
    category: "value_proposition",
    subject: "Exploring {{role}} Opportunities at {{company}} — {{candidateName}}",
    body: "Hello {{company}} Leadership,\n\nI have been deeply impressed by {{company}}'s work in {{location}} and am reaching out to express my interest in {{role}} opportunities.\n\nMy approach combines strategic problem-solving with rigorous execution and collaborative communication. I am motivated to help {{company}} tackle complex challenges and deliver outstanding results.\n\nI have attached my resume and look forward to the possibility of speaking with you.\n\n{{signature}}",
  },
  {
    name: "Growth & Innovation Driven",
    category: "value_proposition",
    subject: "{{role}} Candidate eager to drive growth at {{company}} — {{candidateName}}",
    body: "Hi {{company}} Team,\n\nI am excited about what {{company}} is building in {{location}} and would love to contribute to your mission as a {{role}}.\n\nI bring a passion for innovation, a structured approach to problem-solving, and a proven ability to deliver on ambitious goals. I am confident that my background makes me a strong fit for your team culture.\n\nAttached is my resume for your review. I look forward to hearing from you.\n\n{{signature}}",
  },
  {
    name: "Execution & Quality Advocate",
    category: "value_proposition",
    subject: "Delivering Quality as {{role}} for {{company}} — {{candidateName}}",
    body: "Dear {{company}} Team,\n\nIf you are looking for a dedicated {{role}} in {{location}} who values thorough execution and strong teamwork, I would love to connect.\n\nI focus on building reliable systems, maintaining clear communication, and delivering lasting value. My resume is attached, and I welcome the chance to discuss how I can support {{company}}.\n\n{{signature}}",
  },

  // ── 4. Strategic Inquiry & Networking (4) ─────────────────────────────────
  {
    name: "Strategic Career Inquiry",
    category: "inquiry",
    subject: "Inquiring about {{role}} Openings at {{company}} — {{candidateName}}",
    body: "Dear {{company}} Team,\n\nI am writing to inquire about current or upcoming {{role}} opportunities with {{company}} in {{location}}.\n\nI have developed a strong foundation in my field and am eager to bring my skills to a forward-thinking team like yours. I am impressed by {{company}}'s reputation and would value the chance to contribute to your future milestones.\n\nPlease find my resume attached. I would be grateful for the chance to introduce myself in a brief conversation.\n\n{{signature}}",
  },
  {
    name: "Proactive Team Exploration",
    category: "inquiry",
    subject: "Exploring Opportunities at {{company}} ({{role}}) — {{candidateName}}",
    body: "Hello {{company}} Team,\n\nI am reaching out proactively to connect regarding {{role}} opportunities in {{location}}.\n\nI am drawn to {{company}}'s vision and believe my proactive approach and skill set would be a great asset to your team. Attached is my resume summarizing my experience and achievements.\n\nThank you for your time, and I look forward to connecting.\n\n{{signature}}",
  },
  {
    name: "Collaborative Talent Outreach",
    category: "inquiry",
    subject: "Connecting regarding {{role}} roles at {{company}} — {{candidateName}}",
    body: "Hi {{company}} Team,\n\nI hope your week is going well. I am reaching out to inquire if {{company}} is currently considering candidates for {{role}} roles in {{location}}.\n\nI bring hands-on experience, a collaborative mindset, and a passion for delivering high-quality work. Please find my attached resume for your consideration.\n\n{{signature}}",
  },
  {
    name: "Future Opportunities Inquiry",
    category: "inquiry",
    subject: "{{role}} Talent Inquiry — {{candidateName}} for {{company}}",
    body: "Dear {{company}} Hiring Team,\n\nI am writing to express my interest in joining {{company}} in {{location}} as a {{role}}.\n\nI am keen to bring my energy, expertise, and collaborative spirit to your organization. I have attached my resume and would welcome the chance to stay on your radar for relevant openings.\n\nThank you for your time and consideration.\n\n{{signature}}",
  },

  // ── 5. Follow-Up Messages (4) ─────────────────────────────────────────────
  {
    name: "Courteous Application Follow-Up",
    category: "followup",
    subject: "Follow-up: {{role}} Application — {{candidateName}}",
    body: "Hi {{company}} Team,\n\nI hope you are having a productive week. I am following up on my previous application for {{role}} opportunities with {{company}} in {{location}}.\n\nI remain very interested in the chance to contribute to your team and would welcome the opportunity to speak with someone regarding any active or upcoming hiring needs.\n\nMy resume is attached again for your convenience. Thank you for your time and consideration.\n\n{{signature}}",
  },
  {
    name: "Value-Added Follow-Up",
    category: "followup",
    subject: "Following up on {{role}} role at {{company}} — {{candidateName}}",
    body: "Dear {{company}} Team,\n\nI wanted to briefly follow up on my earlier note regarding {{role}} positions at {{company}} in {{location}}.\n\nI understand your team is busy, so I will keep this brief — I remain enthusiastic about {{company}}'s work and confident that my background can add value to your team.\n\nPlease feel free to reach out if you need any additional details. Thank you!\n\n{{signature}}",
  },
  {
    name: "Polite Check-In Follow-Up",
    category: "followup",
    subject: "Checking in: {{role}} Application for {{company}} — {{candidateName}}",
    body: "Hello {{company}} Team,\n\nI am checking in regarding my application for the {{role}} opening with {{company}} in {{location}}.\n\nI would love to learn if there are any updates regarding the hiring timeline or if there is any further information I can provide.\n\nThank you again for your time and review.\n\n{{signature}}",
  },
  {
    name: "Final Warm Follow-Up",
    category: "followup",
    subject: "Following up — {{candidateName}} for {{role}} at {{company}}",
    body: "Hi {{company}} Team,\n\nI hope you are doing well. I wanted to send one last follow-up regarding {{role}} opportunities with {{company}} in {{location}}.\n\nI remain eager to explore how my skills can benefit your organization. If the timing is not right at the moment, I would still welcome staying connected for future opportunities.\n\nThank you once again for your consideration.\n\n{{signature}}",
  },
];
