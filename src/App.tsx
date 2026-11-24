import { Fragment, Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { DemoBadge } from './components/DemoBadge';
import { SupportModal } from './components/SupportModal';
import { ReportModal } from './components/ReportModal';
import { ConductModal } from './components/ConductModal';
import { AdminPasswordSetup } from './components/AdminPasswordSetup';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { MobileTabs } from './components/MobileTabs';
import { likesWaiting } from './lib/today';
import { Activity, ArrowLeft, ArrowRight, BadgeCheck, Bot,Crown, BarChart3, Bell, Bookmark as BookmarkIcon, BriefcaseBusiness, Calendar, Check, ChevronDown, CircleHelp, Clock3, Coffee, Command, Compass, CreditCard, Download, ExternalLink, Eye, FileText, Filter, Ban, Flag,Flame, Gift, Handshake, Heart, Inbox, Layers3, Lightbulb, Linkedin, ListChecks, Loader2, Lock, LogOut, Mail, Map as MapIcon, MapPin, Menu, MessageCircle, MessageCircleQuestion, MoreHorizontal, RotateCcw, Search, Send, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Star, Target, Trash2, Users, X, Zap } from 'lucide-react';
import { api } from './api';
import { apiBase } from './api';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as NativeApp } from '@capacitor/app';
import { LoginModal, RegisterModal, ResetPasswordModal, SettingsModal, prefetchDemoProfiles } from './components/AuthModals';
import { FeaturesTable, FeedbackSection, JourneyPipeline, LatestShowcase } from './components/LandingSections';
import { GetAppButton, InstallPopup } from './components/InstallAppBar';
import { AppFeaturesSection, WhatItIsSection, ForWhoSection, HowSection, ProblemSection, SoWhatSection, WhatNowSection } from './components/landing/StorySections';
import { HeroAlt, HeroDefault, HeroImage } from './components/landing/HeroBanners';
import { CANDIDATE_OFFERS, LaunchOffers } from './components/LaunchOffers';
import { PlanCardView, TrialCardView } from './components/landing/PlanCards';
import { ANNUAL_MONTHS_CHARGED, applyLivePlans, BOOST, EXTRA_JOB_SLOT, HEADLINE_PLANS, planCard, POSTING_TERM_DAYS, SINGLE_POSTING, TRIAL } from './lib/plans';
import { CandidateWizard } from './components/profile/CandidateWizard';
import { CandidateProfilePage } from './components/profile/CandidateProfilePage';
import { RecruiterWizard } from './components/profile/RecruiterWizard';
import { RecruiterProfilePage } from './components/profile/RecruiterProfilePage';
import { CandidateCards } from './components/profile/CandidateCards';
import { JobCards } from './components/jobs/JobCards';
import { CandidateHome, CandidateProfileModal, DashboardTitle, EmptyRow, RecruiterHome } from './components/home/MatchHome';
import { SelectedCandidates } from './components/home/SelectedCandidates';
import { HiringStages } from './components/home/HiringStages';
import { BillingPage } from './components/billing/BillingPage';
import { AdminBillingPage } from './components/billing/AdminBillingPage';
import { AdminAnalyticsPage } from './components/billing/AdminAnalyticsPage';
import { AdminUsersPage } from './components/billing/AdminUsersPage';
import { AdminSafetyPage } from './components/billing/AdminSafetyPage';
import { AdminJobsPage } from './components/billing/AdminJobsPage';
import { AdminActionQueuePage } from './components/billing/AdminActionQueuePage';
import { AdminIntegrationsPage, AdminKpisPage, AdminTrafficPage } from './components/billing/AdminInsightsPages';
import { NotesBox } from './components/NotesBox';
import { useDiscoverDeck } from './components/discover/useDiscoverDeck';
import { EmptyDeck, MatchModal, SalaryBadge, TryDemoContext } from './components/discover/DeckParts';
import { FilterFields, SearchFiltersSheet } from './components/discover/SearchFilters';
import { OPEN_FILTERS_EVENT } from './components/home/DeckActionBar';
import { resetSharedFilters, useSharedFilters } from './components/discover/filterStore';
import { activeFilterCount } from './components/discover/deckLogic';
// Lazy-loaded: pulls in pdf.js only when a resume is actually opened.
const ResumeViewerModal = lazy(() => import('./components/ResumeViewerModal').then((m) => ({ default: m.ResumeViewerModal })));
// Full tours (founder, 2026-11-24): the player and its scripted data load only when a tour starts.
const TourApp = lazy(() => import('./components/tour/TourApp'));
import { START_TOUR_EVENT, TOUR_SEEN_KEY, TOUR_VIEW_EVENT, type TourRole } from './lib/tour/runtime';
import { JobEditor } from './components/jobs/JobEditor';
import { QuickPostRole } from './components/jobs/QuickPostRole';
import { JobImportModal } from './components/jobs/JobImportModal';
import { CompanyLogoMark, JobHeaderBadge } from './components/jobs/JobHeaderBadge';
import { GapCoach, JobDetailModal, MatchDetailModal, ScreeningModal } from './components/coach/CoachModals';
import { CandidateStarters, RecruiterStarters } from './components/messages/ConversationStarters';
import { ScheduleCallModal } from './components/messages/ScheduleCallModal';
import { FeedbackEmailModal, RecommendationEmailModal } from './components/messages/FeedbackModals';
import { googleCalendarUrl, icsDataUrl, meetingMailto, outlookCalendarUrl } from './lib/calendar';
import { CalendarSync } from './components/CalendarSync';
import { RecruitmentRulesModal } from './components/RecruitmentRulesModal';
import { Mail as MailIcon } from 'lucide-react';
import type { ScreeningAnswer } from './types';
import { comparisonRows } from './content/landingContent';
import { loadSession, saveSession } from './lib/auth';
import { featureOn } from './lib/flags';
import { applyNoTrackParam, deviceNotCounted, installAdminHotkey, installNoTrackSwitch, setDeviceNotCounted, trackView } from './lib/tracker';
import { scoreOf } from './lib/report';
import { CandidateReport, RecruiterReport, downloadText, reportCsv } from './components/home/ReportSections';
import { AiAnalystInline } from './components/home/AiAnalyst';
import { CandidateSubscription } from './components/home/CandidateSubscription';
import { ChatbotPage } from './components/home/ChatbotPage';
import { FeedbackPage } from './components/home/FeedbackPage';
import { FindMyMatchPage, RoleBarExtra } from './components/home/FindMyMatchPage';
import { HiredResults } from './components/home/HiredResults';
import { InterviewPreparation } from './components/home/InterviewPreparation';
import { AskAi } from './components/home/AskAi';
import { GraduationCap, Trophy } from 'lucide-react';
import { FindMatches } from './components/findmatches/FindMatches';
import type { Bootstrap, Job, JobMatch, Message, Person, Role, ScheduledCall, SessionUser, View } from './types';

type NotificationItem = {
  id: string;
  kind: 'match' | 'msg' | 'billing';
  /** The server's specific billing event (trial_ending_7, job_credit_awarded, …).
   *  Kept so each billing notification can route and render on its own terms. */
  billingKind?: string;
  text: string;
  at: number;
  matchId?: string;
  jobId?: string;
};

/** Billing notifications about a posting belong on the Jobs screen; everything
 *  else (trials, plans, credits, payments) belongs on Subscription. Unknown or
 *  future kinds fall through to Subscription, which is the safe default. */
// The floating "Ask AI" button is off on every screen (founder, 2026-11-22); true brings it back.
const ASK_AI_BUTTON = false;
const JOB_NOTIFICATION_KINDS =new Set(['job_expiring_7', 'job_expiring_1', 'job_expired', 'free_job_published', 'referral_job_credit_consumed']);

function billingNotificationIcon(billingKind?: string) {
  if (billingKind && JOB_NOTIFICATION_KINDS.has(billingKind)) return <BriefcaseBusiness size={14} />;
  if (billingKind?.startsWith('referral')) return <Gift size={14} />;
  if (billingKind?.startsWith('trial') || billingKind === 'downgraded_to_free') return <Clock3 size={14} />;
  return <CreditCard size={14} />;
}

// Nav items either open a dedicated view (`view`) or scroll to a section on the
// home dashboard (`anchor`). `short` is the compact label for the mobile bar.
type NavItem = { label: string; short?: string; icon: typeof Compass; view?: View; anchor?: string };
const candidateNav: NavItem[] = [
  // "My dashboard" (was "Things to do") is first in the menu (founder, 2026-11-22); the app still opens on Find My Match.
  { label: 'My dashboard', short: 'Dashboard', icon: Compass, anchor: 'td-today' },
  // "Find My Match" (the swipe deck + Recommended Roles) is the page the app opens on.
  { label: 'Find My Match', short: 'Match', icon: Flame, view: 'match' },
  { label: 'Conversations', short: 'Chat', icon: MessageCircle, view: 'messages' },
  // "Saved" and "Recruiters that like you" left the menu (founder, 2026-11-22); both stay on the Things to do page.
  { label: 'Job Matches', icon: Heart, anchor: 'td-matches' },
  { label: 'Recruiter Invitation', short: 'Invites', icon: Calendar, view: 'meetings' },
  // AI interview preparation (refresh plan with your own chatbot = Premium), renamed and moved below the
  // invitations (founder, 2026-11-22).
  { label: 'Interview AI coach', short: 'Coach', icon: GraduationCap, view: 'prep' },
  { label: 'Hiring Stages', short: 'Stages', icon: ListChecks, view: 'stages' },
  { label: 'Coffee Invitations', short: 'Coffee', icon: Coffee, view: 'coffee' },
  { label: 'Reports', icon: BarChart3, view: 'analytics' },
  { label: 'Use your chatbot here', short: 'Chatbot', icon: Bot, view: 'assistant' },
  { label: 'Feedback', icon: Lightbulb, view: 'feedback' },
  { label: 'Premium options', short: 'Premium', icon: Crown, view: 'billing' },
];
// One colour per menu item, so each section is easy to spot.
const NAV_COLORS: Record<string, string> = {
  Home: '#ff6d9c', 'Things to do': '#ff6d9c', 'My dashboard': '#ff6d9c', 'Find My Match': '#ff8a3d', 'Look for new Matches': '#ff8a3d', 'Job Matches': '#ff4d6d', 'Recruiters that like you': '#f5c518',
  Conversations: '#3ea6ff', Saved: '#a78bfa', Meetings: '#2dd4bf', 'Hiring Stages': '#34d399', Reports: '#60a5fa',
  Subscription: '#fbbf24', 'Premium options': '#fbbf24', 'Use your chatbot here': '#c084fc', Feedback: '#facc15', 'My JobMatches': '#ff8a3d', 'Selected Candidates': '#34d399',
  'Coffee Invitations': '#e0a96d', 'Hired Results': '#fbbf24', 'Interview AI coach': '#a78bfa', 'Recruiter Invitation': '#2dd4bf', Interviews: '#2dd4bf',
};
// Mirrors the candidate menu (same order and pages), plus the recruiter-only lists.
const employerNav: NavItem[] = [
  { label: 'My dashboard', short: 'Dashboard', icon: Compass, view: 'home' },
  // "Find My Match": the candidate swipe deck + Recommended Candidates, the page recruiters open on too.
  { label: 'Find My Match', short: 'Match', icon: Flame, view: 'match' },
  // Order (founder, 2026-11-22): My JobMatches, then Conversations, then Coffee Invitations.
  { label: 'My JobMatches', icon: BriefcaseBusiness, anchor: 'td-roles' },
  { label: 'Conversations', short: 'Chat', icon: MessageCircle, view: 'messages' },
  { label: 'Coffee Invitations', short: 'Coffee', icon: Coffee, view: 'coffee' },
  { label: 'Selected Candidates', short: 'Candidates', icon: Users, view: 'selected' },
  // "Saved" left the recruiter menu (founder, 2026-11-22); "Hired Results" sits after Hiring Stages.
  { label: 'Meetings', icon: Calendar, view: 'meetings' },
  { label: 'Hiring Stages', short: 'Stages', icon: ListChecks, view: 'stages' },
  { label: 'Hired Results', short: 'Hired', icon: Trophy, view: 'hired' },
  { label: 'Reports', icon: BarChart3, view: 'analytics' },
  { label: 'Use your chatbot here', short: 'Chatbot', icon: Bot, view: 'assistant' },
  { label: 'Feedback', icon: Lightbulb, view: 'feedback' },
  { label: 'Subscription', icon: CreditCard, view: 'billing' },
];

async function connectLinkedIn() {
  const url = `${apiBase}/api/auth/linkedin${Capacitor.isNativePlatform() ? '?platform=native' : ''}`;
  if (Capacitor.isNativePlatform()) await Browser.open({ url });
  else window.location.href = url;
}

