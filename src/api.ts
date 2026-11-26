import type { GroupCard, GroupPageData, JfClaim, JfConsent, JfManagerRow, JfOutreach, JfReach, JobFinderPublicJob, JobGroup, OutreachReport } from './types';
import { acquisitionSource } from './lib/pendingJob';
import { showNotice } from './lib/notice';
import type { AdminCatalog, AdminKpi, AdminPaymentMethods, AdminPlanInput, BankInstructionsPayload, ClaimView, ConnectorKey, IntegrationStatus, LivePlan, RecommendationDoc, Stage1Funnel, WebAnalyticsReport } from './types';
import type { ActionQueueItem,AdminAnalyticsOverview, AdminJobSummary, AdminPlansOverview, AdminRecruiterStatus, AdminUserDetail, AdminUserSummary, AuthConfig, BillingEvent, BillingInfo, Bootstrap, BoostRecord, EmployerKind, InterviewPrep, Job, JobDraft, JobImportResult, JobMatch, JobPostCredit, Message, Note, Payment, PaymentMethod, PendingVerification, PipelineStep, Person, ProfileVariant, RecommendationRequest, Referral, Report, ReportCategory, ResumeMeta, Review, Role, ScheduledCall, ScreeningAnswer, SessionUser, SupportRequest, TeamInfo, WeightedSkill } from './types';

/** A demo hire shown on the landing ("New Matches Hired"); both people are demo accounts. */
import { tourRuntime } from './lib/tour/runtime';

export type ShowcaseHire = { id: string; hiredAt?: number; candidate: { name: string; title?: string; photo?: string; location?: string }; recruiter: { name: string; photo?: string; company?: string }; job: { title: string; company?: string; accent?: string; location?: string } };

/** What the browser may know about a member's own AI key (never the key itself). */
export type AiKeyInfo = { provider: 'anthropic' | 'openai'; tier: 'best' | 'fast'; model: string; last4: string; savedAt: number };

/** Premium add-on state (server/premium.js). */
export type PremiumState = { active: boolean; source: 'paid' | 'trial' | 'demo' | null; trialUsed: boolean; trialDays: number; trialEndsAt: number | null; paidUntil: number | null; daysLeft: number | null; roleLimit?: number };

