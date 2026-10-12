/**
 * Starter templates: new accounts get them at registration, and existing users can add
 * any they are missing from the Templates page ("Add starter templates").
 *
 * Plain-text, short and generic so they fit sales teams, businesses, freelancers and job
 * seekers alike. They use the sender variables ({{my_name}}, {{my_company}}, {{signature}})
 * and the contact variables ({{first_name}}, {{company}}), with fallbacks for contacts
 * whose name or company is missing ({{first_name|there}}).
 *
 * Category "followup" is special: campaigns send those only to contacts already emailed
 * (and prefer them for those contacts). Every other category is a first email.
 */
export const TEMPLATE_SEED = [
  {
    name: "Cold intro",
    category: "sales",
    subject: "Idea for {{company|your team}}",
    body:
      "Hi {{first_name|there}},\n\n" +
      "I'm {{my_name}} from {{my_company}}. I came across {{company|your company}} and thought what we do could be useful to your team.\n\n" +
      "In short, we help businesses like yours get more done with less effort. If it sounds relevant, I'd be happy to share a few details or a quick example.\n\n" +
      "Would you be open to a short conversation?\n\n" +
      "{{signature}}",
  },
  {
    name: "Partnership pitch",
    category: "partnership",
    subject: "Collaboration idea for {{company|your team}}",
    body:
      "Hi {{first_name|there}},\n\n" +
      "I'm {{my_name}} from {{my_company}}. I've been following {{company|your work}} and I think there is a natural fit between what we both do.\n\n" +
      "I'd love to explore a simple collaboration, such as a joint project, a referral arrangement or shared content, whichever makes the most sense for both sides.\n\n" +
      "If you're open to it, could we set up a 20-minute call to compare notes?\n\n" +
      "{{signature}}",
  },
  {
    name: "Meeting request",
    category: "meeting",
    subject: "15 minutes next week?",
    body:
      "Hi {{first_name|there}},\n\n" +
      "I'd like to ask for 15 minutes of your time next week. I'm {{my_name}} from {{my_company}}, and I'd like to learn about your priorities at {{company|your company}} and share a few ideas that may help.\n\n" +
      "Would Tuesday or Thursday work for you? If another time is easier, just let me know.\n\n" +
      "{{signature}}",
  },
  {
    name: "Product or service offer",
    category: "offer",
    subject: "Something that could help {{company|your team}}",
    body:
      "Hi {{first_name|there}},\n\n" +
      "I'm {{my_name}} from {{my_company}}. We work with teams like {{company|yours}} to save time on everyday work and deliver better results for their customers.\n\n" +
      "Here is what you can expect from us:\n" +
      "- A clear plan tailored to your needs\n" +
      "- Quick, friendly support\n" +
      "- No long-term commitment\n\n" +
      "If you'd like, I can send over pricing and a short overview. Just reply to this email.\n\n" +
      "{{signature}}",
  },
  {
    name: "Follow-up #1",
    category: "followup",
    subject: "Following up on my last email",
    body:
      "Hi {{first_name|there}},\n\n" +
      "I wanted to follow up on my previous email in case it got buried. I'd still be glad to share how {{my_company}} could help {{company|your team}}.\n\n" +
      "Would a quick call this week or next work for you?\n\n" +
      "{{signature}}",
  },
  {
    name: "Follow-up #2 (closing the loop)",
    category: "followup",
    subject: "Closing the loop",
    body:
      "Hi {{first_name|there}},\n\n" +
      "I haven't heard back, so I'll assume the timing isn't right and won't keep filling your inbox.\n\n" +
      "If things change, just reply to this email and I'll be happy to pick up the conversation whenever it suits you.\n\n" +
      "Thanks for your time, and all the best.\n\n" +
      "{{signature}}",
  },
  {
    name: "Re-engage an old lead",
    category: "reengagement",
    subject: "It's been a while",
    body:
      "Hi {{first_name|there}},\n\n" +
      "It's been a while since we last spoke, so I wanted to check in. A lot has changed at {{my_company}} since then, and some of it may be relevant to {{company|your team}} now.\n\n" +
      "Are you still the right person to talk to about this? If so, I'd be glad to catch up and share what's new. If not, I'd appreciate a pointer to the right person.\n\n" +
      "{{signature}}",
  },
  {
    name: "Job or internship application",
    category: "application",
    subject: "Interested in joining {{company|your team}}",
    body:
      "Hi {{first_name|there}},\n\n" +
      "My name is {{my_name}}, and I'm writing to express my interest in joining {{company|your team}}, either in an open role or as an intern.\n\n" +
      "I admire the work your team is doing and I'm confident I could contribute from day one. I'd be glad to share my CV and any other details that would help.\n\n" +
      "Would you be open to a short conversation about current or upcoming openings?\n\n" +
      "{{signature}}",
  },
];