export default function App() {
  const [session, setSession] = useState<SessionUser | null>(loadSession);
  const signIn = (user: SessionUser) => {
    // "Sign-up after tour": a new account created in a tab that played a full tour.
    try { const seen = sessionStorage.getItem(TOUR_SEEN_KEY); if (seen && user.isNew) { trackView(`/tour/${seen}/registered`); sessionStorage.removeItem(TOUR_SEEN_KEY); } } catch { /* private mode */ }
    saveSession(user); setSession(user);
  };
  // Full tours: "Watch Candidate full tour" / "Watch Recruiter full tour" in the sign-in window.
  const [tour, setTour] = useState<TourRole | null>(null);
  const [landingModal, setLandingModal] = useState<'register' | null>(null);
  useEffect(() => {
    const start = (event: Event) => { const role = (event as CustomEvent<{ role: TourRole }>).detail?.role; if (role) { setLandingModal(null); setTour(role); } };
    window.addEventListener(START_TOUR_EVENT, start);
    return () => window.removeEventListener(START_TOUR_EVENT, start);
  }, []);
  useEffect(() => { if (tour) window.scrollTo(0, 0); }, [tour]);
  const signOut = () => { api.logout().catch(() => undefined); saveSession(null); setSession(null); };
  // Restore a server session (cookie) after a refresh or an SSO redirect.
  useEffect(() => {
    if (session) return;
    api.me().then(({ user }) => { saveSession(user); setSession(user); }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    NativeApp.addListener('appUrlOpen', ({ url }) => {
      const callback = new URL(url);
      if (callback.protocol === 'jobmatch:' && callback.hostname === 'auth') {
        Browser.close();
        if (callback.searchParams.get('success') === '1') api.login('candidate-demo').then(({ user }) => signIn(user));
      }
    }).then((handle) => { remove = () => handle.remove(); });
    return () => remove?.();
  }, []);
  // Password-reset deep link (?reset=<token>) — shown over whatever's rendered.
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset') || '');
  const clearQuery = (key: string) => { const url = new URL(window.location.href); url.searchParams.delete(key); window.history.replaceState({}, '', url.pathname + url.search); };
  const finishReset = (user?: SessionUser) => { setResetToken(''); clearQuery('reset'); if (user) signIn(user); };

  // Owner shortcut: Left Shift + Z opens the admin sign-in (Google SSO; checked on the server).
  // Only when signed out, so a stray key press never signs a member out.
  useEffect(() => installAdminHotkey(() => {
    if (session) return;
    window.location.href = `${window.location.pathname}?admin=1`;
  }), [session]);
  // Live price list (founder, 2026-11-24): pricing pages follow the plans the admin edits. Re-render once loaded.
  const [, setPlansVersion] = useState(0);
  useEffect(() => { api.livePlans().then(({ plans, headline }) => { applyLivePlans(plans, headline); setPlansVersion((v) => v + 1); }).catch(() => undefined); }, []);
  // "Don't count this device" (founder, 2026-11-24): ?notrack=1/0, 5 taps on the logo, Shift + 0 or Shift + X.
  useEffect(() => { applyNoTrackParam(); return installNoTrackSwitch(); }, []);
  // A device where an admin signs in is the owner's: it stops counting (the server also ignores admin sessions).
  useEffect(() => { if (session?.role === 'admin' && !deviceNotCounted()) setDeviceNotCounted(true); }, [session?.role]);
  // One-time admin password setup link (?admin-reset=<token>), created on the server.
  const [adminReset, setAdminReset] = useState(() => new URLSearchParams(window.location.search).get('admin-reset') || '');
  const closeAdminReset = (signIn = false) => {
    setAdminReset(''); clearQuery('admin-reset');
    if (signIn) window.location.href = `${window.location.pathname}?admin=1`;
  };
  // The admin heatmap loads the public landing page in an iframe with ?heatmap=1.
  const heatmapPreview = new URLSearchParams(window.location.search).get('heatmap') === '1';

  if (tour && !session) return <Suspense fallback={<div className="tour-loading" role="status">Loading the tour…</div>}>
    <TourApp key={tour} role={tour}
      renderWorkspace={(user, onExit) => <Workspace key={user.id} session={user} onSwitchUser={() => undefined} onExit={onExit} />}
      onEnd={(next) => { setTour(null); setLandingModal(next === 'signup' ? 'register' : null); window.scrollTo(0, 0); }} />
  </Suspense>;

  return <>
    {!session || heatmapPreview ? <Landing onLogin={signIn} initialModal={landingModal} />
      : session.role === 'admin' ? <AdminWorkspace session={session} onExit={signOut} />
      : <Workspace key={session.id} session={session} onSwitchUser={signIn} onExit={signOut} />}
    {adminReset && <AdminPasswordSetup token={adminReset} onClose={() => closeAdminReset()} onSignIn={() => closeAdminReset(true)} />}
    <AnimatePresence>{resetToken && <ResetPasswordModal token={resetToken} onClose={() => finishReset()} onComplete={finishReset} />}</AnimatePresence>
  </>;
}

function Landing({ onLogin, initialModal = null }: { onLogin: (user: SessionUser) => void; initialModal?: 'register' | null }) {
  const linkedinState = new URLSearchParams(window.location.search).get('linkedin');
  // Recruiter-only referral capture: ?ref=CODE or /ref/CODE. Fires once to set
  // the signed 30-day cookie the server reads back during recruiter
  // registration; never attached to a candidate signup.
  const refCode = new URLSearchParams(window.location.search).get('ref') || window.location.pathname.match(/^\/ref\/([A-Za-z0-9]+)/)?.[1];
  useEffect(() => {
    if (!refCode) return;
    api.trackReferral(refCode).catch(() => undefined);
    if (window.location.pathname.startsWith('/ref/')) window.history.replaceState({}, '', '/');
  }, [refCode]);
  // ?admin=1 (the Left Shift + Z shortcut) opens sign-in straight away.
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(() => new URLSearchParams(window.location.search).get('admin') === '1' ? 'login' : initialModal);
  useEffect(() => { trackView('/'); }, []);
  // Load the demo accounts in the background so "Test demo account" is ready the moment sign-in opens.
  useEffect(() => { prefetchDemoProfiles().catch(() => undefined); }, []);
  const [conductOpen, setConductOpen] = useState(false);
  const isPhone = usePhoneWidth();
  // Header links. Phones show "How it works" (#how); desktop keeps the comparison (#compare).
  const subnavLinks: [string, string][] = [['#what-is-it', 'What is it?'], ['#problem', 'What problem do we solve?'], [isPhone ? '#how' : '#compare', 'How?'], ['#pricing', 'Try it now for free']];
  const subnavRef = useRef<HTMLElement | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const headerBottom = () => document.querySelector('.landing-header')?.getBoundingClientRect().bottom ?? 0;
  const goToSection = (href: string) => {
    const section = document.querySelector<HTMLElement>(href); if (!section) return;
    // Frame the section's label (kicker) or title 16px under the sticky header, whatever the section padding.
    const el = section.querySelector<HTMLElement>('[class*="kicker"], [class*="eyebrow"], h2') ?? section;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - headerBottom() - 16), behavior: reduce ? 'auto' : 'smooth' });
    setActiveSection(href);
    history.replaceState(null, '', href);
  };
  // Phones: highlight the link of the section under the header, and keep it visible in the scrollable bar.
  useEffect(() => {
    if (!isPhone) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = headerBottom() + 40;
      let current: string | null = null;
      for (const [href] of subnavLinks) { const el = document.querySelector(href); if (el && el.getBoundingClientRect().top <= line && el.getBoundingClientRect().bottom > line) current = href; }
      setActiveSection(current);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhone]);
  useEffect(() => {
    const a = activeSection && subnavRef.current?.querySelector<HTMLElement>(`a[href="${activeSection}"]`);
    const bar = subnavRef.current;
    if (a && bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2, behavior: 'smooth' });
  }, [activeSection]);
  const openLogin = () => setAuthModal('login');
  const openRegister = () => setAuthModal('register');
  const complete = (user: SessionUser) => { setAuthModal(null); onLogin(user); };
  const [banner, setBanner] = useState<'default' | 'alt' | 'image'>('default');
  const [bannerImageUrl, setBannerImageUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    api.siteSettings().then((res) => {
      setBanner(res.activeLandingBanner);
      // The ?v= cache-buster is already on the URL, so a replaced image shows
      // immediately instead of serving the browser's copy of the old one.
      setBannerImageUrl(res.bannerImage ? `${apiBase}${res.bannerImage.url}` : undefined);
    }).catch(() => undefined);
  }, []);
  type TrustPipelineRow = {
    label: string; classic: number; jobsmatch: number; unit: string; color: string;
    feature: string; note: string; classicDisplay?: string; jobsmatchDisplay?: string; deltaText?: string;
  };
  const trustPipeline: TrustPipelineRow[] = [
    { label: 'Steps to hire', classic: 9, jobsmatch: 6, unit: ' steps', color: '#FF3B30', feature: 'Mutual Matching + Automated Resume and Job Analysis', note: 'JobsMatchNow combines application, application receipt, resume screening, job-description comparison, and mutual-interest confirmation into one connected step.' },
  ];
  // Steps only: how the product is built. No day counts or "time saved" until real usage data exists.
  const traditionalSteps = [
    'Candidate sends a job application',
    'Recruiter receives and processes applications',
    'Resume screening',
    'Resume compared with the job description',
    'Recruiter screening call and scheduling',
    'Interview and assessment rounds',
    'Reference and background checks',
    'Offer negotiation',
    'Offer acceptance and hire',
  ];
  const jobsmatchNowSteps = [
    'Application receipt, profile/resume screening, job-description analysis, and mutual matching combined',
    'Recruiter screening call or direct local meetup',
    'Interview and assessment rounds',
    'Reference and background checks',
    'Offer negotiation',
    'Offer acceptance and hire',
  ];
  const modals = <AnimatePresence>
    {authModal === 'login' && <LoginModal onClose={() => setAuthModal(null)} onComplete={complete} onRegister={() => setAuthModal('register')} />}
    {authModal === 'register' && <RegisterModal onClose={() => setAuthModal(null)} onComplete={complete} />}
  </AnimatePresence>;

  // One responsive landing for every screen size — mobile gets the same hero,
  // stacked for phone width (no separate mobile layout).
  return <main className={isPhone ? 'landing landing-phone' : 'landing'}>
    <header className={`landing-header${banner !== 'image' ? ' has-brand' : ''}`}>
      {banner !== 'image' && <nav className="landing-nav"><Brand /></nav>}
      {/* Header (founder, 2026-11-23): tagline under the logo, then 3 centred links: Why (the problems we solve),
          So what? (benefits), How it works better (the features designed for a faster hiring process). */}
      {banner !== 'image' && <p className="landing-tagline">Find your Best Job Match Easier, Faster, Better</p>}
      {/* Bar (founder, 2026-11-23, 2nd version): What is it? → summary, What problem do we solve? → problems,
          How? → "A Better, Faster, Easier, Friendlier Way of Hiring" (benefits on phones), Try it now for free → pricing. */}
      {/* Phones (founder, 2026-11-24): How? → "How it works" (three steps); each link lands its section just under
          the header and the link of the section on screen stays highlighted. Desktop links unchanged. */}
      {banner !== 'image' && <nav className="landing-subnav main3" ref={subnavRef}>{subnavLinks.map(([href, label]) =>
        <a key={href} href={href} className={isPhone && activeSection === href ? 'active' : undefined} aria-current={isPhone && activeSection === href ? 'location' : undefined}
          onClick={isPhone ? (event) => { event.preventDefault(); goToSection(href); } : undefined}>{label}</a>)}</nav>}
    </header>
    {linkedinState && <div className="integration-notice">{linkedinState === 'connected' ? 'LinkedIn connected. Your professional identity is ready to use.' : 'Add LinkedIn app credentials to enable live account connection. The demo remains available.'}<button onClick={() => history.replaceState({}, '', '/')}>×</button></div>}
    {isPhone && <div className="get-app-row"><GetAppButton /></div>}
    {isPhone && <InstallPopup />}
    {banner === 'alt' ? <HeroAlt onRegister={openRegister} onLogin={openLogin} />
      : banner === 'image' ? <HeroImage url={bannerImageUrl} onRegister={openRegister} onLogin={openLogin} />
      : <HeroDefault onRegister={openRegister} onLogin={openLogin} />}
    {banner === 'image' && <nav className="landing-subnav hero-image-subnav">
      <a href="#compare">Why JobsMatchNow</a>
      <a href="#features">Features</a>
      <a href="#journey">The journey</a>
      <a href="#how">How it works</a>
      <a href="#trust">Fewer steps</a>
      <a href="#latest">Live now</a>
      <a href="#feedback">Reviews</a>
      <a href="#pricing">Pricing</a>
    </nav>}
    {/* Phones get the concise story (founder, 2026-11-22): what it is (hero) → problem → for who → how → so what →
        pricing → what now. Desktop keeps its original sections unchanged (founder: "keep the desktop UI as is"). */}
    {isPhone ? <>
      <WhatItIsSection />
      <ProblemSection />
      <ForWhoSection onRegister={openRegister} />
      <HowSection />
      <SoWhatSection />
      <AppFeaturesSection />
    </> : <>
      <WhatItIsSection />
      <ProblemSection />
      <section className="comparison-section" id="compare">
        <div className="comparison-intro"><div><h2>A Better, Faster, Easier, Friendlier Way of Hiring</h2></div><div className="comparison-copy"><p>Traditional hiring creates hurdles: endless searching, slow applications, repeated screenings, multiple exchanges, long delays — and too often, silence, no feedback. No sign of due respect.</p><p>JobsMatchNow removes the friction and creates Respect, Mutual Alignment, and a Clear, Fast Decision Cycle with Feedback.</p><p>Everything candidates and hiring teams need — from first discovery and mutual interest to a qualified conversation — is brought together in one simple, respectful, and intelligent experience.</p><p className="comparison-tagline">Less chasing. Fewer hurdles. Faster, better hires with feedback — more personalized, respectful hires with a human touch.</p></div></div>
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead><tr><th>Experience</th><th><span className="old-dot" />Traditional hiring</th><th><span className="new-dot" />JobsMatchNow</th><th>What changes</th></tr></thead>
            <tbody>{comparisonRows.map((row) => <tr key={row.feature}><th scope="row">{row.feature}</th><td data-label="Traditional hiring"><X size={15} />{row.traditional}</td><td data-label="JobsMatchNow"><Check size={15} />{row.jobmatch}</td><td data-label="What changes"><span>{row.impact}</span></td></tr>)}</tbody>
          </table>
        </div>
        <div className="comparison-cta"><div><Sparkles size={19} /><span><strong>See the difference yourself.</strong> Switch between candidate and recruiter views in the live product.</span></div><button className="primary-button" onClick={openLogin}>Explore every feature <ArrowRight size={17} /></button></div>
      </section>
      <FeaturesTable />
      <AppFeaturesSection />
      <JourneyPipeline />
      <section className="value-section" id="how"><div className="section-heading centered"><span className="eyebrow"><Sparkles size={14} /> A better signal</span><h2>Hiring works better when<br />both sides choose.</h2></div><div className="value-grid"><Feature icon={BarChart3} title="Fit, explained" text="Go beyond keywords with transparent skill, experience, and preference signals." /><Feature icon={Handshake} title="Intent, confirmed" text="A conversation opens only after both sides express interest. No cold outreach." /><Feature icon={MapIcon} title="Geolocation of Opportunities" text="Choose a city and private distance range, then meet for coffee only when both sides agree." /><Feature icon={ShieldCheck} title="People, respected" text="Salary and work style are clear up front. Candidate controls stay at the center." /></div></section>
      <section className="trust-section" id="trust"><div className="trust-copy"><span className="section-kicker light">Fewer steps</span><h2>Hiring where both sides choose — with a human touch.</h2><p>Every recommendation carries its reason. Every connection starts with consent. Every candidate gets control over what employers can see.</p><button className="primary-button trust-try-button" onClick={openLogin}>LET ME TRY NOW!</button></div><div className="trust-pipeline"><h3>Classic Hiring vs. New JobsMatchNow Process</h3><p>The first four steps of classic hiring happen in one connected step. Interviews, checks and offers stay the same.</p><div className="pipeline-rows">{trustPipeline.map((row) => { const max = Math.max(row.classic, row.jobsmatch) || 1; const deltaPct = row.classic ? Math.round(Math.abs(row.jobsmatch - row.classic) / row.classic * 100) : 0; return <Fragment key={row.label}><div className="pipeline-row"><span className="pipeline-row-label">{row.label}</span><div className="pipeline-bar-track classic"><i style={{ width: `${(row.classic / max) * 100}%` }} /><b>{row.classicDisplay || `${row.classic}${row.unit}`}</b></div><div className="pipeline-bar-track jobsmatch"><i style={{ width: `${(row.jobsmatch / max) * 100}%`, background: row.color }} /><b>{row.jobsmatchDisplay || `${row.jobsmatch}${row.unit}`}</b></div><span className="pipeline-delta" style={{ color: row.color }}>{row.deltaText || `${deltaPct}% better`}</span></div><p className="pipeline-feature-note">Powered by <b>{row.feature}</b> — {row.note}</p></Fragment>; })}<div className="pipeline-legend"><span><i className="classic" /> Classic hiring</span><span><i className="jobsmatch" /> JobsMatchNow</span></div></div>
        <div className="trust-detail">
          <h4>Traditional Hiring vs. JobsMatchNow Steps</h4>
          <div className="trust-detail-table-wrap">
            <table className="trust-detail-table colorful">
              <thead><tr><th className="trad-head">Traditional Hiring</th><th className="new-head">JobsMatchNow</th></tr></thead>
              <tbody>{traditionalSteps.map((step, i) => { const jm = jobsmatchNowSteps[i]; return <tr key={step} className={i === 0 ? 'combined-row' : undefined}><td className="step-cell"><div className="step-line"><span className="step-num trad">{i + 1}</span><span>{step}</span></div></td><td className="step-cell">{jm && <div className="step-line"><span className="step-num new">{i + 1}</span><span>{jm}{i === 0 && <b className="combo-badge">4-in-1 ⚡</b>}</span></div>}</td></tr>; })}</tbody>
            </table>
          </div>
        </div>
      </div></section>
    </>}
    <section className="section pricing-section" id="pricing">
      <div className="section-heading centered"><span className="eyebrow"><Sparkles size={14} /> Pricing</span><h2>Hire faster. Pay less than one agency placement.</h2></div>
      {/* Two sides of the marketplace, two visually separate panels. A candidate
          landing here should be able to tell in one glance which half is theirs
          — blue is free and always will be, pink is what recruiters pay. */}
      <section className="pricing-side pricing-candidates">
        <header>
          <h2 className="pricing-side-tag">For candidates</h2>
          <h3>Free forever</h3>
          <p>Everything below is free forever — the core never goes behind a paywall. We are paid by the companies doing the hiring. An optional Premium for candidates (3 target roles + your own AI chatbot, $10/month) starts with a free 7-day trial.</p>
        </header>
        <ul className="pricing-side-perks">
          <li><Check size={15} /> Full profile and resume</li>
          <li><Check size={15} /> Mutual-likes job matching</li>
          <li><Check size={15} /> Messaging with recruiters</li>
          <li><Check size={15} /> Interview scheduling</li>
          <li><Check size={15} /> Salary shown up front</li>
          <li><Check size={15} /> You control what employers see</li>
        </ul>
        <button type="button" className="pricing-side-cta" onClick={openRegister}>Get started free <ArrowRight size={17} /></button>
      </section>

      <section className="pricing-side pricing-recruiters">
        <header>
          <h2 className="pricing-side-tag">For recruiters</h2>
          <h3>Find the right people faster</h3>
          <p>Start free. Upgrade as your hiring grows. No fee per hire.</p>
        </header>
        {/* Recruiter pricing (founder design, 2026-11-22). Prices come from src/lib/plans.ts (synced with the server). */}
        <p className="plan-trial-banner"><Gift size={20} /> <b>{Math.round(TRIAL.days / 7)} weeks free</b> · Full features including AI</p>
        <div className="plan-grid four">
          <TrialCardView onStart={openRegister} />
          {HEADLINE_PLANS.map((key) => <PlanCardView key={key} plan={planCard(key)} onRegister={openRegister} />)}
        </div>
        <p className="plan-extra-note">Need more roles? <b>+${EXTRA_JOB_SLOT.usd} / month per extra live role</b>, on every plan.</p>
        <div className="plan-one-role">
          <span className="plan-one-icon"><BriefcaseBusiness size={20} /></span>
          <strong>Hiring for one role?</strong>
          <span>${SINGLE_POSTING.usd} once · 1 job for {SINGLE_POSTING.termDays} days · No subscription</span>
          <button type="button" className="primary-button" onClick={openRegister}>Get started</button>
        </div>
        <p className="plan-all-include"><b>All packages include candidate matching, messaging, scheduling, AI candidate insights and outreach drafts.</b><br />Job seekers use JobsMatchNow for free.</p>
        <p className="plan-footnote">
          Every posting runs {POSTING_TERM_DAYS} days and then pauses — renewing is free, one click, as often as you like.
          Annual billing charges {ANNUAL_MONTHS_CHARGED} months, so two are free.
          Boost any job to the top of the deck for {BOOST.hours} hours for ${BOOST.usd}; boosted cards are labelled <b>Promoted</b> and
          keep the exact match score they earned.
        </p>
      </section>

      <LaunchOffers onRegister={openRegister} />
    </section>
    {isPhone ? <WhatNowSection onRegister={openRegister} onLogin={openLogin} /> : <LatestShowcase onRegister={openRegister} onLogin={openLogin} />}
    <FeedbackSection />
    <footer><Brand /><span>Perfect matches should feel human.</span><button type="button" className="text-button footer-conduct-link" onClick={() => setConductOpen(true)}>Code of Conduct</button><a className="text-button footer-conduct-link" href="/privacy.html">Privacy</a><a className="text-button footer-conduct-link" href="/terms.html">Terms</a><a className="text-button footer-conduct-link" href="/delete-account.html">Delete account</a><a className="text-button footer-conduct-link" href="/legal.html">Legal notice &amp; copyright</a><small>© 2026 JobsMatchNow SARL. All rights reserved.</small></footer>
    {modals}
    <AnimatePresence>{conductOpen && <ConductModal onClose={() => setConductOpen(false)} />}</AnimatePresence>
  </main>;
}