export const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// The server's sign-in ended (7 days, or cookies cleared) while the page still shows the member as signed in
// (founder bug, 2026-11-25: "why does Continue give this error?"). App listens and opens the sign-in window.
export const SESSION_EXPIRED_EVENT = 'jmn:session-expired';
// The server's two wordings for "no valid sign-in": "Sign in to continue" and "Sign in to continue as this account".
export function noticeSessionExpired(status: number, error?: string) {
  if (status === 401 && /^Sign in to continue/.test(error || '')) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // A full tour is playing: scripted answers only, nothing reaches the server (src/lib/tour).
  if (tourRuntime.active) return tourRuntime.handle<T>(url, init);
  // credentials: session cookie must travel on native (Capacitor) origins too
  const response = await fetch(`${apiBase}${url}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { noticeSessionExpired(response.status, body.error); throw new Error(body.error || 'Something went wrong. Please try again.'); }
  return body as T;
}

/** Job groups (2026-11-25): public pages /app/{slug}, one public job, full details (signed in), admin. */
export const groupsApi = {
  list: () => request<{ groups: JobGroup[] }>('/api/public/groups'),
  page: (slug: string, q: string) => request<GroupPageData>(`/api/public/groups/${encodeURIComponent(slug)}${q ? `?${q}` : ''}`),
  job: (id: string, q = '') => request<{ job: GroupCard }>(`/api/public/job/${encodeURIComponent(id)}${q ? `?${q}` : ''}`),
  details: (id: string) => request<{ job: Job; liked: boolean }>(`/api/jobs/${encodeURIComponent(id)}/details`),
  event: (name: 'grp_gate_shown' | 'grp_register_started' | 'grp_returned', src?: string) => request<unknown>('/api/public/event', { method: 'POST', body: JSON.stringify({ name, src }) }).catch(() => undefined),
  adminList: () => request<{ groups: JobGroup[] }>('/api/admin/job-groups'),
  adminCreate: (body: Omit<Partial<JobGroup>, 'examples'> & { examples?: string[] | string }) => request<{ group: JobGroup }>('/api/admin/job-groups', { method: 'POST', body: JSON.stringify(body) }),
  adminUpdate: (id: string, body: Omit<Partial<JobGroup>, 'examples'> & { examples?: string[] | string }) => request<{ group: JobGroup }>(`/api/admin/job-groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

/** What the server says after a candidate likes a JobFinder job. App opens the interest panel on this event. */
export type JfLikeResult = { jobId: string; reachability: JfReach; applyUrl: string | null; autoSend: boolean; outreach: JfOutreach };
export const JOBFINDER_LIKED_EVENT = 'jmn:jobfinder-liked';
/** Open the JobFinder interest panel for a job ({ jobId }), e.g. from "Jobs Applied". */
export const JOBFINDER_OPEN_EVENT = 'jmn:jobfinder-open';
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

/** JobFinder (founder spec, 2026-11-25): manager listings, public job page, candidate consent and sending. */
export const jf = {
  list: (q: Record<string, string> = {}) => request<{ jobs: JfManagerRow[]; account: { id: string; name: string } | null }>(`/api/jobfinder/jobs?${new URLSearchParams(q)}`),
  create: (body: Record<string, unknown>) => request<{ job: Job; duplicates: JfManagerRow['duplicates'] }>('/api/jobfinder/jobs', json('POST', body)),
  update: (id: string, body: Record<string, unknown>) => request<{ job: Job; duplicates: JfManagerRow['duplicates'] }>(`/api/jobfinder/jobs/${encodeURIComponent(id)}`, json('PATCH', body)),
  setContact: (id: string, body: { name?: string; email?: string; verifiedHow?: string; verifiedAt?: string; approved: boolean }) => request<{ reachability: JfReach }>(`/api/jobfinder/jobs/${encodeURIComponent(id)}/contact`, json('PUT', body)),
  claims: () => request<{ claims: JfClaim[] }>('/api/jobfinder/claims'),
  decide: (id: string, decision: 'approve' | 'reject', reason?: string) => request<{ claim: JfClaim }>(`/api/jobfinder/claims/${encodeURIComponent(id)}/decide`, json('POST', { decision, reason })),
  publicJob: (id: string) => request<{ job: JobFinderPublicJob }>(`/api/public/jobs/${encodeURIComponent(id)}`),
  applyClick: (id: string) => request<unknown>(`/api/public/jobs/${encodeURIComponent(id)}/apply-click`, json('POST')).catch(() => undefined),
  reportClosed: (id: string) => request<{ ok: boolean; message: string }>(`/api/jobfinder/jobs/${encodeURIComponent(id)}/report-closed`, json('POST')),
  claim: (id: string, note: string) => request<{ claim: JfClaim; duplicate?: boolean }>(`/api/jobfinder/jobs/${encodeURIComponent(id)}/claim`, json('POST', { note })),
  interest: (id: string) => request<{ job: JobFinderPublicJob; reachability: JfReach; liked: boolean; outreach: JfOutreach; consent: JfConsent; shareOptions: { skills: string[]; links: Record<string, string> }; draftBody: string | null; mailer: boolean; recruiterContacted?: boolean }>(`/api/jobfinder/jobs/${encodeURIComponent(id)}/interest`),
  setConsent: (body: { autoSend: boolean; agree?: boolean; skills: string[]; profileLink: string | null; replyEmail: boolean }) => request<{ consent: JfConsent }>('/api/jobfinder/consent', json('PUT', body)),
  send: (id: string, body: { consent: true; share: { skills: string[]; profileLink: string | null; replyEmail: boolean }; body?: string }) => request<{ outreach: JfOutreach }>(`/api/jobfinder/jobs/${encodeURIComponent(id)}/send`, json('POST', body)),
  // "Update roles" from Scrapy's folder (2026-11-26).
  importState: () => request<{ lastEmailDate: string | null; lastRunAt: number | null; knownKeys: string[] }>('/api/jobfinder/import-state'),
  importFiles: (body: { jobs: unknown[]; emailDate?: string }) => request<ScrapedImportResult>('/api/jobfinder/import-files', json('POST', body)),
  // Duplicate roles of the JobFinder account (2026-11-26): dryRun lists them, otherwise the extra copies are taken off.
  dedupe: (body: { dryRun?: boolean }) => request<DedupeResult>('/api/jobfinder/dedupe', json('POST', body)),
  // Outreach dashboard + recruiter contact book (2026-11-26).
  outreach: () => request<OutreachReport>('/api/jobfinder/outreach'),
  // Custom job group (2026-11-26): name + title keywords; matching roles join it at once.
  addGroup: (body: { name: string; keywords: string }) => request<{ group: { id: string; name: string; slug: string; keywords: string[] }; added: number }>('/api/jobfinder/job-groups', json('POST', body)),
};
type DedupeRole = { id: string; title: string; company?: string; location?: string };
export type DedupeResult = { removed: number; dryRun: boolean; groups: { keep: DedupeRole; removed: DedupeRole[]; kept: (DedupeRole & { why: string })[] }[] };
export type ScrapedImportResult = { created: number; duplicate: number; failed: number; results: { ref: string; status: 'created' | 'duplicate' | 'failed'; id?: string; error?: string }[] };

/** Import a job from a link (2026-11-25): analyze → review → save draft / publish. */
export type LinkField<T = string> = { value: T | null; from: 'source' | 'text' | 'link' | null; review: boolean };
export type LinkDuplicate = { id: string; title: string; company: string; location: string; status: string; sourceUrl: string; createdAt?: number; description: string };
export type LinkAnalysis = {
  mode: 'jobfinder' | 'recruiter'; sourceUrl: string | null; sourceName: string | null; sourceJobId: string | null; provider: string;
  retrieved: boolean; method: 'imported' | 'pasted' | 'manual'; extraction: string; notice: string | null; reason: string | null; importedAt: string;
  fields: { title: LinkField; company: LinkField; location: LinkField; workMode: LinkField; type: LinkField; salaryRange: LinkField<{ min: number; max: number; currency: string }>;
    description: LinkField; skills: LinkField<string[]>; experienceLevel: LinkField; deadline: LinkField; applyUrl: LinkField };
  duplicates: LinkDuplicate[]; company?: string;
};
export const jobLink = {
  analyze: (body: { url?: string; text?: string; mode: 'jobfinder' | 'recruiter' }) => request<LinkAnalysis>('/api/job-link/analyze', json('POST', body)),
  duplicates: (body: { mode: 'jobfinder' | 'recruiter'; sourceUrl?: string; title?: string; company?: string; location?: string }) => request<{ duplicates: LinkDuplicate[] }>('/api/job-link/duplicates', json('POST', body)),
  recruiterDraft: (body: Record<string, unknown>) => request<{ job: Job }>('/api/job-link/recruiter-draft', json('POST', body)),
};

export const api = {
  bootstrap: (userId: string) => request<Bootstrap>(`/api/bootstrap?userId=${encodeURIComponent(userId)}`),
  authConfig: () => request<AuthConfig>('/api/auth/config'),
  blocks: () => request<{ blocked: { userId: string; name: string; title: string; photo: string; createdAt: number }[] }>('/api/blocks'),
  block: (userId: string) => request<{ ok: boolean }>('/api/blocks', { method: 'POST', body: JSON.stringify({ userId }) }),
  unblock: (userId: string) => request<{ ok: boolean }>(`/api/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  showcase: () => request<{ jobs: Job[]; candidates: Person[]; hires?: ShowcaseHire[] }>('/api/showcase'),
  reviews: () => request<{ reviews: Review[] }>('/api/feedback'),
  siteSettings: () => request<{ activeLandingBanner: 'default' | 'alt' | 'image'; bannerImage: { url: string; updatedAt: number | null } | null; trialDays?: number }>('/api/site-settings'),
  adminSetSiteSettings: (activeLandingBanner: 'default' | 'alt' | 'image') => request<{ activeLandingBanner: 'default' | 'alt' | 'image' }>('/api/admin/site-settings', { method: 'POST', body: JSON.stringify({ activeLandingBanner }) }),
  adminBankInstructions: () => request<BankInstructionsPayload>('/api/admin/bank-instructions'),
  adminSetBankInstructions: (payload: BankInstructionsPayload) => request<BankInstructionsPayload>('/api/admin/bank-instructions', { method: 'POST', body: JSON.stringify(payload) }),
  adminUploadBannerImage: async (file: File): Promise<{ bannerImage: { url: string; updatedAt: number } }> => {
    const response = await fetch(`${apiBase}/api/admin/site-settings/banner-image`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'image/png' }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Banner image upload failed');
    return body;
  },
  adminSuggestions: () => request<{ suggestions: { id: string; message: string; area: string | null; importance: string | null; createdAt: number; name: string; role: string | null; email: string | null }[] }>('/api/admin/suggestions'),
  submitFeedback: (payload: { type: 'review' | 'suggestion'; message: string; name?: string; role?: string; rating?: number; area?: string; importance?: 'nice' | 'important' | 'blocking'; contactOk?: boolean }) => request<{ ok: boolean; pending?: boolean }>('/api/feedback', { method: 'POST', body: JSON.stringify(payload) }),
  authProfiles: () => request<{ profiles: SessionUser[] }>('/api/auth/profiles'),
  login: (userId: string) => request<{ user: SessionUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ userId }) }),
  loginPassword: (email: string, password: string) => request<{ user: SessionUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  ssoLogin: (provider: 'linkedin' | 'google') => request<{ user: SessionUser }>('/api/auth/sso', { method: 'POST', body: JSON.stringify({ provider }) }),
  // Sign-ups from a job group / job / LinkedIn link carry where they came from (counts only; see lib/pendingJob).
  register: (payload: { role: Role; kind?: EmployerKind; provider?: string; name: string; email: string; password?: string; photo?: string; conductAccepted?: boolean; country?: string; citizenship?: string }) => request<{ user: SessionUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ ...payload, source: acquisitionSource() }) }),
  me: () => request<{ authenticated: boolean; user: SessionUser }>('/api/auth/me'),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) => request<{ ok: boolean; mailer: boolean; account?: boolean }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ ok: boolean; user: SessionUser }>('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  resendVerification: () => request<{ ok: boolean; mailer: boolean }>('/api/auth/resend-verification', { method: 'POST' }),
  deleteAccount: () => request<{ ok: boolean }>('/api/me', { method: 'DELETE' }),
  // Ask AI (job seekers): the server uses the session user only; keys stay server-side.
  aiChatStatus: () => request<{ enabled: boolean; reason?: string; source?: 'own' | 'server'; provider?: string; providerLabel?: string; model?: string; dailyLimit?: number; remaining?: number; ownKey: AiKeyInfo | null; canSaveKey: boolean; premium: PremiumState }>('/api/ai/chat/status'),
  premium: () => request<PremiumState>('/api/premium'),
  startPremiumTrial: (citizenship?: string) => request<PremiumState>('/api/premium/trial', { method: 'POST', body: JSON.stringify(citizenship ? { citizenship } : {}) }),
  aiKey: () =>request<{ key: AiKeyInfo | null; canSave: boolean }>('/api/ai/key'),
  saveAiKey: (provider: 'anthropic' | 'openai', apiKey: string, tier: 'best' | 'fast') => request<{ key: AiKeyInfo }>('/api/ai/key', { method: 'PUT', body: JSON.stringify({ provider, apiKey, tier }) }),
  deleteAiKey: () => request<{ ok: boolean }>('/api/ai/key', { method: 'DELETE' }),
  aiChat: (question: string, history: { role: 'user' | 'assistant'; content: string }[]) => request<{ answer: string; sources: { ref: string; kind: string; label: string }[]; provider: string | null; remaining: number }>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ question, history }) }),
  calendarFeed: (userId: string, reset = false) => request<{ url: string; webcal: string; reminders: number[] }>(`/api/users/${encodeURIComponent(userId)}/calendar-feed`, { method: 'POST', body: JSON.stringify({ reset }) }),
  updateProfile: (userId: string, payload: Partial<Person> & { onboarding?: boolean }) => request<{ user: Person }>(`/api/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  uploadResume: async (userId: string, file: File): Promise<{ resume: ResumeMeta; completeness: number }> => {
    const response = await fetch(`${apiBase}/api/users/${encodeURIComponent(userId)}/resume`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { noticeSessionExpired(response.status, body.error); throw new Error(body.error || 'Upload failed'); }
    return body;
  },
  uploadRecommendationDoc: async (userId: string, file: File): Promise<{ doc: RecommendationDoc & { url: string } }> => {
    const response = await fetch(`${apiBase}/api/users/${encodeURIComponent(userId)}/recommendation-docs`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { noticeSessionExpired(response.status, body.error); throw new Error(body.error || 'Upload failed'); }
    return body;
  },
  deleteRecommendationDoc: (userId: string, docId: string) => request<{ ok: boolean }>(`/api/users/${encodeURIComponent(userId)}/recommendation-docs/${encodeURIComponent(docId)}`, { method: 'DELETE' }),
  recommendationDocUrl: (userId: string, docId: string) => `${apiBase}/api/users/${encodeURIComponent(userId)}/recommendation-docs/${encodeURIComponent(docId)}`,
  uploadResumeThumbnail: async (userId: string, blob: Blob): Promise<void> => {
    await fetch(`${apiBase}/api/users/${encodeURIComponent(userId)}/resume/thumbnail`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/png' }, body: blob });
  },
  // kind 'logo': a recruiter's company logo, stored apart from their own photo (founder bug, 2026-11-25).
  uploadPhoto: async (userId: string, file: File | Blob, kind: 'photo' | 'logo' = 'photo'): Promise<{ photo: string }> => {
    const response = await fetch(`${apiBase}/api/users/${encodeURIComponent(userId)}/photo${kind === 'logo' ? '?kind=logo' : ''}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'image/jpeg' }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { noticeSessionExpired(response.status, body.error); throw new Error(body.error || 'Photo upload failed'); }
    return body;
  },
  // "Get verified": a live selfie an admin compares with the profile photo.
  submitVerificationSelfie: async (userId: string, blob: Blob): Promise<{ verification: NonNullable<Person['verification']> }> => {
    const response = await fetch(`${apiBase}/api/users/${encodeURIComponent(userId)}/verification-selfie`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Selfie upload failed');
    return body;
  },
  registerInterest: (userId: string, feature: 'target-roles-plus' | 'direct-messages-plus' | 'candidate-premium') => request<{ ok: boolean }>('/api/me/interest', { method: 'POST', body: JSON.stringify({ userId, feature }) }),
  connectorKeys: (userId: string) => request<{ keys: ConnectorKey[] }>(`/api/me/connector-keys?userId=${encodeURIComponent(userId)}`),
  createConnectorKey: (userId: string, label: string) => request<{ key: string; record: ConnectorKey }>('/api/me/connector-keys', { method: 'POST', body: JSON.stringify({ userId, label }) }),
  revokeConnectorKey: (userId: string, id: string) => request<{ ok: boolean }>(`/api/me/connector-keys/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  adminPasswordReset: (token: string, password: string) => request<{ ok: boolean; email: string }>('/api/admin/password-reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  adminKpis: () => request<Record<'registrations' | 'matches' | 'hires', AdminKpi>>('/api/admin/kpis'),
  adminStage1: () => request<Stage1Funnel>('/api/admin/stage1'),
  getClaim: (jobId: string, sig: string) => request<ClaimView>(`/api/claim/${encodeURIComponent(jobId)}/${encodeURIComponent(sig)}`),
  postClaim: (jobId: string, sig: string) => request<{ ok: boolean; jobId: string; already?: boolean }>(`/api/claim/${encodeURIComponent(jobId)}/${encodeURIComponent(sig)}`, { method: 'POST', body: '{}' }),
  adminWebAnalytics: (days: number) => request<WebAnalyticsReport>(`/api/admin/web-analytics?days=${days}`),
  adminIntegrations: () => request<{ integrations: Record<string, IntegrationStatus> }>('/api/admin/integrations'),
  adminSaveIntegration: (vendor: string, payload: { key?: string; enabled?: boolean }) => request<{ integrations: Record<string, IntegrationStatus> }>(`/api/admin/integrations/${vendor}`, { method: 'PUT', body: JSON.stringify(payload) }),
  adminTestIntegration: (vendor: string) => request<{ ok: boolean; status: number; error: string | null }>(`/api/admin/integrations/${vendor}/test`, { method: 'POST' }),
  adminVerifications: () => request<{ verifications: PendingVerification[] }>('/api/admin/verifications'),
  adminDecideVerification: (userId: string, decision: 'approve' | 'reject', reason?: string) => request<{ verification: NonNullable<Person['verification']> }>(`/api/admin/verifications/${encodeURIComponent(userId)}/${decision}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminVerificationSelfieUrl: (userId: string) => `${apiBase}/api/admin/verifications/${encodeURIComponent(userId)}/selfie`,
  createJob: (payload: JobDraft & { employerId: string; postSource?: 'editor' | 'quick_post' }) => request<{ job: Job }>('/api/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  // Upload a cover letter (PDF / DOCX / TXT) → its text for the profile's cover letter box (2026-11-26). Not stored.
  coverLetterText: async (userId: string, file: File): Promise<{ text: string; length: number }> => {
    const response = await fetch(`${apiBase}/api/users/${encodeURIComponent(userId)}/cover-letter/extract`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not read that cover letter');
    return body;
  },
  importJobFile: async (employerId: string, sourceSystem: string, file: File): Promise<JobImportResult> => {
    const params = new URLSearchParams({ employerId, sourceSystem });
    const response = await fetch(`${apiBase}/api/jobs/import-file?${params}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not import that file');
    return body as JobImportResult;
  },
  importLinkedInJobs: (employerId: string, jobs: { url: string; title?: string; description: string }[]) => request<JobImportResult>('/api/jobs/import-linkedin', { method: 'POST', body: JSON.stringify({ employerId, jobs }) }),
  updateJob: (id: string, payload: JobDraft) => request<{ job: Job }>(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  uploadJobCover: async (jobId: string, file: File): Promise<{ coverImage: string }> => {
    const response = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}/cover`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Cover upload failed');
    return body;
  },
  parseJob: (payload: { text: string; url?: string }) => request<{ parser: 'claude' | 'heuristic'; parsed: JobDraft }>('/api/jobs/parse', { method: 'POST', body: JSON.stringify(payload) }),
  parseJobFile: async (file: File): Promise<{ parser: string; parsed: JobDraft }> => {
    const response = await fetch(`${apiBase}/api/jobs/parse-file`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'text/plain' }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Could not parse that file');
    return body;
  },
  resumeAutofill: (userId: string) => request<{ generator: string; fields: Partial<Person> & { skills?: { name: string; level: number }[]; languages?: { name: string; level: string }[] } }>(`/api/users/${encodeURIComponent(userId)}/resume/autofill`, { method: 'POST' }),
  jobPrep: (jobId: string) => request<InterviewPrep>(`/api/jobs/${encodeURIComponent(jobId)}/prep`),
  suggestScreening: (requiredSkillsDetail: WeightedSkill[]) => request<{ questions: string[] }>('/api/coach/screening', { method: 'POST', body: JSON.stringify({ requiredSkillsDetail }) }),
  matchIcebreakers: (matchId: string) => request<{ icebreakers: string[]; generator: string }>(`/api/matches/${encodeURIComponent(matchId)}/icebreakers`),
  swipe: (payload: { actorId: string; targetId: string; targetType: 'job' | 'candidate'; direction: 'like' | 'pass'; superLike?: boolean; answers?: ScreeningAnswer[]; note?: string; jobId?: string; src?: string }) => request<{ match: JobMatch | null; likesRemaining: number; duplicate: boolean; jobFinder?: JfLikeResult; recruiterNotified?: string }>('/api/swipes', { method: 'POST', body: JSON.stringify(payload) })
    .then((r) => {
      // Applied to a JobFinder role and its recruiter was just emailed: confirm it (founder, 2026-11-26).
      if (r.recruiterNotified === 'sent') showNotice('Applied ✓ The recruiter has been contacted by email. In Jobs Applied you will see when they view your profile; expect an answer within 48 h after that.');
      return r;
    }),
  undoSwipe: (actorId: string) => request<{ undone: { targetId: string; targetType: string; direction: string } | null; likesRemaining?: number }>('/api/swipes/undo', { method: 'POST', body: JSON.stringify({ actorId }) }),
  // Recruitment process rules: Hired fills the role and thanks the other candidates; stopping needs a reason + feedback.
  hireMatch: (id: string) => request<JobMatch & { effects?: { closed: number; meetingsCancelled: number; messages: number } }>(`/api/matches/${id}`, { method: 'PATCH', body: JSON.stringify({ stage: 'Hired' }) }),
  stopMatch: (id: string, closeCategory: string, closeFeedback: string) => request<JobMatch & { effects?: { closed: number; meetingsCancelled: number; messages: number } }>(`/api/matches/${id}`, { method: 'PATCH', body: JSON.stringify({ stage: 'Archived', closeCategory, closeFeedback }) }),
  updateStage: (id: string, stage: string) => request<JobMatch>(`/api/matches/${id}`, { method: 'PATCH', body: JSON.stringify({ stage }) }),
  updateMatchPipeline: (id: string, pipeline: PipelineStep[], currentStepId: string) => request<JobMatch>(`/api/matches/${id}/pipeline`, { method: 'PATCH', body: JSON.stringify({ pipeline, currentStepId }) }),
  sendFeedbackEmail: (matchId: string, message: string) => request<{ ok: boolean; mailer: boolean }>(`/api/matches/${matchId}/feedback-email`, { method: 'POST', body: JSON.stringify({ message }) }),
  sendRecommendationEmail: (matchId: string, recruiterEmail: string, message?: string) => request<{ ok: boolean; mailer: boolean }>(`/api/matches/${matchId}/recommend-email`, { method: 'POST', body: JSON.stringify({ recruiterEmail, message }) }),
  message: (payload: { matchId: string; senderId: string; text: string }) => request<Message>('/api/messages', { method: 'POST', body: JSON.stringify(payload) }),
  scheduleCall: (payload: { matchId: string; createdBy: string; title: string; startAt: number; durationMinutes: number; notes?: string }) => request<ScheduledCall>('/api/calls', { method: 'POST', body: JSON.stringify(payload) }),
  toggleBookmark: (payload: { userId: string; targetId: string; targetType: 'job' | 'candidate' }) => request<{ bookmarked: boolean }>('/api/bookmarks/toggle', { method: 'POST', body: JSON.stringify(payload) }),
  saveNote: (payload: { userId: string; targetId: string; targetType: 'job' | 'candidate'; text: string }) => request<Note>('/api/notes', { method: 'POST', body: JSON.stringify(payload) }),
  saveProfileVariant: (payload: { userId: string; name: string; title?: string; skills?: string[] }) => request<ProfileVariant>('/api/profile-variants', { method: 'POST', body: JSON.stringify(payload) }),
  activateProfileVariant: (id: string, userId: string) => request<{ user: Person }>(`/api/profile-variants/${id}/activate`, { method: 'POST', body: JSON.stringify({ userId }) }),
  deleteProfileVariant: (id: string, userId: string) => request<{ ok: boolean }>(`/api/profile-variants/${id}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  requestRecommendation: (payload: { userId: string; contact: string }) => request<{ request: RecommendationRequest; mailer: boolean }>('/api/recommendation-requests', { method: 'POST', body: JSON.stringify(payload) }),
  cancelRecommendationRequest: (id: string, userId: string) => request<{ ok: boolean }>(`/api/recommendation-requests/${id}?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  deleteJob: (id: string) => request<{ ok: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' }),
  setJobContact: (id: string, contact: { email?: string; phone?: string }) => request<{ ok: boolean; email: string; phone: string }>(`/api/jobs/${encodeURIComponent(id)}/contact`, { method: 'PUT', body: JSON.stringify(contact) }),

  // --- Recruiter billing (candidates never call any of this) ---
  billingSubscription: (userId: string) => request<BillingInfo>(`/api/billing/subscription?userId=${encodeURIComponent(userId)}`),
  startTrial: (userId: string) => request<BillingInfo>('/api/billing/start-trial', { method: 'POST', body: JSON.stringify({ userId }) }),
  billingReferral: (userId: string) => request<{ referralCode: string; successfulReferrals: number; pendingReferrals: number; credits: BillingInfo['credits'] }>(`/api/billing/referral?userId=${encodeURIComponent(userId)}`),
  trackReferral: (code: string) => request<{ ok: boolean }>('/api/billing/referral/track', { method: 'POST', body: JSON.stringify({ code }) }),
  startPayosPayment: (userId: string) => request<{ payment: Payment; redirectUrl: string | null }>('/api/billing/payments/payos/create', { method: 'POST', body: JSON.stringify({ userId }) }),
  submitPayment: (payload: { userId: string; paymentMethod: PaymentMethod; payerName?: string; bankName?: string; transferDate?: string; txHash?: string }) => request<Payment>('/api/billing/payments', { method: 'POST', body: JSON.stringify(payload) }),
  startVnpayPayment: (userId: string) => request<{ payment: Payment; redirectUrl: string }>('/api/billing/payments/vnpay/create', { method: 'POST', body: JSON.stringify({ userId }) }),
  startStripeCheckout: (userId: string) => request<{ payment: Payment; redirectUrl: string }>('/api/billing/payments/stripe/create-checkout-session', { method: 'POST', body: JSON.stringify({ userId }) }),
  startPaypalSubscription: (userId: string) => request<{ payment: Payment; redirectUrl: string | null }>('/api/billing/payments/paypal/create-subscription', { method: 'POST', body: JSON.stringify({ userId }) }),
  verifyGooglePlayPurchase: (userId: string, purchaseToken: string) => request<{ payment: Payment; alreadyConfirmed?: boolean }>('/api/billing/payments/google-play/verify', { method: 'POST', body: JSON.stringify({ userId, purchaseToken }) }),
  verifyApplePurchase: (userId: string, transactionId: string) => request<{ payment: Payment; alreadyConfirmed?: boolean }>('/api/billing/payments/apple/verify', { method: 'POST', body: JSON.stringify({ userId, transactionId }) }),
  uploadPaymentProof: async (paymentId: string, file: File): Promise<Payment> => {
    const response = await fetch(`${apiBase}/api/billing/payments/${paymentId}/proof`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Proof upload failed');
    return body;
  },
  myPayments: (userId: string) => request<{ payments: Payment[] }>(`/api/billing/payments?userId=${encodeURIComponent(userId)}`),

  // --- Admin billing dashboard (role: 'admin' only) ---
  adminBillingOverview: () => request<{
    pendingPayments: Payment[]; confirmedPayments: Payment[]; rejectedOrRefundedPayments: Payment[];
    activeTrials: AdminRecruiterStatus[]; trialsEndingSoon: AdminRecruiterStatus[]; graceAccounts: AdminRecruiterStatus[]; expiredAccounts: AdminRecruiterStatus[];
    referralRewards: Referral[]; suspiciousReferrals: Referral[]; flaggedForJobReview: { id: string; name: string; email?: string }[]; recentAuditLog: BillingEvent[];
  }>('/api/admin/billing/overview'),
  adminConfirmPayment: (id: string) => request<{ payment: Payment; alreadyConfirmed?: boolean }>(`/api/admin/billing/payments/${id}/confirm`, { method: 'POST' }),
  adminRejectPayment: (id: string, reason: string) => request<Payment>(`/api/admin/billing/payments/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminRefundPayment: (id: string, reason?: string) => request<Payment>(`/api/admin/billing/payments/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminGrantCredit: (recruiterUserId: string, reason: string, durationDays?: number) => request<unknown>('/api/admin/billing/credits', { method: 'POST', body: JSON.stringify({ recruiterUserId, reason, durationDays }) }),
  adminRevokeCredit: (id: string, reason: string) => request<unknown>(`/api/admin/billing/credits/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminSuspendSubscription: (id: string, reason?: string) => request<unknown>(`/api/admin/billing/subscriptions/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminReactivateSubscription: (id: string) => request<unknown>(`/api/admin/billing/subscriptions/${id}/reactivate`, { method: 'POST' }),
  adminBillingPlans: () => request<AdminPlansOverview>('/api/admin/billing/plans'),
  // Editable pricing plans + payment methods (founder, 2026-11-24).
  livePlans: () => request<{ plans: LivePlan[]; headline: string[] }>('/api/plans'),
  adminCatalog: () => request<AdminCatalog>('/api/admin/billing/catalog'),
  adminSavePlan: (key: string, plan: Partial<AdminPlanInput>) => request<AdminCatalog & { customersKeptTheirPrice?: number }>(`/api/admin/billing/catalog/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(plan) }),
  adminDeletePlan: (key: string) => request<AdminCatalog>(`/api/admin/billing/catalog/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  adminReprice: (subscriptionId: string) => request<{ subscription: unknown }>(`/api/admin/billing/subscriptions/${encodeURIComponent(subscriptionId)}/reprice`, { method: 'POST', body: '{}' }),
  adminPaymentMethods: () => request<AdminPaymentMethods>('/api/admin/billing/payment-methods'),
  adminSaveProviderKeys: (provider: string, keys: Record<string, string | null>) => request<AdminPaymentMethods>(`/api/admin/billing/payment-methods/keys/${provider}`, { method: 'PUT', body: JSON.stringify(keys) }),
  adminTestProvider: (provider: string) => request<{ ok: boolean; message: string }>(`/api/admin/billing/payment-methods/test/${provider}`, { method: 'POST', body: '{}' }),
  adminSavePaymentMethod: (id: string, change: { enabled?: boolean; grid?: Record<string, boolean | null> }) => request<AdminPaymentMethods>(`/api/admin/billing/payment-methods/${id}`, { method: 'PUT', body: JSON.stringify(change) }),
  adminGrantJobCredit: (recruiterUserId: string, reason: string) => request<JobPostCredit>('/api/admin/billing/job-credits', { method: 'POST', body: JSON.stringify({ recruiterUserId, reason }) }),
  adminRevokeJobCredit: (id: string, reason: string) => request<JobPostCredit>(`/api/admin/billing/job-credits/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminExtendTrial: (id: string, days: number, reason: string) => request<unknown>(`/api/admin/billing/subscriptions/${id}/extend-trial`, { method: 'POST', body: JSON.stringify({ days, reason }) }),
  adminGrantBoost: (kind: 'job' | 'candidate', targetId: string, reason: string) => request<{ outcome: string; boost: BoostRecord }>('/api/admin/billing/boosts', { method: 'POST', body: JSON.stringify({ kind, targetId, reason }) }),
  adminRevokeBoost: (id: string, reason: string) => request<BoostRecord>(`/api/admin/billing/boosts/${id}/revoke`, { method: 'POST', body: JSON.stringify({ reason }) }),
  billingSelectPlan: (userId: string, planKey: string, interval?: 'monthly' | 'annual', extraJobSlots?: number) => request<BillingInfo>('/api/billing/plan', { method: 'POST', body: JSON.stringify({ userId, planKey, interval, ...(extraJobSlots !== undefined ? { extraJobSlots } : {}) }) }),
  billingTeam: (userId: string) => request<TeamInfo>(`/api/billing/team?userId=${encodeURIComponent(userId)}`),
  billingInviteTeamMember: (userId: string, email: string) => request<TeamInfo>('/api/billing/team/members', { method: 'POST', body: JSON.stringify({ userId, email }) }),
  adminAnalyticsOverview: () => request<AdminAnalyticsOverview>('/api/admin/analytics/overview'),

  // --- Admin: job moderation ---
  adminJobs: (params?: { status?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ jobs: AdminJobSummary[] }>(`/api/admin/jobs${suffix}`);
  },
  adminSuspendJob: (id: string, reason: string) => request<AdminJobSummary>(`/api/admin/jobs/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminRestoreJob: (id: string) => request<AdminJobSummary>(`/api/admin/jobs/${id}/restore`, { method: 'POST' }),

  // --- Admin: unified action queue ---
  adminActionQueue: () => request<{ items: ActionQueueItem[] }>('/api/admin/action-queue'),

  // --- Admin: account management ---
  adminUsers: (params?: { role?: 'candidate' | 'employer'; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.role) qs.set('role', params.role);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<{ users: AdminUserSummary[] }>(`/api/admin/users${suffix}`);
  },
  adminUserDetail: (id: string) => request<AdminUserDetail>(`/api/admin/users/${id}`),
  adminSuspendUser: (id: string, reason: string) => request<AdminUserSummary>(`/api/admin/users/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
  adminReactivateUser: (id: string) => request<AdminUserSummary>(`/api/admin/users/${id}/reactivate`, { method: 'POST' }),

  // --- Fraud / scam / safety reports ---
  submitReport: (payload: { userId: string; targetType: 'user' | 'job' | 'conversation'; targetId: string; category: ReportCategory; description?: string }) =>
    request<Report>('/api/reports', { method: 'POST', body: JSON.stringify(payload) }),
  adminReports: (status?: string) => request<{ reports: Report[] }>(`/api/admin/reports${status ? `?status=${status}` : ''}`),
  adminResolveReport: (id: string, resolution: string) => request<Report>(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution }) }),
  adminDismissReport: (id: string) => request<Report>(`/api/admin/reports/${id}/dismiss`, { method: 'POST' }),

  // --- Customer support requests ---
  submitSupportRequest: (payload: { name: string; email: string; message: string; userId?: string }) =>
    request<SupportRequest>('/api/support/requests', { method: 'POST', body: JSON.stringify(payload) }),
  adminSupportRequests: (status?: string) => request<{ requests: SupportRequest[] }>(`/api/admin/support/requests${status ? `?status=${status}` : ''}`),
  adminResolveSupportRequest: (id: string) => request<SupportRequest>(`/api/admin/support/requests/${id}/resolve`, { method: 'POST' }),
};
