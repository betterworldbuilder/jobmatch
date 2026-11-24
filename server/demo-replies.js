// Demo conversations answer back (founder, 2026-11-24: "enable mockup answers for each mockup question").
// When someone using a demo account sends one of the conversation starters (src/content/conversationStarters.ts),
// the other demo account replies with a realistic answer. Demo accounts only: real accounts never see demo accounts,
// and a message between two real people never gets an automatic answer.

// Candidate asks the company (answer from the recruiter).
const COMPANY_ANSWERS = {
  'What problem were you originally trying to solve when you built your core product?': 'Our founders kept losing weeks to manual work that software should do. The first version automated one painful workflow for one customer; today the same idea runs for thousands of teams.',
  'What makes your approach different from your competitors?': 'We ship small and often, and we sit with customers every week. Most competitors sell big releases; we fix the real problem in days, which is why customers stay.',
  'Where do you see the company in the next two or three years?': 'Doubling the team, launching in two new regions, and moving from one product to a small platform. This role sits right in the middle of that growth.',
  'Which company value do employees actually experience every day, rather than just seeing on the website?': '“Say it early.” Problems are raised in the first stand-up, not hidden until the review. Nobody gets blamed for bad news, only for late news.',
  "Could you tell me more about the team I'd be joining?": 'Seven people: four engineers, a designer, a product manager and me. Mixed seniority, three countries, one shared roadmap. Very low ego, lots of pairing.',
  'What makes someone successful within this team?': 'Taking ownership end to end, writing things down, and asking for help early. People who do well here finish things rather than start many.',
  'What is your management style?': 'Clear goals, then I get out of the way. Weekly 1:1s, honest feedback both directions, and I protect the team’s focus time.',
  'How does the team normally collaborate?': 'Async first: written specs and short videos. Two short syncs a week, pairing when it helps, and a monthly in-person day for those nearby.',
  'What does a typical day look like for someone in this role?': 'A quick stand-up, two or three hours of focused work, a review or pairing session, and some time with customers or product. Meetings stay under two hours a day.',
  'Is decision-making generally fast, or does it involve several stakeholders?': 'Fast. The person closest to the problem decides and writes a short note. Only big bets go to a wider group, and those take about a week.',
  'How does the company handle mistakes or failures?': 'Blameless reviews within 48 hours: what happened, why, and one fix. The goal is that the same mistake can’t happen twice.',
  'How flexible are working hours?': 'Very. We share a four-hour overlap window; outside of it you plan your own day.',
  'What would be my biggest priorities during the first 90 days?': 'Month one: learn the product and ship a small fix. Month two: own one feature end to end. Month three: lead the next improvement with the team.',
  'What would success look like after six months?': 'You own an area of the product, customers know your name, and the team comes to you for decisions in that area.',
  'Which technical skills are absolutely essential, and which can be learned after joining?': 'Essential: strong fundamentals in our core stack and clear writing. Our internal tools and domain details we teach in the first weeks.',
  'What surprised previous hires most about this role?': 'How quickly they shipped to real customers: most had something live in their second week.',
  'How do people typically grow within the company?': 'Two tracks, expert or manager, with the same pay bands. Reviews twice a year with a written growth plan.',
  'Could you share an example of someone who has grown their career here?': 'One of our engineers joined as mid-level three years ago, led our biggest launch, and now runs a team of five.',
  'Is there a formal mentoring program?': 'Yes: every new hire gets a mentor outside their team for six months, plus a yearly learning budget.',
  'Could you explain how the salary range for this role was determined?': 'We benchmark against market data for the level and region every year, and the range shown on the role is the real one: no negotiation games.',
  'Is there a performance bonus, profit-sharing, or equity program?': 'Yes: an annual bonus tied to company results, and equity for every full-time hire.',
  'Which employee benefits are most appreciated by the team?': 'Health cover for the family, the learning budget, and the extra “no meetings” Friday afternoons.',
  'How does the hybrid schedule work in practice?': 'Two anchor days a week in the office for those nearby; the rest is your choice. Remote team members join by video on those days.',
  'Which tools does the team use daily, and how modern is the current stack?': 'Modern and well maintained: cloud-native services, CI on every change, and a shared design system. We remove old tools as often as we add new ones.',
  'Does the company provide home-office equipment or hardware?': 'Yes: a laptop of your choice, a monitor, and a home-office budget in your first month.',
  'Could you walk me through the remaining interview stages?': 'A technical conversation (60 minutes), a meeting with the team (45 minutes), then a final chat with the hiring manager. All by video.',
  'Approximately how long does the hiring process usually take?': 'About two to three weeks from now to an offer.',
  'When should I expect feedback after each interview?': 'Within 48 hours after every stage, whatever the outcome. That is a rule on JobsMatchNow, and ours too.',
  "I'd love to learn more about your team and the projects you're working on. Would you be open to a quick coffee chat sometime this week?": 'With pleasure! How about Thursday at 10:00? I’ll send an invite with the place, or a video link if that suits you better.',
  'Your company culture sounds like a great fit for how I enjoy working. Would you be open to a short informal conversation before moving further in the process?': 'Absolutely: 20 minutes, no preparation needed. Pick any slot this week and I’ll make it work.',
};