/** True on phone widths (≤760px, same breakpoint as the phone CSS); follows rotation and window resizes. */
function usePhoneWidth() {
  const query = '(max-width: 760px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on); on();
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

function Feature({ icon: Icon, title, text }: { icon: typeof Target; title: string; text: string }) {
  return <article><div className="feature-icon"><Icon size={32} /></div><h3>{title}</h3><p>{text}</p></article>;
}

/** Admins get a dedicated, minimal shell — not the candidate/recruiter
 * Bootstrap dashboard (jobs/matches/swipes make no sense for an admin
 * account), just the billing moderation dashboard and a way to log out. */
function AdminWorkspace({ session, onExit }: { session: SessionUser; onExit: () => void }) {
  const [tab, setTab] = useState<'kpis' | 'queue' | 'analytics' | 'traffic' | 'integrations' | 'users' | 'jobs' | 'billing' | 'safety'>('kpis');
  const adminNav: { id: typeof tab; label: string; icon: typeof Inbox }[] = [
    { id: 'kpis', label: 'KPI dashboard', icon: Target },
    { id: 'queue', label: 'Action Queue', icon: Inbox },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'traffic', label: 'Traffic & heatmap', icon: Activity },
    { id: 'integrations', label: 'Integrations', icon: Layers3 },
    { id: 'users', label: 'Candidates & Recruiters', icon: Users },
    { id: 'jobs', label: 'Jobs', icon: BriefcaseBusiness },
    { id: 'billing', label: 'Billing & Subscriptions', icon: CreditCard },
    { id: 'safety', label: 'Safety & Support', icon: ShieldCheck },
  ];
  return <div className="admin-shell app-shell">
    <aside className="sidebar">
      <div className="sidebar-head"><Brand /></div>
      <nav className="sidebar-nav">{adminNav.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}><Icon size={19} /><span>{item.label}</span></button>; })}</nav>
      <div className="sidebar-bottom">
        <span className="admin-sidebar-name">Admin — {session.name}</span>
        <button onClick={onExit}><LogOut size={18} />Log out</button>
      </div>
    </aside>
    <div className="app-main admin-main">
    {/* Phones hide the sidebar, which held the admin menu and Log out (founder, 2026-11-22): a top bar brings both back. */}
    <div className="admin-phone-bar">
      <select aria-label="Admin section" value={tab} onChange={(event) => setTab(event.target.value as typeof tab)}>
        {adminNav.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <button type="button" className="admin-phone-logout" onClick={onExit}><LogOut size={16} /> Log out</button>
    </div>
    {tab === 'kpis' && <AdminKpisPage />}
    {tab === 'traffic' && <AdminTrafficPage />}
    {tab === 'integrations' && <AdminIntegrationsPage />}
    {tab === 'queue' && <AdminActionQueuePage />}
    {tab === 'analytics' && <AdminAnalyticsPage />}
    {tab === 'users' && <AdminUsersPage />}
    {tab === 'jobs' && <AdminJobsPage />}
    {tab === 'billing' && <AdminBillingPage />}
    {tab === 'safety' && <AdminSafetyPage />}
    </div>
  </div>;
}

function Workspace({ session, onSwitchUser, onExit }: { session: SessionUser; onSwitchUser: (user: SessionUser) => void; onExit: () => void }) {
  // Candidates open the app on "Find My Match" (desktop and mobile); recruiters on Home.
  const [view, setView] = useState<View>('match'); // both sides open on Find My Match
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  // Bug fix (founder, 2026-11-24): signing in swaps the landing page for the app in the same document, so the
  // browser kept the landing's scroll position and the app opened halfway down ("Recommended Roles") instead of
  // on the swipe card. Start at the top on sign-in, on every page change, and once the data has loaded. Anchor
  // links (Likes etc.) scroll afterwards, so they still land on their section.
  useEffect(() => { try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch { /* old browser */ } }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  useEffect(() => { if (!loading) window.scrollTo(0, 0); }, [loading]);
  const [error, setError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [editStep, setEditStep] = useState<number | null>(null);
  const [profileCard, setProfileCard] = useState(0);
  const [profileSaved, setProfileSaved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [conductOpen, setConductOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [jobImportOpen, setJobImportOpen] = useState(false);
  const [manualJobRequest, setManualJobRequest] = useState(0);
  // Candidates land on "Look for new Matches" (the top section of their home).
  const [activeAnchor, setActiveAnchor] = useState('');
  const [openMatchId, setOpenMatchId] = useState<string | undefined>(undefined);
  const openMessages = (matchId: string) => { setOpenMatchId(matchId); setView('messages'); };
  const [editJobId, setEditJobId] = useState<string | undefined>(undefined);
  const openJobEditor = (jobId: string) => { setEditJobId(jobId); setView('jobs'); };
  const role: Role = data?.viewer.role ?? session.role;
  const notifications = useMemo(() => {
    if (!data) return [] as NotificationItem[];
    const list: NotificationItem[] = [];
    for (const m of data.matches) {
      const who = role === 'candidate' ? (m.job?.company || 'A team') : (m.candidate?.name || 'A candidate');
      list.push({ id: `match-${m.id}`, kind: 'match', text: `It’s a match with ${who}`, at: m.createdAt, matchId: m.id });
      const thread = data.messages.filter((msg) => msg.matchId === m.id);
      const last = thread[thread.length - 1];
      if (last && last.senderId !== data.viewer.id) list.push({ id: `msg-${last.id}`, kind: 'msg', text: `New message from ${who}`, at: last.createdAt, matchId: m.id });
    }
    // The server's specific billing kind (trial_ending_7, job_credit_awarded, …)
    // is preserved rather than flattened to a generic 'billing', so each one can
    // carry its own icon and land on the screen it's actually about.
    for (const n of data.billingNotifications || []) {
      list.push({ id: `billing-${n.id}`, kind: 'billing', billingKind: n.kind, text: n.text, at: n.createdAt, jobId: n.jobId });
    }
    return list.sort((a, b) => b.at - a.at).slice(0, 8);
  }, [data, role]);

  useEffect(() => { trackView(`/app/${view}`); }, [view]);
  const load = () => { setLoading(true); setError(''); api.bootstrap(session.id).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(load, [session.id]);
  // VNPay redirects the browser back to /?billing=success|failed once the
  // recruiter finishes on VNPay's hosted page. That redirect is UX-only (the
  // IPN webhook is what actually confirmed the payment), so this just routes
  // to the billing page and refreshes data to reflect whatever the webhook
  // already did.
  const [vnpayResult, setVnpayResult] = useState<'success' | 'failed' | null>(null);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('billing');
    if (result !== 'success' && result !== 'failed') return;
    setVnpayResult(result);
    setView('billing');
    window.history.replaceState({}, '', window.location.pathname);
    if (result === 'success') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Demo convenience: jump between the flagship candidate and recruiter personas.
  const changeRole = (next: Role) => { api.login(`${next}-demo`).then(({ user }) => onSwitchUser(user)); };
  // "Try the demo" on a real account's empty deck: signs in to the flagship demo persona of the same role.
  const tryDemo = useMemo(() => (session.demo === true || !featureOn('tryDemo') ? null
    : async () => { const { user } = await api.login(`${role}-demo`); onSwitchUser(user); }), [session.demo, role, onSwitchUser]);
  // Same menu on every device (founder, 2026-11-22). The old `?fm=1` preview (used by the phone app's start URL)
  // no longer changes the menu: it used to add a second "Find My Match" and make phone and desktop differ.
  // New bar + Search & Filters (founder, 2026-11-24; preview ?filters=1): the meetings page is called "Interviews".
  const filtersOn = featureOn('filters');
  const baseNav = role === 'candidate' ? candidateNav : employerNav;
  const nav = filtersOn ? baseNav.map((n) => (n.view === 'meetings' ? { ...n, label: 'Interviews', short: 'Interviews' } : n)) : baseNav;
  const [filterOpen, setFilterOpen] = useState(false);
  // The desktop action bar under the deck opens the same Filter sheet (founder, 2026-11-24).
  useEffect(() => { const open = () => setFilterOpen(true); window.addEventListener(OPEN_FILTERS_EVENT, open); return () => window.removeEventListener(OPEN_FILTERS_EVENT, open); }, []);
  // Full tour player: opens a page (and a conversation), closing any sheet or menu first.
  useEffect(() => {
    const go = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: View; matchId?: string; reload?: boolean }>).detail || {};
      setFilterOpen(false); setMobileNav(false); setEditStep(null); setActiveAnchor('');
      if (detail.reload) void api.bootstrap(session.id).then(setData).catch(() => undefined);
      if (detail.matchId) setOpenMatchId(detail.matchId);
      if (detail.view) setView(detail.view);
    };
    window.addEventListener(TOUR_VIEW_EVENT, go);
    return () => window.removeEventListener(TOUR_VIEW_EVENT, go);
  }, []);
  const [sharedFilters] = useSharedFilters(session.id, role);
  const filterCount = filtersOn ? activeFilterCount(sharedFilters) : 0;
  // Anchor items scroll to a home-dashboard section; view items open a page.
  const gotoNav = (item: NavItem) => {
    setMobileNav(false);
    if (item.anchor) {
      const wasHome = view === 'home';
      setView('home');
      setActiveAnchor(item.anchor);
      const anchor = item.anchor;
      setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), wasHome ? 0 : 160);
    } else {
      setActiveAnchor('');
      if (item.view) setView(item.view);
    }
  };
  const navActive = (item: NavItem) => item.anchor
    ? view === 'home' && activeAnchor === item.anchor
    : view === item.view && !(item.view === 'home' && activeAnchor);
  const initials = (session.name || '?').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  // Notification bell: in the top bar; with the phone top bar removed (?bar=1), next to "Swipe for role" instead.
  const phoneBarV2 = featureOn('bar');
  const bell = (where: string) => <div className={`notif-wrap${where ? ` ${where}` : ''}`}><button aria-label="Notifications" onClick={() => setNotifOpen((v) => !v)}><Bell size={19} />{notifications.length > 0 && <i />}</button>{notifOpen && <><button className="notif-scrim" aria-label="Close notifications" onClick={() => setNotifOpen(false)} /><div className="notif-dropdown"><header>Notifications</header>{notifications.length === 0 ? <p className="notif-empty">No notifications yet.</p> : notifications.map((n) => <button key={n.id} className="notif-item" onClick={() => { setNotifOpen(false); if (n.kind === 'billing') { if (n.jobId) openJobEditor(n.jobId); else if (n.billingKind && JOB_NOTIFICATION_KINDS.has(n.billingKind)) setView('jobs'); else setView('billing'); } else if (n.matchId) openMessages(n.matchId); }}><span className={`notif-icon ${n.kind}`}>{n.kind === 'match' ? <Heart size={14} fill="currentColor" /> : n.kind === 'billing' ? billingNotificationIcon(n.billingKind) : <MessageCircle size={14} />}</span><span className="notif-text">{n.text}<small>{timeAgo(n.at)}</small></span></button>)}</div></>}</div>;

  return <TryDemoContext.Provider value={tryDemo}><RoleBarExtra.Provider value={phoneBarV2 ? bell('fmm-bell') : null}><div className={`app-shell role-${role}${phoneBarV2 ? ' phone-bar-v2' : ''}`}>
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}><div className="sidebar-head"><Brand /><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X /></button></div>
      <div className="workspace-switch"><span>Profile</span><button onClick={() => { setView('profile'); setMobileNav(false); }}>{data?.viewer.photo ? <img className="avatar-mini" src={data.viewer.photo} alt="" /> : <div className="avatar-mini">{initials}</div>}<div><strong>{data?.viewer.name || session.name}</strong><small>{role === 'candidate' ? 'Candidate' : 'Recruiter'}</small></div><ArrowRight size={15} /></button></div>
      <nav className="sidebar-nav">{nav.map((item) => { const Icon = item.icon; return <button key={item.label} className={navActive(item) ? 'active' : ''} onClick={() => gotoNav(item)} style={{ ['--c' as string]: NAV_COLORS[item.label] || '#9fb3d9' }}><i className="nav-ico"><Icon size={18} /></i><span>{item.label}</span>{item.view === 'messages' && notifications.length > 0 && <em>{Math.min(notifications.length, 9)}</em>}</button>; })}</nav>
      <div className="sidebar-bottom"><button onClick={() => setRulesOpen(true)} style={{ ['--c' as string]: '#60a5fa' }}><i className="nav-ico"><ListChecks size={17} /></i>Recruitment process</button><button onClick={() => setConductOpen(true)} style={{ ['--c' as string]: '#34d399' }}><i className="nav-ico"><ShieldCheck size={17} /></i>Code of Conduct</button><button onClick={() => setSupportOpen(true)} style={{ ['--c' as string]: '#60a5fa' }}><i className="nav-ico"><CircleHelp size={17} /></i>Help center</button><button onClick={() => setSettingsOpen(true)} style={{ ['--c' as string]: '#c4b5fd' }}><i className="nav-ico"><Settings size={17} /></i>Settings</button><button className="logout-button" onClick={onExit} style={{ ['--c' as string]: '#fb7185' }}><i className="nav-ico"><LogOut size={17} /></i>Log out</button><p className="sidebar-legal">© 2026 JobsMatchNow SARL · <a href="/legal.html" target="_blank" rel="noopener">Legal notice</a></p></div>
    </aside>
    <AnimatePresence>{supportOpen && <SupportModal viewer={data?.viewer} onClose={() => setSupportOpen(false)} />}</AnimatePresence>
    <AnimatePresence>{conductOpen && <ConductModal onClose={() => setConductOpen(false)} />}</AnimatePresence>
    <AnimatePresence>{rulesOpen && <RecruitmentRulesModal onClose={() => setRulesOpen(false)} />}</AnimatePresence>
    {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <section className="app-main">{session.emailVerified === false && <div className="verify-banner"><span><ShieldCheck size={15} /> Verify your email to secure your account and unlock everything.</span><button onClick={() => setSettingsOpen(true)}>Verify now</button></div>}<header className="topbar"><button className="menu-button" onClick={() => setMobileNav(true)}><Menu /></button><div className="search-box"><Search size={17} /><input aria-label="Search" placeholder={role === 'candidate' ? 'Search jobs, companies, skills…' : 'Search talent, jobs, messages…'} onKeyDown={(event) => { if (event.key === 'Enter') setView('discover'); }} /><kbd><Command size={12} /> K</kbd></div><div className="topbar-actions">{bell('')}{data?.viewer.demo && <button className="role-chip" onClick={() => changeRole(role === 'candidate' ? 'employer' : 'candidate')}>{role === 'candidate' ? 'Recruiter view' : 'Candidate view'}<ChevronDown size={14} /></button>}</div></header>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} retry={load} /> : data && (
        (data.viewer.onboarding || editStep !== null)
          ? (data.viewer.role === 'candidate'
              ? <CandidateWizard viewer={data.viewer} initialStep={editStep ?? 0}
                  onDone={() => { setEditStep(null); setView('profile'); setProfileSaved(true); window.setTimeout(() => setProfileSaved(false), 2600); load(); }}
                  onCancel={data.viewer.onboarding ? undefined : () => setEditStep(null)} />
              : <RecruiterWizard viewer={data.viewer} initialStep={editStep ?? 0}
                  onDone={() => { setEditStep(null); setView('profile'); setProfileSaved(true); window.setTimeout(() => setProfileSaved(false), 2600); load(); }}
                  onCancel={data.viewer.onboarding ? undefined : () => setEditStep(null)} />)
          : <ViewRouter view={view} role={role} data={data} setData={setData} navigate={setView} onEditProfile={setEditStep} profileCard={profileCard} onProfileCardChange={setProfileCard} reload={load} onAddJobs={() => setJobImportOpen(true)} manualJobRequest={manualJobRequest} openMatchId={openMatchId} onOpenMessages={openMessages} editJobId={editJobId} onEditJob={openJobEditor} paymentResult={vnpayResult} onDismissResult={() => setVnpayResult(null)} />
      )}
    </section>
    {/* "Ask AI" floating button removed from every screen (founder, 2026-11-22). The feature (server + profile key
        card) stays; set ASK_AI_BUTTON = true to bring the button back. */}
    {ASK_AI_BUTTON && data && !data.viewer.onboarding && (role === 'candidate' || role === 'employer') && <AskAi role={role} hideFabOnPhone={view === 'match'} />}
    {profileSaved && <div className="profile-saved-toast" role="status"><Check size={15} /> Profile updated. Recruiter view refreshed.</div>}
    {jobImportOpen && data && <JobImportModal viewer={data.viewer} onClose={() => setJobImportOpen(false)} onImported={() => { setJobImportOpen(false); setView('jobs'); load(); }} onManual={() => { setJobImportOpen(false); setView('jobs'); setManualJobRequest((value) => value + 1); }} />}
    {/* Phone action bar + Global Menu (founder, 2026-11-22), job seekers and recruiters: configurable, saved per person. */}
    <MobileTabs role={role} userId={session.id} nav={nav} navColors={NAV_COLORS} view={view} activeAnchor={activeAnchor} unread={notifications.length} likes={data ? likesWaiting(data) : 0} gotoNav={gotoNav} setView={setView} openFullMenu={() => setMobileNav(true)}
      filtersOn={filtersOn} onFilter={() => setFilterOpen(true)} filterCount={filterCount} filterOpen={filterOpen} onLogout={onExit} />
    {filtersOn && filterOpen && data && <SearchFiltersSheet role={role} data={data} onClose={() => setFilterOpen(false)} onShow={() => { setFilterOpen(false); setView('match'); }} />}
    <AnimatePresence>{settingsOpen && <SettingsModal user={session} onClose={() => setSettingsOpen(false)} onDeleted={() => { setSettingsOpen(false); onExit(); }} />}</AnimatePresence>
  </div></RoleBarExtra.Provider></TryDemoContext.Provider>;
}

