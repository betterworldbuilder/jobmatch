# Founder requests — 2026-11-22 (not started)

Two feature requests for JobsMatchNow (repo `~/jobmatch3`), sent on 2026-11-22. Nothing has been built yet.
Request 1 is copied word for word. Request 2 is the founder's message cleaned up; the original wording is
below it, since a few words were unclear.

---

## Request 1 — "Ask AI" chatbot for signed-in job seekers

> Implement an AI chatbot inside JobsMatchNow for signed-in job seekers.
>
> Goal:
> Users can ask questions in the app about their own profile, job matches,
> skill gaps, applications, and upcoming interviews.
>
> First inspect the repository. Identify the frontend framework, backend,
> authentication, database, existing AI analyst, and any existing model API
> integration. Reuse the current architecture and UI style.
>
> Build the first working version:
>
> 1. Chat interface
> - Add an "Ask AI" button and chat panel within the app.
> - Include suggested questions:
>   "What are my best job matches?"
>   "Why does this job match my profile?"
>   "What skills am I missing?"
>   "Help me prepare for my next interview."
> - Show loading, empty, error, and retry states.
> - Make the chat usable on mobile.
>
> 2. Backend
> - Create or reuse a server-side chat endpoint.
> - Authenticate every request using the existing user session.
> - Retrieve only the relevant data belonging to that user.
> - Call a configurable AI provider through its server-side API.
> - Never expose API keys in frontend code.
> - Return a clear response when the AI service or required data is unavailable.
>
> 3. Assistant behavior
> - Answer using the user's actual JobsMatchNow data.
> - Identify the jobs or information used to support the answer.
> - Say when information is missing; do not invent matches or job requirements.
> - Keep the first version read-only: do not apply for jobs, contact recruiters,
>   or change the user's profile.
> - Tell the user that relevant data is sent to the selected AI provider.
>
> 4. Cost and security
> - Add a configurable per-user usage limit.
> - Minimize personal data sent to the model.
> - Do not log API keys, complete CVs, or full chat contents by default.
> - Enforce user data isolation on the server.
>
> 5. Verify
> - Test a normal question with data and a question with no relevant data.
> - Test an unauthenticated request and cross-user data access.
> - Test provider failure, rate limit, and mobile layout.
> - Report the files changed, setup required, tests run, and any limitations.
>
> Do not invent the existing architecture or claim a feature is working
> without checking it. Do not deploy without my approval.

---

## Request 2 — "Recruiter Invitation" + AI "Interview preparation" (candidate menu)

The request came with a screenshot of the candidate sidebar. A red box marked the gap between **Job Matches** and
**Meetings**. The menu reads: My dashboard · Find My Match · Conversations · Job Matches · Meetings · Hiring Stages ·
Coffee Invitations · Reports · Use your chatbot here · Feedback · Premium options.

What the founder asked for:
- Rename the **Meetings** menu item to **"Recruiter Invitation"**.
- Add an **"Interview preparation"** item, an AI feature, directly above it, in the red-box spot.
- On the Interview preparation page, for each role the candidate applied to:
  - list the skills the role requires;
  - offer to use the user's AI bot (chatbot) to propose a skills-refresh plan;
  - add Coursera course links to that plan.
- The chatbot is a **premium feature**, included in the **$10 premium pack**. Add it to the Premium section.

Original wording (verbatim):

> change meeting to   "Recruiter Invitation " , add " Interview preparation " ( an AI feature )  above it  . in interview  preparation  for each role applies , list the skillss required ,  propose using  user ai  Bot propsoe  a refresh skills plan,  add using coursera link class -2 sue chat bo is premium feature included in the 10 usd prenium pack ( add it the premium section )

Unclear points to confirm with the founder before building:
- "class -2 sue chat bo": read here as "Coursera link per class; 2) the chatbot is a premium feature". Confirm.
- Does "Recruiter Invitation" rename only the menu label, or also the page title and routes?
- Is the $10 premium pack an existing plan in `server/billing/plans.js`, or a new one?

---

## Context found on 2026-11-22 (read-only check, nothing changed)
- An "AI analyst" exists (`src/components/home/AiAnalyst.tsx`). The "Use your chatbot here" page
  (`src/components/home/ChatbotPage.tsx`) calls it a preview that answers on the device from the member's data.
- A read-only MCP endpoint (`server/mcp.js`, `/api/mcp`) with personal connector keys already exposes a member's
  matches, hiring stages, skill gaps and next interview. It may be reusable for the chatbot's data retrieval.
- `server/auth.js`: scrypt passwords and an in-memory rate limiter; sessions are signed cookies.
- Billing and plans live in `server/billing/` (`plans.js`, `entitlements.js`, `subscriptions.js`).
- On 2026-11-22 the branch was `feat/funnel-pwa-post-role`, and the team session `jobsmatchnow-team-a3` was also open.
  Work on a separate branch or worktree to avoid collisions.