// Recruiter asks the candidate (answer from the candidate). Openers start with "Hi {name}," in the app.
const CANDIDATE_ANSWERS = {
  'your team-first approach stood out to me. Can you tell me about a time you helped a colleague or team succeed without needing to take the credit?': 'Last year a teammate was stuck on a release blocker. I paired with them for two evenings, we shipped on time, and they presented the result. Seeing the team win was the reward.',
  'You describe yourself as someone who removes blockers for others. What kind of team environment helps you contribute at your best?': 'Clear goals, open communication and trust. When people raise problems early, I can help remove them before they slow everyone down.',
  'Our team values collaboration and shared ownership. How do you normally support teammates when a project is under pressure?': 'I take the unglamorous tasks off their plate, keep the status clear for everyone, and make sure nobody works alone on the hardest part.',
  'You sound like someone who cares about the people behind the work. Would you be open to a relaxed coffee chat about how our team works together?': 'I’d love that. Any morning this week works for me.',
  'your action-oriented style caught my attention. What is a recent idea you turned into a working result?': 'I noticed our weekly report took a day to build. I wrote a small automation in a week; it now runs in five minutes and the team uses it every Monday.',
  'This role needs someone who can move from discussion to execution quickly. How do you decide when you have enough information to start?': 'When the goal is clear and the first step is reversible, I start, and learn from real feedback rather than more meetings.',
  'Your focus on measurable outcomes matches this role well. Which professional goal are you most proud of achieving, and how did you track progress?': 'Cutting our onboarding time by 40%. I tracked it weekly on a simple dashboard the whole team could see.',
  'I like your hands-on, results-driven approach. Would you be open to a coffee chat about a challenge we need someone to take ownership of quickly?': 'Yes, gladly. Tell me a time and place and I’ll be there.',
  'your profile suggests you enjoy complex challenges. What is the most difficult problem you have solved recently?': 'An intermittent failure that only happened under real traffic. I reproduced it with recorded data, found a race condition, and fixed it with a two-line change and a test.',
  'When the first solution fails, how do you decide what to investigate next?': 'I go back to the evidence, list what I know for sure, and test the cheapest hypothesis first.',
  'This role involves diagnosing issues across several systems. How do you separate symptoms from the real root cause?': 'I follow one request end to end and ask “why” until the answer is something we control. Symptoms repeat; the root cause explains all of them.',
  'We have an interesting problem that could use your way of thinking. Would you be open to an informal coffee chat about it?': 'Now I’m curious! Happy to meet this week.',
  'you describe yourself as someone who builds things that last. What have you created that continued delivering value after you moved on?': 'An internal platform I built three years ago is still the base of every new project there; the team told me last month it saved them months.',
  'When building a new product or platform, how do you balance speed, quality, and long-term maintainability?': 'Fast on the parts that can change, careful on the foundations: data model, interfaces and tests.',
  'This role involves creating a new capability from the ground up. Which part of zero-to-one work do you enjoy most?': 'The first real user. Turning a blank page into something someone relies on is the best feeling in this job.',
  'We are building something new, and your profile feels highly relevant. Would you be open to a coffee chat about the vision and foundation?': 'Definitely: I’d love to hear the vision. Any day this week.',
  'your leadership philosophy emphasizes clarity and trust. How do you create direction when a team is uncertain or divided?': 'I write down the goal and the options, give everyone a voice, then decide and explain why. Clarity beats consensus.',
  'Tell me about a difficult decision you made as a leader and how you communicated it.': 'I cancelled a project the team loved because customers didn’t need it. I shared the data openly, and we moved the people onto what mattered.',
  'How do you balance accountability with giving people enough autonomy to succeed?': 'Clear outcomes and deadlines, freedom on the how, and regular check-ins that are about help, not control.',
  'Your leadership approach looks compatible with our team. Would you be open to an informal conversation about the people and challenges involved?': 'Yes, I’d like that very much.',
  'your interest in developing others stood out. Can you share an example of someone you helped grow professionally?': 'I mentored a junior colleague for a year; she now leads her own project and mentors others.',
  'How do you adjust your mentoring approach for people with different experience levels?': 'Juniors get structure and quick feedback; seniors get space, questions and sparring.',
  'This role includes coaching junior team members. What makes feedback useful rather than discouraging?': 'Specific, timely and about the work, never the person, with one clear next step.',
  'Our team values leaders who help others grow. Would you be open to a coffee conversation about our mentoring culture?': 'With pleasure. Coffee is on me!',
  'you describe yourself as someone who looks for better ways. What improvement or new idea have you introduced recently?': 'I introduced short weekly demos; small wins became visible and the team started improving things on its own.',
  'How do you decide whether a new technology creates real value or is simply interesting?': 'I run a small test against one real problem with a success measure decided upfront.',
  'This role encourages experimentation. How do you run small tests while controlling risk?': 'Small scope, a clear stop rule, a feature flag and a quick rollback.',
  'We are exploring a few new ideas and your profile caught my attention. Would you be open to exchanging thoughts over coffee?': 'Absolutely, I love that kind of conversation.',
  'your customer-first mindset matches this position well. How do you uncover what a customer truly needs when their initial request is unclear?': 'I ask about the last time the problem happened, watch how they work, and confirm by showing a quick prototype.',
  'Tell me about a time you had to balance customer expectations with technical or commercial constraints.': 'A key client wanted a custom feature. I offered a smaller version in two weeks that solved 80% of the need; they renewed for two years.',
  'What does building long-term customer trust look like in your work?': 'Keeping promises, telling the truth early, and following up without being asked.',
  'This role is highly customer-facing, and your approach feels relevant. Would you be open to a coffee chat about the customers we serve?': 'Yes, I’d love to hear about them.',
  'thanks for matching! What are you most looking for in your next role?': 'Thanks for matching too! A team that ships real value, room to own a meaningful area, and people I can learn from.',
  'What part of your background are you most excited to bring to a new team?': 'Turning complex problems into simple products that customers actually use.',
  'What does your ideal role look like day to day?': 'Mostly focused building time, close contact with users, and a team that writes things down.',
  'Would you be open to a quick coffee chat to see if this could be a good mutual fit?': 'Sure! I’m free most mornings this week.',
};

const norm = (s) => String(s || '').toLowerCase().replace(/^hi [^,]{1,40},\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const TABLE = new Map([...Object.entries(COMPANY_ANSWERS), ...Object.entries(CANDIDATE_ANSWERS)].map(([q, a]) => [norm(q), { a, side: q in COMPANY_ANSWERS ? 'employer' : 'candidate' }]));

/** The demo answer for a starter question, or a friendly generic one for any other first-person text. */
export function demoAnswer(text, answererRole, otherFirstName = '') {
  const hit = TABLE.get(norm(text));
  if (hit) return hit.a;
  return answererRole === 'employer'
    ? `Thanks${otherFirstName ? `, ${otherFirstName}` : ''}! Good question: let’s go through it on a short call. Does this week work for you?`
    : `Thanks for your message! Happy to tell you more: when would suit you for a quick call?`;
}

export const DEMO_STARTER_COUNT = TABLE.size;