function ViewRouter({ view, role, data, setData, navigate, onEditProfile, profileCard, onProfileCardChange, reload, onAddJobs, manualJobRequest, openMatchId, onOpenMessages, editJobId, onEditJob, paymentResult, onDismissResult }: { view: View; role: Role; data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void; onEditProfile: (step: number) => void; profileCard: number; onProfileCardChange: (card: number) => void; reload: () => void; onAddJobs: () => void; manualJobRequest: number; openMatchId?: string; onOpenMessages: (matchId: string) => void; editJobId?: string; onEditJob: (jobId: string) => void; paymentResult?: 'success' | 'failed' | null; onDismissResult?: () => void }) {
  if (view === 'home') return role === 'candidate'
    ? <CandidateHome key={data.viewer.activeVariantId || 'base'} data={data} setData={setData} navigate={navigate} onEditProfile={onEditProfile} onOpenMessages={onOpenMessages} />
    : <RecruiterHome data={data} setData={setData} navigate={navigate} onEditProfile={onEditProfile} onAddJobs={onAddJobs} onOpenMessages={onOpenMessages} onEditJob={onEditJob} />;
  if (view === 'discover') return <Discover role={role} data={data} setData={setData} navigate={navigate} onEditProfile={onEditProfile} />;
  if (view === 'companies') return <Companies data={data} navigate={navigate} />;
  if (view === 'pipeline') return <Pipeline data={data} setData={setData} />;
  if (view === 'messages') return <Messages role={role} data={data} setData={setData} initialMatchId={openMatchId} />;
  if (view === 'meetings') return <Meetings role={role} data={data} setData={setData} onOpenMessages={onOpenMessages} />;
  if (view === 'saved') return <Saved role={role} data={data} setData={setData} navigate={navigate} />;
  if (view === 'analytics') return <Analytics role={role} data={data} />;
  if (view === 'jobs') return <Jobs data={data} reload={reload} onAddJobs={onAddJobs} manualJobRequest={manualJobRequest} onOpenMessages={onOpenMessages} editJobId={editJobId} />;
  if (view === 'matches') return <Matches data={data} navigate={navigate} onOpenMessages={onOpenMessages} />;
  // One Find My Match page on every device (role dropdown + swipe deck); the old ?fm=1 studio is retired.
  if (view === 'match') return <main className="td-dashboard td-candidate td-match-page"><FindMyMatchPage data={data} setData={setData} navigate={navigate} onOpenMessages={onOpenMessages} /></main>;
  if (view === 'assistant') return <ChatbotPage data={data} navigate={navigate} />;
  if (view === 'feedback') return <FeedbackPage data={data} />;
  if (view === 'stages') return <HiringStages data={data} setData={setData} onOpenMessages={onOpenMessages} />;
  if (view === 'selected') return <SelectedCandidates data={data} setData={setData} onOpenMessages={onOpenMessages} />;
  if (view === 'coffee') return <CoffeeInvitations data={data} onOpenMessages={onOpenMessages} />;
  if (view === 'hired') return <HiredResults data={data} onOpenMessages={onOpenMessages} />;
  if (view === 'prep') return <InterviewPreparation data={data} navigate={navigate} />;
  if (view === 'billing' && role === 'candidate') return <CandidateSubscription data={data} navigate={navigate} />;
  if (view === 'billing') return <BillingPage data={data} setData={setData} paymentResult={paymentResult} onDismissResult={onDismissResult} />;
  if (role === 'candidate') return <CandidateProfilePage
    viewer={data.viewer} jobs={data.jobs} onEdit={onEditProfile} initialCard={profileCard} onCardChange={onProfileCardChange}
    matches={data.matches} onViewerSaved={(viewer) => setData({ ...data, viewer })} onOpenMessages={onOpenMessages} onReload={() => { void api.bootstrap(data.viewer.id).then(setData).catch(() => undefined); }}
    onDeleteProfile={data.viewer.activeVariantId ? async () => { await api.deleteProfileVariant(data.viewer.activeVariantId!, data.viewer.id); reload(); navigate('home'); } : undefined}
  />;
  return <RecruiterProfilePage viewer={data.viewer} onEdit={onEditProfile} onViewerSaved={(viewer) => setData({ ...data, viewer })} />;
}

/** Item 18: pre-swipe readiness checklist for candidates, with fix links into the wizard. */
function ReadyChecklist({ viewer, onEditProfile }: { viewer: Person; onEditProfile: (step: number) => void }) {
  const items = [
    { label: 'Resume uploaded', done: Boolean(viewer.documents?.resume), step: 1 },
    { label: 'Salary expectation set', done: viewer.preferences?.salary?.min !== undefined, step: 2 },
    { label: 'Profile at least 90% complete', done: (viewer.completeness ?? 0) >= 90, step: 0 },
  ];
  if (items.every((item) => item.done)) return null;
  return <div className="ready-checklist">
    <strong><ShieldCheck size={15} /> Am I ready to swipe?</strong>
    <div className="ready-items">
      {items.map((item) => <span key={item.label} className={item.done ? 'ready-item done' : 'ready-item'}>
        {item.done ? <Check size={12} /> : <X size={12} />}{item.label}
        {!item.done && <button onClick={() => onEditProfile(item.step)}>Fix</button>}
      </span>)}
    </div>
  </div>;
}

function Discover({ role, data, setData, navigate, onEditProfile }: { role: Role; data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void; onEditProfile: (step: number) => void }) {
  const { deck, index, setIndex, current, next, busy, match, setMatch, screeningFor, setScreeningFor, commitSwipe, act, undo, radius, setRadius, query, setQuery, filterMode, setFilterMode, filterType, setFilterType, minScore, setMinScore, filtersActive } = useDiscoverDeck(role, data, setData);
  const [resumeFor, setResumeFor] = useState<Person | null>(null);
  const [jobDetail, setJobDetail] = useState<Job | null>(null);
  const matchedCandidateIds = useMemo(() => new Set(data.matches.map((item) => item.candidateId)), [data.matches]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scoreOptions = role === 'employer' ? [0, 50, 70, 80] : [0, 50, 70, 85];
  // Item 10: after a gap skill is added, re-bootstrap so every fit score recalculates live.
  const refreshScores = () => api.bootstrap(data.viewer.id).then(setData).catch(() => undefined);
  const [asking, setAsking] = useState(false);
  const toggleBookmark = async (target: Job | Person) => {
    const targetType = role === 'candidate' ? 'job' : 'candidate';
    const { bookmarked } = await api.toggleBookmark({ userId: data.viewer.id, targetId: target.id, targetType });
    setData({ ...data, bookmarkedIds: bookmarked ? [...data.bookmarkedIds, target.id] : data.bookmarkedIds.filter((id) => id !== target.id) });
  };
  const askThenLike = (text: string) => {
    if (!current) return;
    setAsking(false);
    void commitSwipe('like', current, { answers: [{ question: 'A quick question before we match', answer: text }] });
  };

  return <div className="page discover-page"><div className="page-title"><div><span className="overline">{role === 'candidate' ? 'For Candidates' : 'For Recruiters'}</span><h1>{role === 'candidate' ? 'Recommended Roles' : 'Candidates to be considered'}</h1><p>{role === 'candidate' ? 'Swipe roles that fit you — like to signal interest.' : 'Find the perfect talent for your team.'}</p></div>
    <div className="preference-chip"><small>{role === 'candidate' ? 'Your preferences' : "You're hiring for"}</small><strong>{role === 'candidate' ? [data.viewer.preferences?.desiredRoles?.[0], data.viewer.preferences?.workMode?.mode].filter(Boolean).join(' · ') || 'Any role' : data.jobs.find((j) => j.employerId === data.viewer.id)?.title || 'Open roles'}</strong><button onClick={() => role === 'candidate' ? onEditProfile(2) : navigate('jobs')} aria-label="Edit preferences"><ChevronDown size={13} style={{ transform: 'rotate(-90deg)' }} /></button></div>
    <div className="title-actions"><button className={filtersOpen ? 'ghost-button active' : 'ghost-button'} onClick={() => setFiltersOpen((v) => !v)}><SlidersHorizontal size={17} />Filters{filtersActive && <span>{[query.trim(), filterMode, filterType, minScore > 0].filter(Boolean).length}</span>}</button></div></div>
    {role === 'candidate' && <ReadyChecklist viewer={data.viewer} onEditProfile={onEditProfile} />}
    <div className="discover-search"><div className="ds-input"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={role === 'candidate' ? 'Search roles, companies, skills…' : 'Search talent by name, title, skills…'} aria-label="Search" />{query && <button className="ds-clear" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</div></div>
    {filtersOpen && featureOn('filters') && <div className="discover-filters df-shared">
      {/* Same filters as the phone "Filter" sheet (shared, saved per person); distance stays in the slider above. */}
      <FilterFields role={role} data={data} hideDistance hideSearch />
      {filtersActive && <button className="df-clear" onClick={() => resetSharedFilters(data.viewer.id, role)}>Clear all</button>}
    </div>}
    {filtersOpen && !featureOn('filters') && <div className="discover-filters">
      <div className="df-group"><label>Minimum fit</label><div className="df-scores">{scoreOptions.map((s) => <button key={s} className={minScore === s ? 'active' : ''} onClick={() => setMinScore(s)}>{s === 0 ? 'Any' : `${s}%+`}</button>)}</div></div>
      {role === 'candidate' && <>
        <div className="df-group"><label>Work mode</label><div className="df-chips">{['Remote', 'Hybrid', 'On-site', 'Flexible'].map((m) => <button key={m} className={filterMode === m ? 'active' : ''} onClick={() => setFilterMode(filterMode === m ? '' : m)}>{m}</button>)}</div></div>
        <div className="df-group"><label>Type</label><div className="df-chips">{['Full-time', 'Part-time', 'Contract', 'Freelance'].map((t) => <button key={t} className={filterType === t ? 'active' : ''} onClick={() => setFilterType(filterType === t ? '' : t)}>{t}</button>)}</div></div>
      </>}
      {filtersActive && <button className="df-clear" onClick={() => { setQuery(''); setFilterMode(''); setFilterType(''); setMinScore(0); }}>Clear all</button>}
    </div>}
    <section className="geo-control" aria-label="Geolocation of Opportunities"><div><MapPin size={18} /><span><small>Geolocation of Opportunities</small><strong>{role === 'candidate' ? 'Roles' : 'Candidates'} {radius >= 100 ? 'at any distance' : `within ${radius} km`}</strong></span></div><input aria-label="Maximum match distance in kilometres" type="range" min="5" max="100" step="5" value={radius} onChange={(event) => setRadius(Number(event.target.value))} /><p>City-level matching only. Exact locations stay private.</p></section>
    <div className="discover-layout"><section className="deck-area">
      <div className="deck-progress-row">
        <div className="deck-progress" role="progressbar" aria-valuenow={Math.min(index + 1, deck.length)} aria-valuemin={1} aria-valuemax={deck.length || 1}><i style={{ width: deck.length ? `${(Math.min(index + 1, deck.length) / deck.length) * 100}%` : '0%' }} /></div>
        <small>{Math.min(index + 1, deck.length)} / {deck.length}</small>
        <button className="undo-action" onClick={undo} disabled={busy || index === 0} aria-label="Undo last swipe" title="Rewind last swipe"><RotateCcw size={15} /></button>
      </div>
      <div className="card-stack">{next && <div className="stack-card"><CardSummary item={next} role={role} /></div>}{current ? <SwipeCard key={current.id} item={current} role={role} resumeUnlocked={role === 'employer' && matchedCandidateIds.has(current.id)} /> : <EmptyDeck role={role} onReset={() => setIndex(0)} />}</div>
      {current && <div className="action-row five"><button onClick={() => act('pass')} disabled={busy} className="pass-action" aria-label="Pass"><X /></button><button onClick={() => act('like', true)} disabled={busy} className="superlike-action" aria-label="Super Like" title="Super Like — a stronger signal"><Star fill="currentColor" /></button><button onClick={() => setAsking(true)} disabled={busy} className="ask-action" aria-label="Ask" title="Ask a quick question"><MessageCircleQuestion /></button><button onClick={() => toggleBookmark(current)} disabled={busy} className={data.bookmarkedIds.includes(current.id) ? 'save-action active' : 'save-action'} aria-label="Save for later" title="Save for later"><BookmarkIcon fill={data.bookmarkedIds.includes(current.id) ? 'currentColor' : 'none'} /></button><button onClick={() => act('like')} disabled={busy} className="like-action" aria-label="Like"><Heart fill="currentColor" /></button></div>}
      <div className="keyboard-hint"><span><kbd>←</kbd> Pass</span><span>Swipe left or right</span><span><kbd>→</kbd> Like</span></div>
    </section><aside className="insight-panel"><div className="daily-card"><div><span>Today’s activity</span><strong>{data.likesRemaining}</strong><small>likes remaining</small></div><div className="ring" style={{ '--progress': `${data.likesRemaining * 2}%` } as React.CSSProperties}><Heart size={18} /></div></div><div className="tip-card"><div className="tip-icon"><Zap size={17} /></div><strong>{role === 'candidate' ? 'Complete your preferences' : 'Calibrate your search'}</strong><p>{role === 'candidate' ? 'Add your preferred team size to improve recommendations.' : 'Review five profiles to help JobsMatchNow learn what great looks like for this role.'}</p><button>{role === 'candidate' ? 'Update preferences' : 'View calibration'} <ArrowRight size={14} /></button></div><div className="quality-card"><div className="quality-head"><span>Match quality</span><strong>Excellent</strong></div><div className="quality-bar"><i /></div><p>Your recommendations use 12 verified profile signals.</p></div></aside></div>
    <AnimatePresence>{match && <MatchModal match={match} viewer={data.viewer} onClose={() => setMatch(null)} onMessage={() => { setMatch(null); navigate('messages'); }} />}</AnimatePresence>
    <AnimatePresence>{resumeFor && <Suspense fallback={null}><ResumeViewerModal person={resumeFor} viewerId={data.viewer.id} onClose={() => setResumeFor(null)} /></Suspense>}</AnimatePresence>
    <AnimatePresence>{jobDetail && <JobDetailModal job={jobDetail} onClose={() => setJobDetail(null)} />}</AnimatePresence>
    <AnimatePresence>{screeningFor && <ScreeningModal job={screeningFor} onCancel={() => setScreeningFor(null)} onSubmit={(answers) => { const target = screeningFor; setScreeningFor(null); void commitSwipe('like', target, { answers }); }} />}</AnimatePresence>
    <AnimatePresence>{asking && current && <motion.div className="modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAsking(false)}>
      <motion.div className="ask-modal" initial={{ y: 20, scale: .97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, scale: .97 }} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setAsking(false)} aria-label="Close"><X /></button>
        <h3>Ask a quick question</h3>
        <p>Picking one sends a like along with your question — it'll show up if you match.</p>
        {role === 'employer' ? <RecruiterStarters candidateName={(current as Person).name} archetype={(current as Person).aboutMeArchetype} onPick={askThenLike} /> : <CandidateStarters onPick={askThenLike} />}
      </motion.div>
    </motion.div>}</AnimatePresence></div>;
}

function SwipeCard({ item, role, resumeUnlocked }: { item: Job | Person; role: Role; resumeUnlocked?: boolean }) {
  // Both sides show the same 5-card deck for the item being reviewed — recruiters
  // browse the candidate's deck, candidates browse the role's deck (Snapshot /
  // Requirements / Compensation / Team & culture / Reviews). Like / Pass / Super
  // Like / Ask / Save all happen via the action buttons below the deck.
  if (role === 'employer') return <motion.article className="swipe-card canonical-candidate-card">
    <CandidateCards person={item as Person} match={item.match} unlocked={resumeUnlocked} />
  </motion.article>;
  return <motion.article className="swipe-card canonical-job-card">
    <JobCards job={item as Job} />
  </motion.article>;
}

/** Item 14: straight-line distance → motorbike commute estimate (~30 km/h city average). */
function motorbikeMinutes(distanceKm: number) { return Math.max(3, Math.round(distanceKm * 2)); }

/** Human label for a job's work mode, including remote scope / hybrid radius. */
function workModeLabel(job: Job) {
  if (job.workMode === 'Remote') return job.remoteScope === 'country' ? `Remote · within ${job.country || 'country'}` : 'Remote · Worldwide';
  if (job.workMode === 'Hybrid') return job.hiringRadiusKm ? `Hybrid · within ${job.hiringRadiusKm} km` : 'Hybrid';
  return job.workMode; // On-site, Flexible
}
/** Back of the flip card: per-factor score breakdown with evidence lines. */
function FitBreakdown({ item, role, onBack }: { item: Job | Person; role: Role; onBack: () => void }) {
  const match = item.match;
  const title = role === 'candidate' ? (item as Job).title : (item as Person).name;
  return <div className="fit-breakdown" onPointerDownCapture={(event) => event.stopPropagation()}>
    <header>
      <div><span className="overline">Why this match</span><h2>{match?.score}% fit · {title}</h2></div>
      <button className="modal-close" onClick={onBack} aria-label="Back to card"><RotateCcw size={16} /></button>
    </header>
    <div className="fit-factors">
      {(match?.breakdown || []).map((factor) => <div className="fit-factor" key={factor.factor}>
        <div className="fit-factor-head"><strong>{factor.label}</strong><span>{Math.round(factor.score * 100)}%</span></div>
        <div className="fit-factor-bar"><i style={{ width: `${Math.round(factor.score * 100)}%` }} /></div>
        <p>{factor.evidence}</p>
      </div>)}
    </div>
    {match && match.matchedSkills.length > 0 && <div className="card-section"><span className="card-label">Matched skills</span><div className="skill-list">{match.matchedSkills.map((skill) => <span key={skill}><Check size={12} />{skill}</span>)}</div></div>}
  </div>;
}

function ResumeChip({ person, unlocked, onOpen }: { person: Person; unlocked: boolean; onOpen: (person: Person) => void }) {
  const resume = person.documents?.resume;
  if (!resume) return null;
  return <button type="button" className="resume-chip" onPointerDownCapture={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen(person); }}>
    {resume.thumbName ? <img className={unlocked ? 'resume-chip-thumb' : 'resume-chip-thumb blurred'} src={`${apiBase}/api/users/${person.id}/resume/thumbnail`} alt="" /> : <span className="resume-chip-icon"><FileText size={15} /></span>}
    <span className="resume-chip-text"><strong>Resume</strong><small>{unlocked ? 'Full access' : 'Anonymized preview'}</small></span>
    {!unlocked && <Lock size={12} />}
  </button>;
}

/** Age from an ISO birthdate, or undefined — pre-match privacy rule (public or explicitly disclosed only). */
function ageFrom(person: Person): number | undefined {
  if (!person.birthdate || (person.agePrivacy !== 'public' && !person.discloseAge)) return undefined;
  const born = new Date(person.birthdate);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
  return age >= 14 && age <= 100 ? age : undefined;
}

function BookmarkButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return <button type="button" className={active ? 'bookmark-toggle active' : 'bookmark-toggle'} onPointerDownCapture={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={active ? 'Remove from saved' : 'Save for later'} aria-pressed={active}>
    <BookmarkIcon size={15} fill={active ? 'currentColor' : 'none'} />
  </button>;
}

function CardSummary({ item, role, detailed = false, onOpenResume, resumeUnlocked = false, onOpenJob, gapViewer, onSkillAdded, bookmarked, onToggleBookmark }: { item: Job | Person; role: Role; detailed?: boolean; onOpenResume?: (person: Person) => void; resumeUnlocked?: boolean; onOpenJob?: (job: Job) => void; gapViewer?: Person; onSkillAdded?: () => void; bookmarked?: boolean; onToggleBookmark?: () => void }) {
  if (role === 'candidate') {
    const job = item as Job;
    const missing = job.match?.missingSkills?.length ?? 0;
    const matched = job.match?.matchedSkills?.length ?? 0;
    const topSkills = job.requiredSkills.slice(0, 4);
    const moreSkills = job.requiredSkills.length - topSkills.length;
    return <>
      <JobHeaderBadge job={job} className="swipe-job-header" actions={<>{onToggleBookmark && <BookmarkButton active={Boolean(bookmarked)} onToggle={onToggleBookmark} />}{job.demo && <span className="demo-badge">Demo</span>}</>} />
      <div className="card-body">
        <div className="job-meta"><span><BriefcaseBusiness size={15} />{job.type}</span>{job.salaryHidden ? <SalaryBadge status={job.match?.salaryStatus} /> : <span>{job.salary}</span>}{job.status?.toLowerCase() === 'active' && <span className="hiring-pill"><i />Actively hiring</span>}</div>
        <div className="job-meta soft"><span>{job.experienceLevel} exp</span>{job.responseTime && <span>{job.responseTime} response</span>}</div>
        {detailed && <>
          <div className="card-quote"><Sparkles size={15} /><div><span className="card-label">About the role</span><p>{job.description}</p></div></div>
          <span className="card-label">Top skills</span>
          <div className="skill-list">{topSkills.map((skill) => <span key={skill}>{skill}</span>)}{moreSkills > 0 && <span className="skill-more">+{moreSkills}</span>}</div>
          {job.benefits?.length ? <><span className="card-label">Why you might love this</span><div className="skill-list soft">{job.benefits.slice(0, 4).map((b) => <span key={b}>{b}</span>)}</div></> : null}
          <div className="match-count-line">{matched} matching skill{matched === 1 ? '' : 's'}{missing > 0 ? ` · ${missing} missing` : ''}</div>
          {gapViewer && onSkillAdded && <GapCoach job={job} viewer={gapViewer} onSkillAdded={onSkillAdded} />}
          <div className="card-foot"><div><strong>{job.mission}</strong><small>{job.culture.join(' · ')}</small></div><button onPointerDownCapture={(event) => event.stopPropagation()} onClick={() => onOpenJob?.(job)}>Job details <ArrowRight size={14} /></button></div>
        </>}
      </div>
    </>;
  }
  const person = item as Person;
  const age = ageFrom(person);
  const languages = person.languageDetail?.length ? person.languageDetail : (person.languages || []).map((name) => ({ name, level: '' }));
  const topSkills = person.skills.slice(0, 4);
  const moreSkills = person.skills.length - topSkills.length;
  const matched = person.match?.matchedSkills?.length ?? 0;
  const missing = person.match?.missingSkills?.length ?? 0;
  const salary = person.preferences?.salary;
  const wm = person.preferences?.workMode;
  return <>
    <div className="card-hero" style={{ backgroundImage: `linear-gradient(transparent 38%, rgba(0,0,0,.82)), url(${person.photo})` }}>
      <div className="card-hero-top"><div className="fit-badge"><span>{person.match?.score}%</span> match</div>{person.promoted && <span className="promoted-badge">Promoted</span>}{onToggleBookmark && <BookmarkButton active={Boolean(bookmarked)} onToggle={onToggleBookmark} />}</div>
      <div className="card-hero-overlay">
        {person.availability && <span className="avail-pill"><i />Available {person.availability}</span>}
        <h2>{person.name}{age !== undefined && <span className="card-age">{age}</span>}{person.verified && <BadgeCheck size={18} className="verified-mark" />}{person.demo && <span className="demo-badge">Demo</span>}</h2>
        <p className="card-hero-sub">{person.title}</p>
        <div className="card-hero-meta"><span><MapPin size={14} />{person.location}</span>{person.distanceKm !== undefined && <span className="distance-badge">{person.distanceKm} km away</span>}</div>
        {languages.length > 0 && <div className="card-hero-langs">{languages.map((l) => <span key={l.name}>{l.name}{l.level ? ` (${l.level})` : ''}</span>)}</div>}
      </div>
    </div>
    <div className="card-body">
      <div className="skill-list">{topSkills.map((skill) => <span key={skill}>{skill}</span>)}{moreSkills > 0 && <span className="skill-more">+{moreSkills}</span>}</div>
      {person.presentation && <div className="card-quote"><Heart size={15} /><div><span className="card-label">About {person.name.split(' ')[0]}</span><p>{person.presentation}</p></div></div>}
      <div className="stat-grid">
        {person.yearsExperience !== undefined && <div><small>Exp</small><strong>{person.yearsExperience}+ years</strong></div>}
        {salary?.min !== undefined && !person.salaryHidden && <div><small>Salary</small><strong>{salary.min.toLocaleString()}–{salary.max?.toLocaleString()} {salary.currency}</strong></div>}
        {wm?.mode && <div><small>Work mode</small><strong>{wm.mode === 'hybrid' ? `Hybrid · ${wm.hybridDays ?? 2}d` : wm.mode === 'onsite' ? 'On-site' : 'Remote'}</strong></div>}
        {person.distanceRangeKm !== undefined && <div><small>Commute</small><strong>&lt; {person.distanceRangeKm} km</strong></div>}
      </div>
      {detailed && <>
        {(matched > 0 || missing > 0) && <div className="match-count-line">{matched} matching skill{matched === 1 ? '' : 's'}{missing > 0 ? ` · ${missing} missing` : ''}</div>}
        {onOpenResume && <ResumeChip person={person} unlocked={resumeUnlocked} onOpen={onOpenResume} />}
      </>}
    </div>
  </>;
}

function Pipeline({ data, setData }: { data: Bootstrap; setData: (d: Bootstrap) => void }) {
  const stages = ['Matched', 'Screen', 'Interview', 'Offer'];
  const [detail, setDetail] = useState<JobMatch | null>(null);
  const [nudged, setNudged] = useState<Set<string>>(() => new Set());
  const move = async (match: JobMatch, stage: string) => { await api.updateStage(match.id, stage); setData({ ...data, matches: data.matches.map((item) => item.id === match.id ? { ...item, stage, stageChangedAt: Date.now() } : item) }); };
  // Item 17: flag matches idle >5 days in a stage; one tap sends a templated follow-up.
  const idleDays = (match: JobMatch) => Math.floor((Date.now() - (match.stageChangedAt ?? match.createdAt)) / 86400000);
  const nudge = async (match: JobMatch) => {
    const first = match.candidate?.name?.split(' ')[0] || 'there';
    const text = `Hi ${first} — just checking in. We're still excited about your profile for ${match.job?.title || 'the role'}. Would a quick chat this week work for you?`;
    const message = await api.message({ matchId: match.id, senderId: data.viewer.id, text });
    setData({ ...data, messages: [...data.messages, message] });
    setNudged((current) => new Set(current).add(match.id));
  };
  // Summary from this team's real matches only.
  const inStage = (stage: string) => data.matches.filter((m) => m.stage === stage).length;
  const total = data.matches.length;
  const interviewRate = total ? Math.round(((inStage('Interview') + inStage('Offer')) / total) * 100) : 0;
  const weekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = data.matches.filter((m) => m.createdAt >= weekAgo).length;
  return <div className="page"><div className="page-title"><div><span className="overline">Your roles</span><h1>Hiring pipeline</h1><p>Move mutual matches from first hello to signed offer.</p></div><div className="title-actions"><button className="ghost-button"><Users size={17} />Share</button><button className="primary-button small">Add candidate</button></div></div><div className="pipeline-summary"><Metric label="Active candidates" value={String(total)} change={`+${newThisWeek} this week`} /><Metric label="In screening" value={String(inStage('Screen'))} change="Screen stage" /><Metric label="Interview rate" value={`${interviewRate}%`} change="Interview & offer" /><Metric label="Offers" value={String(inStage('Offer'))} change="Offer stage" /></div><div className="pipeline-board">{stages.map((stage, stageIndex) => <section key={stage} className="pipeline-column"><header><span>{stage}</span><em>{data.matches.filter((m) => m.stage === stage).length}</em><button><MoreHorizontal /></button></header><div>{data.matches.filter((m) => m.stage === stage).map((match) => <article className="candidate-tile" key={match.id}><button className="candidate-head tile-open" onClick={() => setDetail(match)} title="Screening answers & interview kit"><img src={match.candidate?.photo} /><div><strong>{match.candidate?.name}</strong><small>{match.candidate?.title}</small></div><span>{match.candidate?.match?.score != null ? `${match.candidate.match.score}%` : '–'}</span></button><div className="tile-skills">{match.candidate?.skills?.slice(0, 2).map((skill) => <span key={skill}>{skill}</span>)}{match.screeningAnswers?.length ? <span className="tile-screening">✓ screening</span> : null}</div>{idleDays(match) > 5 && !nudged.has(match.id) && <div className="tile-nudge"><span><Clock3 size={11} /> Idle {idleDays(match)}d in {stage}</span><button onClick={() => nudge(match)}>Send follow-up</button></div>}{nudged.has(match.id) && <div className="tile-nudge sent"><Check size={11} /> Follow-up sent</div>}<div className="tile-foot"><span><Clock3 size={13} />{`Updated ${idleDays(match) === 0 ? 'today' : `${idleDays(match)}d ago`}`}</span>{stageIndex < stages.length - 1 && <button onClick={() => move(match, stages[stageIndex + 1])} aria-label={`Move to ${stages[stageIndex + 1]}`}><ArrowRight size={15} /></button>}</div></article>)}<button className="add-tile">+ Add candidate</button></div></section>)}</div>
    <AnimatePresence>{detail && <MatchDetailModal match={detail} onClose={() => setDetail(null)} />}</AnimatePresence></div>;
}

function Messages({ role, data, setData, initialMatchId }: { role: Role; data: Bootstrap; setData: (d: Bootstrap) => void; initialMatchId?: string }) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | undefined>(initialMatchId);
  useEffect(() => { if (initialMatchId) setSelectedMatchId(initialMatchId); }, [initialMatchId]);
  const match = data.matches.find((m) => m.id === selectedMatchId) || data.matches[0];
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const thread = data.messages.filter((m) => m.matchId === match?.id);
  // Chat box always reachable (founder, 2026-11-24): picking a starter fills the box, closes the panel and
  // focuses the box; the conversation follows the newest message.
  const composerRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = bodyRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thread.length, match?.id, typing]);
  // The person on the other side of this chat: for a candidate that's the employer/job, for an employer it's the candidate.
  const otherName = role === 'candidate' ? match?.job?.company : match?.candidate?.name;
  const otherPhoto = role === 'candidate' ? undefined : match?.candidate?.photo;
  const otherEmail = role === 'candidate' ? match?.employer?.email : match?.candidate?.email;
  // Demo accounts answer back: the reply comes with the sent message and shows after a short "typing…".
  const latest = useRef(data); latest.current = data;
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!text.trim() || !match) return;
    const sent = text; setText('');
    const { reply, ...message } = await api.message({ matchId: match.id, senderId: data.viewer.id, text: sent });
    setData({ ...data, messages: [...data.messages, message] });
    if (reply) {
      setTyping(true);
      window.setTimeout(() => { setTyping(false); const now = latest.current; if (!now.messages.some((m) => m.id === reply.id)) setData({ ...now, messages: [...now.messages, reply] }); }, 1400);
    }
  };
  // Auto-open when the thread is empty (nothing to say yet); stays reachable via the header
  // toggle afterward so the same questions double as prep notes before a scheduled call.
  const [showStarters, setShowStarters] = useState(thread.length === 0);
  const pickStarter = (value: string) => {
    setText(value); setShowStarters(false);
    window.setTimeout(() => { composerRef.current?.focus(); composerRef.current?.scrollIntoView({ block: 'nearest' }); }, 30);
  };
  useEffect(() => { setShowStarters(thread.length === 0); }, [match?.id]);
  const [scheduling, setScheduling] = useState(false);
  const [viewingProfile, setViewingProfile] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [conductOpen, setConductOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [actionSent, setActionSent] = useState('');
  const [schedulingCoffee, setSchedulingCoffee] = useState(false);
  // One click: propose tomorrow at the next half-hour, persist it (shows in
  // this thread + Meetings for both sides), and open a pre-filled Google
  // Calendar quick-add so it lands on the real calendar too.
  const quickCoffee = async () => {
    if (!match || schedulingCoffee) return;
    setSchedulingCoffee(true);
    try {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setSeconds(0, 0);
      if (start.getMinutes() > 30) { start.setHours(start.getHours() + 1); start.setMinutes(0); }
      else if (start.getMinutes() > 0) start.setMinutes(30);
      const title = `Coffee chat${otherName ? ` — ${otherName}` : ''}`;
      const call = await api.scheduleCall({ matchId: match.id, createdBy: data.viewer.id, title, startAt: start.getTime(), durationMinutes: 25 });
      setData({ ...data, calls: [...data.calls, call] });
      window.open(googleCalendarUrl({ title, startAt: call.startAt, durationMinutes: call.durationMinutes }), '_blank', 'noopener');
    } catch (e) { alert(e instanceof Error ? e.message : 'Could not create that invite'); }
    finally { setSchedulingCoffee(false); }
  };
  // "I got hired" in the conversation (candidates): sets the job status to hired for THIS match; the server
  // marks it Hired, closes the other processes, cancels their meetings and thanks each recruiter.
  const [hiredConfirm, setHiredConfirm] = useState(false);
  const [hiredBusy, setHiredBusy] = useState(false);
  useEffect(() => { setHiredConfirm(false); }, [match?.id]);
  const confirmHired = async () => {
    if (!match) return;
    setHiredBusy(true);
    try {
      const res = await api.updateProfile(data.viewer.id, { jobStatus: { kind: 'hired', matchId: match.id, role: match.job?.title, company: match.job?.company, recruiter: match.employer?.name } }) as { user: Person; effects?: { closed: number; meetingsCancelled: number; messages: number } };
      const e = res.effects;
      setActionSent(e?.closed ? `Congratulations! ${e.closed} other process${e.closed === 1 ? '' : 'es'} closed, ${e.meetingsCancelled} meeting${e.meetingsCancelled === 1 ? '' : 's'} cancelled, ${e.messages} thank-you message${e.messages === 1 ? '' : 's'} sent.` : 'Congratulations! You are marked as hired here.');
      setHiredConfirm(false);
      const fresh = await api.bootstrap(data.viewer.id); setData(fresh);
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not save'); }
    finally { setHiredBusy(false); }
  };
  // Block user (founder, 2026-11-23; Apple guideline 1.2): confirm, then both people disappear for each other.
  const blockOther = async () => {
    if (!match) return;
    const otherId = role === 'candidate' ? match.employerId : match.candidateId;
    if (!window.confirm(`Block ${otherName || 'this person'}? You won’t see each other anywhere on JobsMatchNow and they can’t message you. You can unblock in Settings & privacy.`)) return;
    try {
      await api.block(otherId);
      const fresh = await api.bootstrap(data.viewer.id); setData(fresh);
      setSelectedMatchId('');
    } catch (err) { alert(err instanceof Error ? err.message : 'Could not block'); }
  };
  const calls = data.calls.filter((c) => c.matchId === match?.id).sort((a, b) => a.startAt - b.startAt);
  return <div className="messages-page">
    <aside className="threads">
      <div className="threads-head"><div><span className="overline">Inbox</span><h1>Messages</h1></div><button><Filter size={17} /></button></div>
      <div className="thread-search"><Search size={16} /><input placeholder="Search conversations" /></div>
      {data.matches.map((item) => {
        const label = role === 'candidate' ? item.job?.company : item.candidate?.name;
        return <button className={item.id === match?.id ? 'thread active' : 'thread'} key={item.id} onClick={() => setSelectedMatchId(item.id)}>
          {role === 'candidate' && item.job ? <CompanyLogoMark job={item.job} small /> : <img src={item.candidate?.photo} />}
          <div><div><strong>{label}</strong></div><p>{item.job?.title}</p></div>
        </button>;
      })}
    </aside>
    <section className="conversation">{match ? <>
      <header>{role === 'candidate' && match.job ? <CompanyLogoMark job={match.job} small /> : <img src={match.candidate?.photo} />}
        <div><strong>{otherName}</strong><span><i />{match.job?.title}</span></div>
        <button className={showStarters ? 'starter-toggle active' : 'starter-toggle'} onClick={() => setShowStarters((v) => !v)} title="Conversation starters — also handy to prep for a call"><Sparkles size={16} /></button>
        <button className="starter-toggle" onClick={() => setScheduling(true)} title="Schedule a call"><Calendar size={16} /></button>
        {otherEmail && <a className="starter-toggle" href={`mailto:${otherEmail}`} title={`Email ${otherName || 'them'}`}><Mail size={16} /></a>}
        <button className="starter-toggle" onClick={() => setReporting(true)} title="Report this conversation"><Flag size={16} /></button>
        <button className="starter-toggle block-toggle" onClick={() => void blockOther()} title={`Block ${otherName || 'this person'}`} aria-label={`Block ${otherName || 'this person'}`}><Ban size={16} /></button>
      </header>
      <div className="conversation-body" ref={bodyRef}>
        <div className="date-divider">Today</div>
        {thread.map((message) => { const own = message.senderId === data.viewer.id; return <div className={own ? 'bubble-row own' : 'bubble-row'} key={message.id}>{!own && otherPhoto && <img src={otherPhoto} />}<div>{message.auto && <small className="bubble-auto">Sent automatically · recruitment process</small>}<p>{message.text}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div></div>; })}
        {typing && <div className="bubble-row typing-row" aria-live="polite">{otherPhoto && <img src={otherPhoto} />}<div><p className="typing-dots" aria-label={`${otherName || 'They'} is typing`}><i /><i /><i /></p></div></div>}
        {calls.map((call) => {
          const event = { title: call.title, description: call.notes, startAt: call.startAt, durationMinutes: call.durationMinutes };
          return <div className="schedule-card" key={call.id}>
            <div><BriefcaseBusiness size={18} /></div>
            <section><span>Scheduled call</span><strong>{call.title}</strong><p>{new Date(call.startAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {call.durationMinutes} min</p></section>
            <div className="schedule-card-links">
              <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" title="Add to Google Calendar"><ExternalLink size={14} /> Google</a>
              <a href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer" title="Add to Outlook"><ExternalLink size={14} /> Outlook</a>
              <a href={icsDataUrl(event)} download={`${call.title}.ics`} title="Download .ics"><Download size={14} /> .ics</a>
            </div>
          </div>;
        })}
      </div>
      {actionSent && <p className="action-sent-note"><Check size={13} /> {actionSent}</p>}
      {hiredConfirm && role === 'candidate' && (() => {
        const others = data.matches.filter((m) => m.id !== match.id && m.stage !== 'Hired' && m.stage !== 'Archived').length;
        return <div className="hired-confirm" role="dialog" aria-label="Confirm you got hired">
          <p><b>Congratulations! You got the {match.job?.title} role at {match.job?.company}?</b></p>
          <p>When you confirm, following the recruitment process rules:</p>
          <ul>
            <li>this process is marked <b>Hired</b> and you leave recruiter search;</li>
            <li>{others === 1 ? 'your other hiring process closes and its upcoming meetings are cancelled;' : others ? `your ${others} other hiring processes close and their upcoming meetings are cancelled;` : 'any other open process closes and its meetings are cancelled;'}</li>
            <li>each of those recruiters gets an automatic thank-you message from you for their time.</li>
          </ul>
          <div className="hired-confirm-actions"><button type="button" className="secondary-button small" onClick={() => setHiredConfirm(false)} disabled={hiredBusy}>Not yet</button>
            <button type="button" className="primary-button small" onClick={() => void confirmHired()} disabled={hiredBusy}>{hiredBusy ? <Loader2 size={14} className="spin" /> : <><BadgeCheck size={14} /> Yes, I got hired</>}</button></div>
        </div>;
      })()}
      <div className="coffee-quick-row">
        <button type="button" className="coffee-quick-btn" onClick={() => void quickCoffee()} disabled={schedulingCoffee}>
          <Coffee size={15} /> {schedulingCoffee ? 'Creating invite…' : "Let's have a cup of Coffee"}
        </button>
        {/* "I got hired" (candidates): runs the recruitment-process rule on this match. */}
        {role === 'candidate' && match.stage === 'Hired' && <span className="hired-here-chip"><BadgeCheck size={15} /> You were hired here</span>}
        {role === 'candidate' && match.stage !== 'Hired' && match.stage !== 'Archived' && data.viewer.jobStatus?.kind !== 'hired' &&
          <button type="button" className="coffee-quick-btn hired-quick-btn" onClick={() => setHiredConfirm(true)}><BadgeCheck size={15} /> I got hired</button>}
        {role === 'employer' && <>
          <button type="button" className="coffee-quick-btn feedback-quick-btn" onClick={() => setFeedbackOpen(true)}><Mail size={15} /> Send Feedback</button>
          <button type="button" className="coffee-quick-btn recommend-quick-btn" onClick={() => setRecommendOpen(true)}><Send size={15} /> Recommendation Email</button>
        </>}
      </div>
      {showStarters && (role === 'employer'
        ? <RecruiterStarters candidateName={match.candidate?.name || 'there'} archetype={match.candidate?.aboutMeArchetype} onPick={pickStarter} />
        : <CandidateStarters onPick={pickStarter} />)}
      <form className="composer" onSubmit={send}><input ref={composerRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" enterKeyHint="send" /><button type="submit" disabled={!text.trim()}><Send size={17} /></button></form>
      <p className="composer-footnote">Keep it respectful — see our <button type="button" className="text-button" onClick={() => setConductOpen(true)}>Code of Conduct</button>.</p>
      {conductOpen && <ConductModal onClose={() => setConductOpen(false)} />}
      {scheduling && <ScheduleCallModal match={match} viewer={data.viewer} onClose={() => setScheduling(false)}
        onScheduled={(call) => { setData({ ...data, calls: [...data.calls, call] }); setScheduling(false); }}
        onShareLink={async (shareText) => { const message = await api.message({ matchId: match.id, senderId: data.viewer.id, text: shareText }); setData({ ...data, messages: [...data.messages, message] }); setScheduling(false); }} />}
      {feedbackOpen && <FeedbackEmailModal match={match} onClose={() => setFeedbackOpen(false)} onSent={() => { setFeedbackOpen(false); setActionSent('Feedback email sent.'); window.setTimeout(() => setActionSent(''), 4000); }} />}
      {recommendOpen && <RecommendationEmailModal match={match} onClose={() => setRecommendOpen(false)} onSent={() => { setRecommendOpen(false); setActionSent('Recommendation email sent.'); window.setTimeout(() => setActionSent(''), 4000); }} />}
      {reporting && <ReportModal viewerId={data.viewer.id} targetType="conversation" targetId={match.id} onClose={() => setReporting(false)} />}
    </> : <EmptyState title="No conversations yet" />}</section>
    <aside className="context-panel">
      {role === 'candidate' && match?.job ? <CompanyLogoMark job={match.job} /> : <img src={match?.candidate?.photo} />}
      <h3>{otherName}</h3><p>{role === 'candidate' ? match?.job?.location : match?.candidate?.title}</p>
      <span className="fit-pill">{match?.candidate?.match?.score ?? 94}% role match</span>
      <div className="context-details"><label>Matched for</label><strong>{match?.job?.title}</strong><label>Location</label><strong>{match?.candidate?.location}</strong><label>Stage</label><strong>{match?.stage}</strong></div>
      <button className="secondary-button" onClick={() => setViewingProfile(true)} disabled={!match}>View full profile</button>
    </aside>
    {viewingProfile && match && (role === 'candidate' && match.job
      ? <JobDetailModal job={match.job} onClose={() => setViewingProfile(false)} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />
      : match.candidate
        ? <CandidateProfileModal candidate={match.candidate} onClose={() => setViewingProfile(false)} unlocked viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />
        : null)}
  </div>;
}

/** Every scheduled call across every match, in one place — plus a way to
 * propose a time for any match that doesn't have one yet. Deliberately its
 * own page (not folded into Conversations): meetings are a cross-match
 * concept, so "what's on my calendar this week" shouldn't require opening
 * every thread one by one to check. */
function Meetings({ role, data, setData, onOpenMessages }: { role: Role; data: Bootstrap; setData: (d: Bootstrap) => void; onOpenMessages: (matchId: string) => void }) {
  const [schedulingFor, setSchedulingFor] = useState<JobMatch | null>(null);
  const now = Date.now();
  // Cancelled meetings (a process closed: someone got hired or it was stopped) move to the past list.
  const upcoming = [...data.calls].filter((call) => call.startAt >= now && !call.cancelledAt).sort((a, b) => a.startAt - b.startAt);
  const past = [...data.calls].filter((call) => call.startAt < now || call.cancelledAt).sort((a, b) => b.startAt - a.startAt);
  const scheduledMatchIds = new Set(data.calls.filter((call) => !call.cancelledAt).map((call) => call.matchId));
  const unscheduled = data.matches.filter((match) => !scheduledMatchIds.has(match.id) && match.stage !== 'Archived');

  const otherParty = (match: JobMatch) => role === 'candidate'
    ? { name: match.job?.company || match.employer?.name || 'Recruiter', sub: match.job?.title, photo: match.employer?.photo, email: match.employer?.email }
    : { name: match.candidate?.name || 'Candidate', sub: match.job?.title, photo: match.candidate?.photo, email: match.candidate?.email };

  const CallCard = ({ call, past: isPast }: { call: ScheduledCall; past?: boolean }) => {
    const match = data.matches.find((m) => m.id === call.matchId);
    const other = match ? otherParty(match) : undefined;
    const event = { title: call.title, description: call.notes, startAt: call.startAt, durationMinutes: call.durationMinutes };
    return <div className="schedule-card" key={call.id}>
      {other?.photo ? <img className="meeting-photo" src={other.photo} alt="" /> : <div><Calendar size={16} /></div>}
      <section><span>{other?.name}{other?.sub ? ` · ${other.sub}` : ''}</span><strong>{call.title}</strong>
        <p>{new Date(call.startAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {call.durationMinutes} min{call.cancelledAt ? <b className="meeting-cancelled"> · Cancelled{call.cancelReason === 'candidate_hired' ? ' (candidate hired)' : call.cancelReason === 'role_filled' ? ' (role filled)' : call.cancelReason === 'stopped_by_recruiter' ? ' (process stopped)' : ''}</b> : null}</p>
      </section>
      <div className="schedule-card-actions">
        {!isPast && <>
          <a className="meeting-chip" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" title="Add to Google Calendar"><ExternalLink size={13} /> Google</a>
          <a className="meeting-chip" href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer" title="Add to Outlook"><ExternalLink size={13} /> Outlook</a>
          <a className="meeting-chip" href={icsDataUrl(event)} download={`${call.title}.ics`} title="Calendar file with alarms 1 hour and 15 minutes before — open it on your phone"><Download size={13} /> Phone alarm</a>
        </>}
        {other?.email && <a className="meeting-chip" href={meetingMailto(other.email, event)} title={`Email the meeting details to ${other.name}`}><MailIcon size={13} /> Email to</a>}
        <button className="meeting-btn" onClick={() => onOpenMessages(call.matchId)}>Open chat</button>
      </div>
    </div>;
  };

  return <div className="page meetings-page">
    <div className="page-title"><div><span className="overline">Calendar</span><h1>{featureOn('filters') ? 'Interviews' : role === 'candidate' ? 'Recruiter Invitation' : 'Meetings'}</h1><p>{role === 'candidate' ? 'Every interview and call teams invited you to, with one-click add to Google, Outlook, or Apple Calendar.' : 'Every scheduled call across your matches, with one-click add to Google, Outlook, or Apple Calendar.'}</p></div></div>
    <CalendarSync userId={data.viewer.id} />

    <section className="td-section" id="meetings-upcoming">
      <DashboardTitle icon={Calendar} title="Upcoming" subtitle={`${upcoming.length} scheduled`} />
      {upcoming.length
        ? <div className="meetings-list">{upcoming.map((call) => <CallCard call={call} key={call.id} />)}</div>
        : <EmptyRow>No meetings scheduled yet — propose a time with a match below.</EmptyRow>}
    </section>

    <section className="td-section" id="meetings-schedule">
      <DashboardTitle icon={Users} title="Schedule a meeting" subtitle="Pick a match to propose a time." />
      {unscheduled.length
        ? <div className="meetings-list">{unscheduled.map((match) => {
          const other = otherParty(match);
          return <div className="schedule-card" key={match.id}>
            {other.photo ? <img className="meeting-photo" src={other.photo} alt="" /> : <div><Calendar size={16} /></div>}
            <section><span>{other.sub}</span><strong>{other.name}</strong></section>
            <button className="meeting-btn solid" onClick={() => setSchedulingFor(match)}><Calendar size={15} /> Schedule</button>
          </div>;
        })}</div>
        : <EmptyRow>Every match already has a meeting on the calendar.</EmptyRow>}
    </section>

    {past.length > 0 && <section className="td-section" id="meetings-past">
      <DashboardTitle icon={Clock3} title="Past meetings" subtitle={`${past.length} completed`} />
      <div className="meetings-list">{past.map((call) => <CallCard call={call} past key={call.id} />)}</div>
    </section>}

    {schedulingFor && <ScheduleCallModal match={schedulingFor} viewer={data.viewer} onClose={() => setSchedulingFor(null)}
      onScheduled={(call) => { setData({ ...data, calls: [...data.calls, call] }); setSchedulingFor(null); }}
      onShareLink={async (shareText) => { const message = await api.message({ matchId: schedulingFor.id, senderId: data.viewer.id, text: shareText }); setData({ ...data, messages: [...data.messages, message] }); setSchedulingFor(null); }} />}
  </div>;
}

/** Every real coffee/one-on-one meeting a candidate has proactively asked
 * for — filtered by call.createdBy so a recruiter-proposed call (handled on
 * the Meetings page) doesn't get mixed in with an invite the candidate
 * actually initiated. */
/** Coffee Invitations, both sides: invitations the other side sent you, and the ones you sent. */
function CoffeeInvitations({ data, onOpenMessages }: { data: Bootstrap; onOpenMessages: (matchId: string) => void }) {
  const candidate = data.viewer.role === 'candidate';
  const mine = data.matches.filter((m) => (candidate ? m.candidateId : m.employerId) === data.viewer.id);
  const byMatch = new Map(mine.map((m) => [m.id, m]));
  const calls = data.calls.filter((c) => byMatch.has(c.matchId)).sort((a, b) => b.startAt - a.startAt);
  const received = calls.filter((c) => c.createdBy !== data.viewer.id);
  const sent = calls.filter((c) => c.createdBy === data.viewer.id);
  const Card = ({ call }: { call: ScheduledCall }) => {
    const match = byMatch.get(call.matchId);
    const who = candidate ? (match?.employer?.name || match?.job?.company) : match?.candidate?.name;
    const photo = candidate ? match?.employer?.photo : match?.candidate?.photo;
    const event = { title: call.title, description: call.notes, startAt: call.startAt, durationMinutes: call.durationMinutes };
    const upcoming = call.startAt >= Date.now() && !call.cancelledAt;
    return <div className="schedule-card" key={call.id}>
      {photo ? <img className="meeting-photo" src={photo} alt="" /> : <div><Coffee size={16} /></div>}
      <section><span>{who}{match?.job?.title ? ` · ${match.job.title}` : ''}</span><strong>{call.title}</strong>
        <p>{new Date(call.startAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {call.durationMinutes} min{call.cancelledAt ? <b className="meeting-cancelled"> · Cancelled</b> : !upcoming ? ' · Past' : ''}</p>
      </section>
      <div className="schedule-card-actions">
        {upcoming && <>
          <a className="meeting-chip" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" title="Add to Google Calendar"><ExternalLink size={13} /> Google</a>
          <a className="meeting-chip" href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer" title="Add to Outlook"><ExternalLink size={13} /> Outlook</a>
          <a className="meeting-chip" href={icsDataUrl(event)} download={`${call.title}.ics`} title="Calendar file with phone alarms"><Download size={13} /> Phone alarm</a>
        </>}
        <button className="meeting-btn" onClick={() => onOpenMessages(call.matchId)}>Open chat</button>
      </div>
    </div>;
  };
  return <div className="page meetings-page">
    <div className="page-title"><div><span className="overline">Real, in-person</span><h1>Coffee Invitations</h1>
      <p>{candidate ? 'Hiring teams who invited you to a one-on-one coffee chat or call, and the invitations you sent.' : 'Candidates who proactively invited you to a one-on-one coffee chat or call, and the invitations you sent.'}</p></div></div>
    <section className="td-section">
      <DashboardTitle icon={Coffee} title="Invitations you received" subtitle={`${received.length} from ${candidate ? 'hiring teams' : 'candidates'}`} />
      {received.length ? <div className="meetings-list">{received.map((c) => <Card call={c} key={c.id} />)}</div>
        : <EmptyRow>{candidate ? 'No hiring team has invited you to a coffee chat yet.' : 'No candidate has invited you to a coffee chat yet.'}</EmptyRow>}
    </section>
    <section className="td-section">
      <DashboardTitle icon={Send} title="Invitations you sent" subtitle={`${sent.length} sent`} />
      {sent.length ? <div className="meetings-list">{sent.map((c) => <Card call={c} key={c.id} />)}</div>
        : <EmptyRow>You have not sent a coffee invitation yet. Open a conversation and use “Let’s have a cup of coffee”.</EmptyRow>}
    </section>
  </div>;
}

/** Bookmarking (the bookmark icon on job/candidate cards) was fully wired
 * end to end but had nowhere to review everything you'd saved — this is
 * that list, for both roles. */
function Saved({ role, data, setData, navigate }: { role: Role; data: Bootstrap; setData: (d: Bootstrap) => void; navigate: (v: View) => void }) {
  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const [detailPerson, setDetailPerson] = useState<Person | null>(null);
  const savedJobs = data.jobs.filter((job) => data.bookmarkedIds.includes(job.id));
  const savedCandidates = data.candidates.filter((person) => data.bookmarkedIds.includes(person.id));
  const unsave = async (targetId: string, targetType: 'job' | 'candidate') => {
    await api.toggleBookmark({ userId: data.viewer.id, targetId, targetType });
    setData({ ...data, bookmarkedIds: data.bookmarkedIds.filter((id) => id !== targetId) });
  };
  return <div className="page">
    <div className="page-title"><div><span className="overline">{role === 'candidate' ? 'Saved for later' : 'Saved candidates'}</span><h1>Saved</h1><p>{role === 'candidate' ? 'Roles you bookmarked while browsing.' : 'Candidates you bookmarked while browsing.'}</p></div></div>
    {role === 'candidate'
      ? (savedJobs.length
        ? <div className="jobs-table"><header><span>Role</span><span>Status</span><span>Salary</span><span>Skills</span><span /></header>
          {savedJobs.map((job) => <div className="job-row job-row-clickable" key={job.id} role="button" tabIndex={0} onClick={() => setDetailJob(job)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetailJob(job); } }}>
            <div><JobHeaderBadge job={job} compact /></div>
            <span className={`status status-${job.status.toLowerCase()}`}><i />{job.status[0].toUpperCase()}{job.status.slice(1)}</span>
            <span>{job.salaryHidden ? 'Hidden' : job.salary}</span>
            <span>{job.requiredSkills.length} weighted</span>
            <button aria-label={`Remove ${job.title} from saved`} onClick={(event) => { event.stopPropagation(); void unsave(job.id, 'job'); }}><BookmarkIcon fill="currentColor" /></button>
          </div>)}</div>
        : <EmptyState title="Nothing saved yet — bookmark a role from Discover to find it here." />)
      : (savedCandidates.length
        ? <div className="jobs-table"><header><span>Candidate</span><span>Fit</span><span>Location</span><span>Skills</span><span /></header>
          {savedCandidates.map((person) => <div className="job-row job-row-clickable" key={person.id} role="button" tabIndex={0} onClick={() => setDetailPerson(person)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetailPerson(person); } }}>
            <div className="td-recruiter-line"><img src={person.photo} alt="" /><span><strong>{person.name}</strong><small>{person.title}</small></span></div>
            <span>{person.match?.score ?? 0}% match</span>
            <span>{person.location}</span>
            <span>{person.skills.length} skills</span>
            <button aria-label={`Remove ${person.name} from saved`} onClick={(event) => { event.stopPropagation(); void unsave(person.id, 'candidate'); }}><BookmarkIcon fill="currentColor" /></button>
          </div>)}</div>
        : <EmptyState title="Nothing saved yet — bookmark a candidate from Discover to find them here." />)}
    {detailJob && <JobDetailModal job={detailJob} onClose={() => setDetailJob(null)} viewerId={data.viewer.id} notes={data.notes} onNoteSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />}
    {detailPerson && <div className="mh-modal-scrim" role="presentation" onMouseDown={() => setDetailPerson(null)}>
      <section className="mh-profile-modal" role="dialog" aria-modal="true" aria-label={`${detailPerson.name}'s profile`} onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="overline">Candidate profile</span><h2>{detailPerson.name}</h2></div><button onClick={() => setDetailPerson(null)} aria-label="Close profile"><X /></button></header>
        <CandidateCards person={detailPerson} match={detailPerson.match} />
        <NotesBox viewerId={data.viewer.id} targetId={detailPerson.id} targetType="candidate" notes={data.notes} onSaved={(note) => setData({ ...data, notes: [...data.notes.filter((n) => n.id !== note.id), note] })} />
        <footer><button className="secondary-button" onClick={() => setDetailPerson(null)}>Close</button><button className="primary-button" onClick={() => navigate('discover')}>Go to Discover <ArrowRight size={15} /></button></footer>
      </section>
    </div>}
  </div>;
}

function Matches({ data, navigate, onOpenMessages }: { data: Bootstrap; navigate: (v: View) => void; onOpenMessages?: (matchId: string) => void }) { return <div className="page"><div className="page-title"><div><span className="overline">Mutual interest</span><h1>Your matches</h1><p>These teams chose you back. Start a conversation when you’re ready.</p></div></div><div className="match-grid">{data.matches.map((match) => <article key={match.id}>{match.job && <JobHeaderBadge job={match.job} />}<div className="match-grid-actions"><button className="secondary-button" onClick={() => navigate('discover')}>View role</button><button className="primary-button" onClick={() => onOpenMessages ? onOpenMessages(match.id) : navigate('messages')}><MessageCircle size={16} />Message</button></div></article>)}</div></div>; }

function Companies({ data, navigate }: { data: Bootstrap; navigate: (v: View) => void }) {
  const companies = [...new Map(data.jobs.map((job) => [job.company, job])).values()];
  return <div className="page"><div className="page-title"><div><span className="overline">Companies</span><h1>Companies checking you out</h1><p>Explore teams with relevant opportunities.</p></div></div><div className="jobs-table">{companies.map((job) => <div className="job-row" key={job.company}><div><JobHeaderBadge job={job} compact /></div><span>{job.workMode}</span><span>{job.location}</span><span>{job.requiredSkills.length} matching signals</span><span>{job.salary}</span><button aria-label={`Explore ${job.company}`} onClick={() => navigate('discover')}><ArrowRight size={16} /></button></div>)}</div></div>;
}

function Jobs({ data, reload, onAddJobs, manualJobRequest, onOpenMessages, editJobId }: { data: Bootstrap; reload: () => void; onAddJobs: () => void; manualJobRequest: number; onOpenMessages?: (matchId: string) => void; editJobId?: string }) {
  const [editing, setEditing] = useState<Job | 'new' | null>(null);
  const [quickPost, setQuickPost] = useState(false);
  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { if (manualJobRequest > 0) setEditing('new'); }, [manualJobRequest]);
  // Opened via "Edit" on a job row elsewhere (e.g. the Home dashboard's My Jobs list).
  useEffect(() => { if (editJobId) { const job = data.jobs.find((j) => j.id === editJobId); if (job) setEditing(job); } }, [editJobId]);
  const doDelete = async (id: string) => {
    setDeleting(true);
    try { await api.deleteJob(id); setConfirmDeleteId(null); setDetailJob(null); reload(); } finally { setDeleting(false); }
  };
  if (editing) return <JobEditor viewer={data.viewer} job={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); setDetailJob(null); reload(); }} onCancel={() => setEditing(null)} />;
  if (quickPost) return <QuickPostRole viewer={data.viewer} onPosted={() => { setQuickPost(false); reload(); }} onCancel={() => setQuickPost(false)} />;
  if (detailJob) return <JobOfferDetail job={detailJob} data={data} onBack={() => setDetailJob(null)} onEdit={() => { setEditing(detailJob); }} onDelete={() => void doDelete(detailJob.id)} deleting={deleting} onOpenMessages={onOpenMessages} />;
  const mine = data.jobs.filter((j) => j.employerId === data.viewer.id);
  return <div className="page"><div className="page-title"><div><span className="overline">Recruiting</span><h1>My Job Offers</h1><p>Import, review, and manage every role in one place.</p></div><div style={{ display: 'flex', gap: 8 }}><button className="secondary-button small" onClick={() => setQuickPost(true)}>Post a real role</button><button className="primary-button small" onClick={onAddJobs}>+ Add New Job Offers</button></div></div>
    <section className="job-add-banner"><span><Sparkles size={19} /></span><div><strong>Add jobs in minutes</strong><p>Use an ATS feed, paste LinkedIn descriptions, or create an offer manually.</p></div><div className="job-add-methods"><small>CSV / XML / JSON</small><small>LinkedIn links</small><small>Manual</small></div><button className="secondary-button" onClick={onAddJobs}>Choose a method <ArrowRight size={15} /></button></section>
    <div className="channel-bar"><div className="linkedin-mark"><BriefcaseBusiness size={18} /></div><section><strong>JobMatchNow is your job hub</strong><p>Imported offers become reviewable five-card drafts. Nothing is scraped or published automatically.</p></section><span>Recruiter controlled</span></div>
    <div className="jobs-table"><header><span>Role</span><span>Status</span><span>Salary</span><span>Applicants</span><span>Skills</span><span /></header>{mine.map((job) => <div className="job-row job-row-clickable" key={job.id} role="button" tabIndex={0} onClick={() => setDetailJob(job)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetailJob(job); } }}><div><JobHeaderBadge job={job} compact />{job.importNeedsReview?.length ? <small className="job-review-note">Review {job.importNeedsReview.join(', ')}</small> : null}</div><span className={`status status-${job.status.toLowerCase()}`}><i />{job.status[0].toUpperCase()}{job.status.slice(1)}</span><span>{job.salary}</span><span>{job.applicants}</span><span>{job.requiredSkills.length} weighted</span>
      <div className="job-row-actions" onClick={(event) => event.stopPropagation()}>
        {confirmDeleteId === job.id
          ? <><button className="confirm-yes" aria-label={`Confirm delete ${job.title}`} disabled={deleting} onClick={() => void doDelete(job.id)}><Check size={14} /></button><button className="confirm-no" aria-label="Cancel delete" onClick={() => setConfirmDeleteId(null)}><X size={14} /></button></>
          : <><button aria-label={`Edit ${job.title}`} onClick={() => setEditing(job)}><MoreHorizontal size={15} /></button><button className="danger" aria-label={`Delete ${job.title}`} onClick={() => setConfirmDeleteId(job.id)}><Trash2 size={14} /></button></>}
      </div>
    </div>)}{mine.length === 0 && <div className="job-row"><div><section><strong>No job offers yet</strong><small>Add your first role using the simplest method for you.</small></section></div></div>}</div><div className="job-empty"><div><Sparkles /></div><section><h3>Reach the right people, not the most people.</h3><p>JobsMatchNow recommends your role only to candidates with meaningful fit and verified intent.</p></section><button className="secondary-button" onClick={onAddJobs}>Add your first job offers</button></div></div>;
}

/** Per-job detail: this role's mutual matches, and message threads scoped to it. */
function JobOfferDetail({ job, data, onBack, onEdit, onDelete, deleting, onOpenMessages }: { job: Job; data: Bootstrap; onBack: () => void; onEdit: () => void; onDelete: () => void; deleting?: boolean; onOpenMessages?: (matchId: string) => void }) {
  const matches = data.matches.filter((match) => match.jobId === job.id);
  const [confirming, setConfirming] = useState(false);
  return <div className="page job-offer-detail">
    <div className="page-title">
      <div><button className="secondary-button small" onClick={onBack}><ArrowLeft size={15} /> Back to My JobMatches</button></div>
      <div style={{ display: 'flex', gap: 8 }}>
        {confirming
          ? <><span className="settings-confirm"><button className="danger-button small" disabled={deleting} onClick={onDelete}>{deleting ? <Loader2 size={14} className="spin" /> : 'Confirm delete'}</button><button className="text-button" onClick={() => setConfirming(false)}>Cancel</button></span></>
          : <><button className="danger-button small" onClick={() => setConfirming(true)}><Trash2 size={14} /> Delete role</button><button className="primary-button small" onClick={onEdit}>Edit role</button></>}
      </div>
    </div>
    {(job.demo || job.sample) && <DemoBadge label={job.sample ? 'Starter sample job — auto-generated for you' : 'Demo job offer — not a real opening'} />}
    <JobHeaderBadge job={job} />
    <section className="td-section" id="job-detail-matches">
      <DashboardTitle icon={Check} title="Job Matches" subtitle={`Candidates who mutually matched for ${job.title}.`} />
      {matches.length
        ? <div className="td-role-sublist">{matches.map((match) => <div className="td-cand-row" key={match.id}>
          <img src={match.candidate.photo} alt="" />
          <div className="td-cand-row-info"><strong>{match.candidate.name}</strong><small>{match.candidate.title}</small></div>
          <span className="td-cand-row-score">{match.candidate.match?.score || 0}%</span>
          <button className="td-cand-row-talk matched" onClick={() => onOpenMessages?.(match.id)}><MessageCircle size={13} /> Message</button>
        </div>)}</div>
        : <EmptyRow>No mutual matches yet for this role.</EmptyRow>}
    </section>
    <section className="td-section" id="job-detail-messages">
      <DashboardTitle icon={MessageCircle} title="Messages" subtitle="Conversations with candidates matched to this role." />
      {matches.length
        ? <div className="td-list-panel job-detail-threads">{matches.map((match) => {
          const last = data.messages.filter((message) => message.matchId === match.id).at(-1);
          return <button key={match.id} onClick={() => onOpenMessages?.(match.id)}>
            <img src={match.candidate.photo} alt="" />
            <span><strong>{match.candidate.name}</strong><small>{last?.text || 'No messages yet — say hello.'}</small></span>
            <ArrowRight size={12} />
          </button>;
        })}</div>
        : <EmptyRow>Messages with matched candidates will show up here.</EmptyRow>}
    </section>
  </div>;
}

function Analytics({ role, data }: { role: Role; data: Bootstrap }) {
  // Real figures derived from this viewer's matches and messages — same
  // shape for both roles, just framed from whichever side is looking.
  const totalMatches = data.matches.length;
  const inConversation = data.matches.filter((m) => data.messages.some((msg) => msg.matchId === m.id)).length;
  const otherReplied = data.matches.filter((m) => data.messages.some((msg) => msg.matchId === m.id && (role === 'candidate' ? msg.senderId !== data.viewer.id : msg.senderId === m.candidateId))).length;
  const responseRate = inConversation ? Math.round((otherReplied / inConversation) * 100) : 0;
  // Fit scores live on the job / candidate lists; the match copy may not carry them.
  const scores = data.matches.map((m) => scoreOf(m, data)).filter((s): s is number => typeof s === 'number');
  const avgScore = scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : 0;
  const pctOf = (n: number) => scores.length ? Math.round((n / scores.length) * 100) : 0;
  const excellentPct = pctOf(scores.filter((s) => s >= 85).length);
  const goodPct = pctOf(scores.filter((s) => s >= 70 && s < 85).length);
  const fairPct = scores.length ? 100 - excellentPct - goodPct : 0;
  const interviewing = data.matches.filter((m) => m.stage === 'Interview' || m.stage === 'Offer').length;
  const copy = role === 'candidate'
    ? {
      overline: 'Career intelligence', title: 'Job search insights',
      subtitle: 'Signals that help you understand your search and strengthen your profile.',
      responseLabel: 'Recruiter response', funnelTitle: 'Application funnel', funnelSubtitle: 'From profile view to qualified conversation',
      qualityTitle: 'Role fit quality', qualitySubtitle: 'Your job matches',
      insightTitle: 'Add your salary expectations to your profile.',
      insightBody: 'Every role here shows its salary range, so adding yours helps teams see quickly whether you fit.',
      insightAction: 'Update preferences',
    }
    : {
      overline: 'Talent intelligence', title: 'Hiring insights',
      subtitle: 'Signals that help your team improve quality, speed, and candidate experience.',
      responseLabel: 'Candidate response', funnelTitle: 'Matching funnel', funnelSubtitle: 'From recommendation to qualified conversation',
      qualityTitle: 'Match quality', qualitySubtitle: 'Recommended candidates',
      insightTitle: 'Keep must-have skills short and specific.',
      insightBody: 'The match score explains each fit using the skills you list, so a clear must-have list gives clearer reasons.',
      insightAction: 'Review roles',
    };
  // Funnel from this viewer's own data only; no sample or benchmark numbers.
  const funnel = [
    { label: 'Matches', value: totalMatches },
    { label: 'In conversation', value: inConversation },
    { label: 'Replied', value: otherReplied },
    { label: 'Interview +', value: interviewing },
  ];
  const summary: [string, string | number][] = [['Mutual matches', totalMatches], ['In conversation', inConversation], [copy.responseLabel, `${responseRate}%`], ['Interviewing +', interviewing], ['Average fit', scores.length ? `${avgScore}%` : ''], ...funnel.map((f): [string, number] => [`Funnel: ${f.label}`, f.value])];
  const downloadCsv = () => downloadText(`jobsmatchnow-report-${new Date().toISOString().slice(0, 10)}.csv`, reportCsv(role === 'candidate' ? 'candidate' : 'employer', data, summary));
  return <div className="page report-page"><div className="page-title"><div><span className="overline">{copy.overline}</span><h1>{copy.title}</h1><p>{copy.subtitle}</p></div>
    <div className="report-actions no-print"><button className="secondary-button small" onClick={downloadCsv}><Download size={15} /> Download CSV</button><button className="secondary-button small" onClick={() => window.print()}><Download size={15} /> Save as PDF</button><button className="ghost-button">All time <ChevronDown size={15} /></button></div></div><div className="analytics-grid"><Metric label="Mutual matches" value={String(totalMatches)} change="live" /><Metric label="In conversation" value={String(inConversation)} change={`${totalMatches ? Math.round((inConversation / totalMatches) * 100) : 0}% of matches`} /><Metric label={copy.responseLabel} value={`${responseRate}%`} change={`${otherReplied}/${inConversation} replied`} /><Metric label="Interviewing +" value={String(interviewing)} change="Interview & offer" /></div><div className="chart-grid"><section className="chart-card wide"><header><div><strong>{copy.funnelTitle}</strong><p>{copy.funnelSubtitle}</p></div><button><MoreHorizontal /></button></header><div className="bar-chart">{funnel.map((step) => <div key={step.label}><i style={{ height: `${totalMatches ? Math.max(2, (step.value / totalMatches) * 100) : 2}%` }} title={`${step.label}: ${step.value}`} /><span>{step.label} ({step.value})</span></div>)}</div></section><section className="chart-card"><header><div><strong>{copy.qualityTitle}</strong><p>{copy.qualitySubtitle}</p></div></header><div className="donut" style={{ background: scores.length ? `conic-gradient(var(--green) 0 ${excellentPct}%, #93c960 ${excellentPct}% ${excellentPct + goodPct}%, #dce9c6 ${excellentPct + goodPct}%)` : '#eef2ea' }}><div><strong>{scores.length ? avgScore : '–'}</strong><span>{scores.length ? 'avg. score' : 'no matches yet'}</span></div></div><div className="legend"><span><i className="excellent" />Excellent (85+) <b>{excellentPct}%</b></span><span><i className="good" />Good (70–84) <b>{goodPct}%</b></span><span><i className="fair" />Developing <b>{fairPct}%</b></span></div></section></div>{(role !== 'candidate' || data.viewer.preferences?.salary?.min === undefined) && <section className="insight-callout"><div><Sparkles /></div><section><span>Opportunity insight</span><h3>{copy.insightTitle}</h3><p>{copy.insightBody}</p></section><button className="secondary-button">{copy.insightAction}</button></section>}<AiAnalystInline data={data} />{role === 'candidate' ? <CandidateReport data={data} /> : <RecruiterReport data={data} />}</div>; }

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function Metric({ label, value, change }: { label: string; value: string; change: string }) { return <article className="metric"><span>{label}</span><strong>{value}</strong><small>{change}</small></article>; }
function LoadingState() { return <div className="loading-state"><div className="loading-mark brand-heart-mark" /><p>Building your best matches…</p></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="error-state"><div><Activity /></div><h2>We couldn’t load your workspace</h2><p>{message}</p><button className="primary-button" onClick={retry}>Try again</button></div>; }
function EmptyState({ title }: { title: string }) { return <div className="empty-state"><Inbox /><h3>{title}</h3></div>; }
function Brand() { return <div className="brand"><span className="brand-heart-mark" aria-hidden="true" /><span className="brand-wordmark"><b>Jobs</b><b>Match</b><b>Now</b></span></div>; }
