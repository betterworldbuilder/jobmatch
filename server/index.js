import crypto from 'node:crypto';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonStore } from './store.js';
import { PgStore } from './store-pg.js';
import { createSeed } from './seed.js';
import { blockedBetween, matchingPool, targetIsInMatchingPool } from './matching-pool.js';
import { buildIcs, meetingsFor, newFeedToken, validFeedToken, REMINDER_MINUTES } from './calendar-feed.js';
import { onCandidateHired, onRoleFilled, stopProcess } from './hiring-rules.js';
import { demoAnswer } from './demo-replies.js';
import { buildContext as buildAiContext, callProvider as callAiProvider, citedSources as citedAiSources, ownKeyConfig as aiOwnKeyConfig, providerConfig as aiProviderConfig, today as aiToday } from './ai-chat.js';
import { PREMIUM_TRIAL_DAYS, premiumActive, premiumState, startPremiumTrial } from './premium.js'; // eslint-disable-line no-unused-vars
import { KEY_LINKS as AI_KEY_LINKS, decryptKey as decryptAiKey, encryptKey as encryptAiKey, keyFormatError as aiKeyFormatError, pickModel as pickAiModel, publicKeyInfo as publicAiKeyInfo, verifyKey as verifyAiKey } from './ai-keys.js';
import { importMetadata, normalizeLinkedInImports, parseJobImportFile } from './job-import.js';
import { detectMutualMatch, isStrongRoleMatch, likesRemainingToday, scoreCandidateForJob, ValidationError, reqString, optString, optStringArray, oneOf } from './matching.js';
import { applyCandidateProfile, applyRecruiterProfile, candidateCompleteness, recruiterCompleteness } from './profile.js';
import { anonymizeText, convertDocxToPdf, detectTools, docxToHtml, extractDocxText, extractPdfText, makeSimplePdf, pdfThumbnail } from './resume.js';
import { applyJob, assertPublishable, heuristicParse, legacySkills, parseJobText, parseSalaryText, parseStrength, summaryFromText } from './jobs.js';
import { aiParseJob, importAiAllowed } from './import-ai.js';
import { afterRoleInterest, FROM_NAME, interestEmail, markViewedByRow, mountRoleInterest, RELAY_EMAIL, runFollowups, trackerFor } from './role-interest.js';
import { assignProfileSlug, ensureProfileSlugs, findRoleBySlug, maskJobContacts, publicProfileView, rolePath } from './public-urls.js';
import { claimLinksOn, claimSig, claimUrl, mountClaims, stage1Funnel } from './stage1.js';
import { backupToS3, mirrorToS3, removeFromS3, restoreFromS3, s3Enabled } from './storage.js';
import { parseResumeToProfile } from './resume-parse.js';
import os from 'node:os';
import { generateIcebreakers, generatePrep, suggestScreeningQuestions } from './coaching.js';
import { PASSWORD_MIN_LENGTH, hashPassword, rateLimit, validPassword, verifyPassword } from './auth.js';
import { mailerConfigured, sendMail } from './mailer.js';
import fs from 'node:fs';
import { exchangeLinkedinCode, linkedinAuthorizationUrl, readSignedValue, signedValue, toLinkedinJobPayload } from './integrations/linkedin.js';
import { oauthAuthorizationUrl, oauthExchangeCode, oauthProviders } from './integrations/oauth.js';
import { logBillingEvent } from './billing/audit.js';
import { actorSide, involvesDemo, onTrack, track, untrack, weeklyCounts } from './analytics.js';
import { BOT_UA, buildReport, parsePayload, readEvents, recordEvents, reportSince } from './web-analytics.js';
import { VENDORS, forwardEvent, maskedConfig, sendTo, setIntegrationConfig } from './integrations.js';
import { handleRpc, hashKey, newConnectorKey } from './mcp.js';
import {
  applyCredit, availableCredits, canUseRecruiterFeatures, computeEffectiveStatus, DAY_MS,
  findSubscription, getOrCreateTrialSubscription, isBillingExempt, PRICE_AMOUNT, PRICE_CURRENCY,
} from './billing/subscriptions.js';
import {
  buildEntitlementIndex, checkEditAllowed, checkPublishAllowed, consumeFreeJobAllowance,
  consumeReferralJobCredit, entitlementsEnforced, getRecruiterEntitlements,
  lockMatchFieldsOnPublish, resolvePlanCode, revokeJobCredit, TRIAL_ACTIVE_JOB_LIMIT,
} from './billing/entitlements.js';
import { boostedIds, boostPrice, BOOST_HOURS, BOOST_KINDS, expireBoosts, isBoosted, startBoost } from './billing/boosts.js';
import { activeMembers, addMember, findTeam, getOrCreateTeam, reconcileSeats, seatsAllowed } from './billing/seats.js';
import { applyPlanCatalog, BUILT_IN_PLANS, buildPlanFromInput, currencyForCountry, DEFAULT_PLANS, isSellable, ladderWarnings, PAY_PER_HIRE_FEE_PERCENT, PLANS, planPrice, SEAT_LADDER, seatPlanKey, SINGLE_POSTING, singlePostingPrice } from './billing/plans.js';
import { applyPaymentSettings, COUNTRIES, gridOf, isEnabled, METHOD_IDS, METHODS, PROVIDER_FIELDS, publicKeys, REGIONS, saveKeys, shownIn, zoneOf, ZONE_LABEL } from './billing/payment-settings.js';
import { assertNeverZeroLiveJobs, downgradeToFree, applyLiveJobLimit } from './billing/downgrade.js';
import { clearSlotLocks, confirmHire, hasVerifiedHire, HIRE_OUTCOMES, POSTING_TERM_DAYS, recordHire, renewPosting, startPostingTerm } from './billing/postings.js';
import { extendForHireInFlight, TRIAL_DAYS, trialEndsAt } from './billing/trial.js';
import { recruiterVerification } from './billing/verification.js';
import { chargeFor, lockCurrentPricesForPlan, monthlyRecurringRevenue, selectedPlanKey as selectedPlanKeyOf, selectPlan, SELECTABLE_PLANS, setExtraJobSlots } from './billing/charge.js';
import { attachReferralOnRegister, findReferrerByCode, getOrCreateReferralCode, revokeReferralCreditForPayment } from './billing/referrals.js';
import { BANK_INSTRUCTION_FIELDS, companyCountry, generateInvoiceNumber, generateTransferReference, isIban, isTrc20Address, isTronTxHash, isVietnam, MANUAL_METHOD_IDS, paymentInstructions, USDT_METHOD } from './billing/providers/manual.js';
import { createPaymentLink as createPayosLink, isPayosConfigured, isPayosPaid, newOrderCode, payosDescription, testPayosConnection, verifyWebhook as verifyPayosWebhook } from './billing/providers/payos.js';
import { buildPaymentUrl, isVnpayConfigured, isVnpaySuccess, VNPAY_AMOUNT_VND, verifySignature as verifyVnpaySignature } from './billing/providers/vnpay.js';
import { createCheckoutSession, isStripeConfigured, stripePaymentTypes, testStripeConnection, verifyWebhookSignature as verifyStripeSignature } from './billing/providers/stripe.js';
import { approveLink, createSubscription as createPaypalSubscription, isPaypalConfigured, testPaypalConnection, verifyWebhookSignature as verifyPaypalSignature } from './billing/providers/paypal.js';
import { basePlanIdFor, googlePlaySubscriptionProductId, isGooglePlayConfigured, isValidRtdnSecret, parseRtdnMessage, planKeyForBasePlan, verifySubscriptionPurchase } from './billing/providers/googleplay.js';
import { decodeJws, getTransactionInfo, isAppleConfigured, subscriptionProductId as appleSubscriptionProductId, verifyJws } from './billing/providers/applestore.js';
import { assertRecruiterAccess, requireAdminRole } from './billing/middleware.js';
import { confirmPayment } from './billing/confirm.js';
import { assignGroups, cleanSrc, ensureGroups, mountGroups } from './groups.js';
import { afterJobFinderLike, ensureCollections as ensureJobFinderCollections, findImportDuplicate, isJobFinderJob, isJobFinderUser, jobFinderIds, memberJobFinder, mountJobFinder, reachabilityOf } from './jobfinder.js';
import { mountJobLinkImport } from './job-link-import.js';
import { importKeyOk, isManager as isJobFinderManager } from './jobfinder.js';
import { outreachReport } from './outreach.js';
import { isRestricted } from './test-roles.js';
import { hideExternalCompany } from './external-roles.js';
import { runDailyBilling } from './billing/daily.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, '..');
// DATABASE_URL (RDS PostgreSQL) selects the durable production store; the JSON file remains the zero-dependency dev default.
const store = process.env.DATABASE_URL
  ? new PgStore(process.env.DATABASE_URL, createSeed)
  : new JsonStore(process.env.DB_PATH || path.join(root, 'data', 'db.json'), createSeed);
await store.init();
// Merge any seed entities added since the database was first created: add
// missing records by id, and backfill fields the seed has gained since —
// never overwriting values a user has edited.
await store.transaction((db) => {
  const seed = createSeed();
  for (const collection of ['users', 'jobs', 'swipes', 'matches', 'messages', 'calls']) {
    if (!Array.isArray(db[collection])) db[collection] = [];
    const byId = new Map(db[collection].map((item) => [item.id, item]));
    for (const item of seed[collection]) {
      const existing = byId.get(item.id);
      if (!existing) db[collection].push(item);
      else if (item.demoTemplate) Object.assign(existing, item);
      else for (const [key, value] of Object.entries(item)) if (existing[key] === undefined) existing[key] = value;
    }
  }
  // JobFinder (2026-11-25): mark the JobFinder identity account(s) and create its private collections.
  ensureJobFinderCollections(db);
  ensureGroups(db);
  for (const u of db.users) if (u.role === 'employer' && !u.demo && jobFinderIds().includes(u.id)) u.jobFinder = true;
  // Remove the retired flagship demo relationships that were replaced by the
  // Sofia/Sarah reference dataset. User-created records are never touched.
  const retiredDemoIds = {
    swipes: new Set(['s-seed-1']),
    // m-demo-hire-*: duplicate demo hires shipped once on 2026-11-23 (the same pairs already had a dm-* match,
    // now moved to Hired in demo-fill.js).
    matches: new Set(['m-candidate', 'm-existing', 'm-priya', 'm-demo-hire-anh-lumenpay', 'm-demo-hire-bao-northwind', 'm-demo-hire-ha-brightloop', 'm-demo-hire-huy-cobalt', 'm-demo-hire-lan-fieldnote']),
    messages: new Set(['msg-candidate-1', 'msg-1', 'msg-2']),
    calls: new Set(['call-existing']),
  };
  for (const [collection, ids] of Object.entries(retiredDemoIds)) {
    db[collection] = db[collection].filter((item) => !ids.has(item.id));
  }
  // Merge seed reviews by id and backfill `approved` on them, so the starter
  // reviews stay visible after the moderation field was introduced.
  if (!Array.isArray(db.feedback)) db.feedback = [];
  // fb-1 and fb-2 were invented starter reviews; drop them from stores created before they were removed.
  db.feedback = db.feedback.filter((entry) => entry.id !== 'fb-1' && entry.id !== 'fb-2');
  for (const f of seed.feedback || []) {
    const existing = db.feedback.find((entry) => entry.id === f.id);
    if (!existing) db.feedback.push(f);
    else if (existing.approved === undefined) existing.approved = f.approved;
  }
  // Scheduled calls were introduced after the store may already exist on disk.
  if (!Array.isArray(db.bookmarks)) db.bookmarks = [];
  // Billing collections were introduced after the store may already exist on disk.
  for (const collection of ['subscriptions', 'subscriptionCredits', 'jobPostCredits', 'referrals', 'payments', 'billingEvents', 'billingNotifications', 'teams', 'boosts']) {
    if (!Array.isArray(db[collection])) db[collection] = [];
  }
  // Trial is 8 weeks since 2026-11-23 (founder: "extend current trials"): trials still running on a shorter length
  // are moved to the current TRIAL_DAYS from their own start date. Idempotent: trialDays becomes TRIAL_DAYS.
  {
    const now = Date.now();
    for (const sub of db.subscriptions) {
      if (sub.status !== 'trialing' || !sub.trialStartedAt || !(sub.trialEndsAt > now) || Number(sub.trialDays || 0) >= TRIAL_DAYS) continue;
      const before = sub.trialEndsAt;
      sub.trialEndsAt = Math.max(before, trialEndsAt(sub.trialStartedAt, TRIAL_DAYS));
      sub.trialDays = TRIAL_DAYS; sub.updatedAt = now;
      logBillingEvent(db, sub.recruiterUserId, 'trial_extended_to_current_length', 'subscription', sub.id, { from: before, to: sub.trialEndsAt, days: TRIAL_DAYS });
    }
  }
  // Trust & safety / support collections, same "may already exist on disk" reasoning.
  for (const collection of ['reports', 'supportRequests']) {
    if (!Array.isArray(db[collection])) db[collection] = [];
  }
  // Funnel analytics weekly counters (server/analytics.js), same reasoning.
  if (!Array.isArray(db.eventCounts)) db.eventCounts = [];
});
console.log(`JobMatch store: ${process.env.DATABASE_URL ? 'postgresql (RDS)' : 'json file'}`);
const demoDistances = { 'j-1': 7, 'j-2': 18, 'j-3': 42, 'j-4': 75, 'c-1': 5, 'c-2': 26, 'c-3': 12, 'c-4': 65 };

/** A profile counts as verified once it's SSO-authenticated or well filled in. */
function verifiedUser(user) {
  return Boolean(user && (user.photoVerified === true || user.authProvider || user.provider === 'google' || user.provider === 'linkedin' || (user.completeness ?? 0) >= 80));
}

/**
 * What may leave the server about ANOTHER user or their job: never credentials,
 * never exact coordinates (distance is computed here and sent as distanceKm).
 */
/** "I just got hired!": the candidate leaves recruiter search (existing matches stay). */
const isHired = (user) => user?.role === 'candidate' && user.jobStatus?.kind === 'hired';

function otherPartyView(user) {
  if (!user) return user;
  // `verification` is the member's own review record (status, admin reason): never shown to others.
  // `jobStatus`: others see only the status itself (open / waiting / signing / hired / under contract till a
  // date) so recruiters know who just got hired; the role, company, recruiter name and match stay private.
  // `calendarFeedToken` is the secret in the member's private calendar feed URL.
  // `jobFinderConsent(Log)`: the candidate's private sharing choices for JobFinder emails.
  const { geo, verification, jobStatus, calendarFeedToken, jobFinderConsent, jobFinderConsentLog, acquisition, ...rest } = selfView(user);
  if (jobStatus?.kind) rest.jobStatus = { kind: jobStatus.kind, ...(jobStatus.kind === 'contract' && jobStatus.until ? { until: jobStatus.until } : {}) };
  return rest;
}

/**
 * The one sanitizer for any user record leaving the server — including the
 * user's OWN record (bootstrap viewer, profile saves). Credentials never leave.
 */
function selfView(user) {
  if (!user) return user;
  const { passwordHash, authSubject, adminPasswordReset, ...rest } = user;
  return rest;
}
function jobPublicView(job) {
  if (!job) return job;
  const { geo, ...rest } = job;
  return rest;
}

/** Great-circle distance in km between two {lat,lng} points. */
function haversineKm(a, b) {
  if (!a || !b) return undefined;
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const sessionSecret = process.env.SESSION_SECRET || 'jobmatch-local-development-only-secret';
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production');

// Demo auth (profile dropdown, mock SSO, spoofable ids) is on by default in
// development and OFF in production. DEMO_AUTH=true/false overrides either way,
// so the live showcase can keep demo logins alongside real accounts.
const demoAuth = process.env.DEMO_AUTH !== undefined
  ? process.env.DEMO_AUTH === 'true'
  : process.env.NODE_ENV !== 'production';
// Mock SSO (fake LinkedIn/Google round-trip onto a pre-made account) is a dev
// convenience only: it is never real identity, so it stays OFF in production
// even when the live showcase keeps DEMO_AUTH on (MOCK_SSO=true cannot override that).
const mockSso = process.env.NODE_ENV !== 'production' && (process.env.MOCK_SSO !== undefined
  ? process.env.MOCK_SSO === 'true'
  : demoAuth);

const AUTH_COOKIE = 'jm_auth';
const SESSION_TTL_SECONDS = 7 * 24 * 3600;
// Where to land the browser after an SSO redirect. In production the SPA is
// served under /app/, so set APP_PATH=/app/ there; defaults to / for dev.
const APP_PATH = (process.env.APP_PATH || '/').replace(/\/?$/, '/');

function authSession(req) {
  const payload = readSignedValue(cookies(req)[AUTH_COOKIE], sessionSecret);
  if (!payload || typeof payload.sub !== 'string' || payload.expiresAt < Date.now()) return null;
  return payload;
}

function issueSession(res, user) {
  const session = signedValue({ sub: user.id, role: user.role, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 }, sessionSecret);
  setCookie(res, AUTH_COOKIE, session, { maxAge: SESSION_TTL_SECONDS });
}

/**
 * Who is acting? A signed session always wins (claimed ids from the client are
 * ignored). Without a session, the claimed id is honored only in demo mode.
 */
function resolveActor(req, claimedId) {
  const session = authSession(req);
  if (session) return session.sub;
  if (demoAuth) return claimedId || '';
  const error = new Error('Sign in to continue'); error.status = 401; throw error;
}

/**
 * Coexistence guard: without a session, a claimed identity may only be a
 * demo-flagged account — real users' accounts always require their session.
 */
function assertDemoActor(req, db, actorId) {
  if (authSession(req)) return;
  const user = db.users.find((item) => item.id === actorId);
  if (user && user.demo !== true) { const error = new Error('Sign in to continue as this account'); error.status = 401; throw error; }
}

/**
 * Guard for match-scoped reads. Anything derived from a match (icebreakers,
 * interview kits) is built from the candidate's profile, so only the two
 * matched parties — or an admin — may read it. Without a session the match must
 * be entirely demo data, mirroring assertDemoActor's rule.
 */
function assertMatchParticipant(req, db, match) {
  const session = authSession(req);
  if (session) {
    if (session.role === 'admin') return;
    if (session.sub !== match.candidateId && session.sub !== match.employerId) {
      const error = new Error('Only the matched parties can view this'); error.status = 403; throw error;
    }
    return;
  }
  const candidate = db.users.find((user) => user.id === match.candidateId);
  const employer = db.users.find((user) => user.id === match.employerId);
  if (!demoAuth || candidate?.demo !== true || employer?.demo !== true) {
    const error = new Error('Sign in to continue'); error.status = 401; throw error;
  }
}

/** Guard for endpoints that operate on a specific user's own data. */
function requireSelf(req, userId) {
  const session = authSession(req);
  if (session) {
    if (session.sub !== userId) { const error = new Error('You can only modify your own profile'); error.status = 403; throw error; }
    return;
  }
  if (!demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => { const index = part.indexOf('='); return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))]; }));
}

function setCookie(res, name, value, { maxAge = 600, httpOnly = true } = {}) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}${secure}`);
}

// Recruiter-only referral attribution: a signed, httpOnly first-party cookie
// (never a value trusted straight from the client) set the moment a visitor
// opens a ?ref=/ /ref/ link, read back only inside the recruiter-registration
// handler — candidates never attach a referral, and it's never re-read later
// to retroactively attribute a role change.
const REFERRAL_COOKIE = 'jm_ref';
const REFERRAL_COOKIE_DAYS = Number(process.env.REFERRAL_COOKIE_DAYS || 30);

function issueReferralCookie(res, code) {
  const value = signedValue({ code, expiresAt: Date.now() + REFERRAL_COOKIE_DAYS * DAY_MS }, sessionSecret);
  setCookie(res, REFERRAL_COOKIE, value, { maxAge: REFERRAL_COOKIE_DAYS * 24 * 3600 });
}

function readReferralCookie(req) {
  const payload = readSignedValue(cookies(req)[REFERRAL_COOKIE], sessionSecret);
  if (!payload || typeof payload.code !== 'string' || payload.expiresAt < Date.now()) return null;
  return payload.code;
}

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // nginx/CloudFront in front — req.ip = real client IP for rate limiting
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://localhost,capacitor://localhost').split(',').map((origin) => origin.trim()));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
  next();
});

// Stripe webhook needs the RAW request body to verify its signature, so this
// is registered with its own express.raw() middleware and placed before the
// global express.json() below — Express runs middleware/routes in
// registration order, so this route's raw-body handling always wins for
// this exact path, and every other route still gets normal JSON parsing.
app.post('/api/billing/stripe/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  try {
    const rawBody = req.body.toString('utf8');
    if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'])) return res.status(400).json({ error: 'Invalid signature' });
    const event = JSON.parse(rawBody);
    const result = await store.transaction((db) => {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const payment = db.payments.find((entry) => entry.id === session.client_reference_id && entry.paymentMethod === 'stripe');
        if (!payment) return { skipped: true };
        payment.paymentReference = session.subscription;
        payment.updatedAt = Date.now();
        const subscription = db.subscriptions.find((entry) => entry.id === payment.subscriptionId);
        if (subscription) subscription.stripeSubscriptionId = session.subscription;
        return { linked: true };
      }
      if (event.type === 'invoice.paid') {
        const invoice = event.data.object;
        if (db.payments.some((entry) => entry.paymentMethod === 'stripe' && entry.invoiceNumber === `stripe-${invoice.id}`)) return { alreadyProcessed: true };
        let payment = db.payments.find((entry) => entry.paymentMethod === 'stripe' && entry.paymentReference === invoice.subscription && entry.status === 'pending');
        if (payment) {
          payment.invoiceNumber = `stripe-${invoice.id}`;
        } else {
          // A renewal, not the first payment — no pre-created local Payment
          // exists yet, so make one against the recruiter this Stripe
          // subscription was linked to in the checkout.session.completed step.
          const subscription = db.subscriptions.find((entry) => entry.stripeSubscriptionId === invoice.subscription);
          if (!subscription) return { skipped: true };
          const now = Date.now();
          payment = {
            id: crypto.randomUUID(), recruiterUserId: subscription.recruiterUserId, subscriptionId: subscription.id,
            ...paymentAmountFields(db, subscription), paymentMethod:'stripe', status: 'pending',
            paymentReference: invoice.subscription, invoiceNumber: `stripe-${invoice.id}`, payerName: null, bankName: null,
            transferDate: null, proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null,
            createdAt: now, updatedAt: now,
          };
          db.payments.push(payment);
        }
        return confirmPayment(db, payment, { source: 'stripe' });
      }
      return { ignored: true };
    });
    if (result?.payment && !result.alreadyConfirmed && result.recruiterEmail) {
      await sendMail({ to: result.recruiterEmail, subject: 'Payment confirmed — JobsMatchNow', text: `Hi ${result.recruiterName || ''},\n\nYour Stripe payment has been confirmed. Your recruiter access is active through ${new Date(result.subscription.currentPeriodEndsAt).toDateString()}.\n\n— JobsMatchNow` }).catch(() => undefined);
    }
    res.json({ received: true });
  } catch {
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// PayPal's webhook also needs the raw body for signature verification
// (delegated to PayPal's own verify-webhook-signature API — see
// providers/paypal.js), so this is registered here too, before the global
// express.json() below, for the same reason as the Stripe webhook above.
app.post('/api/billing/paypal/webhook', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  try {
    const rawBody = req.body.toString('utf8');
    const event = JSON.parse(rawBody);
    if (!(await verifyPaypalSignature(req.headers, event))) return res.status(400).json({ error: 'Invalid signature' });
    const result = await store.transaction((db) => {
      // Each completed sale = one paid period (founder, 2026-11-24: renewals were ignored before). Confirmation is
      // keyed by the sale id, so a resent webhook never extends twice. ACTIVATED alone confirms nothing.
      if (event.event_type !== 'PAYMENT.SALE.COMPLETED') return { ignored: true };
      const paypalSubscriptionId = event.resource?.billing_agreement_id;
      const saleId = event.resource?.id;
      if (!paypalSubscriptionId || !saleId) return { ignored: true };
      const saleKey = `paypal-sale-${saleId}`;
      if (db.payments.some((entry) => entry.paymentMethod === 'paypal' && entry.invoiceNumber === saleKey)) return { alreadyProcessed: true };
      let payment = db.payments.find((entry) => entry.paymentMethod === 'paypal' && entry.paymentReference === paypalSubscriptionId && entry.status === 'pending');
      if (payment) {
        payment.invoiceNumber = saleKey;
      } else {
        // A renewal: copy the first payment's recruiter and plan into a new record.
        const first = db.payments.find((entry) => entry.paymentMethod === 'paypal' && entry.paymentReference === paypalSubscriptionId);
        const subscription = first && db.subscriptions.find((entry) => entry.id === first.subscriptionId);
        if (!subscription) return { skipped: true };
        const now = Date.now();
        payment = {
          id: crypto.randomUUID(), recruiterUserId: subscription.recruiterUserId, subscriptionId: subscription.id,
          ...paymentAmountFields(db, subscription), paymentMethod: 'paypal', status: 'pending',
          paymentReference: paypalSubscriptionId, invoiceNumber: saleKey, payerName: null, bankName: null,
          transferDate: null, proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null, createdAt: now, updatedAt: now,
        };
        db.payments.push(payment);
      }
      return confirmPayment(db, payment, { source: 'paypal' });
    });
    if (result?.payment && !result.alreadyConfirmed && result.recruiterEmail) {
      await sendMail({ to: result.recruiterEmail, subject: 'Payment confirmed — JobsMatchNow', text: `Hi ${result.recruiterName || ''},\n\nYour PayPal payment has been confirmed. Your recruiter access is active through ${new Date(result.subscription.currentPeriodEndsAt).toDateString()}.\n\n— JobsMatchNow` }).catch(() => undefined);
    }
    res.json({ received: true });
  } catch {
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, version: '1.0.0' }));

// Public landing showcase: recent active jobs + demo candidate cards (no PII).
app.get('/api/showcase', async (_req, res, next) => {
  try {
    const db = await store.read();
    const jobs = db.jobs
      .filter((job) => (job.demo || String(job.status).toLowerCase() === 'active') && !isRestricted(job))
      .slice(-10).reverse()
      .map((job) => {
        const employer = db.users.find((user) => user.id === job.employerId);
        return hideExternalCompany(db, { id: job.id, employerId: job.employerId, title: job.title, company: job.company, companyLogo: employer?.companyLogo, logo: job.logo, accent: job.accent, location: job.location, workMode: job.workMode, remoteScope: job.remoteScope, country: job.country, salary: job.salary, type: job.type, department: job.department, status: job.status, createdAt: job.createdAt, requiredSkills: (job.requiredSkills || []).slice(0, 8), description: job.description, responsibilities: (job.responsibilities || []).slice(0, 5), coverImage: job.coverImage, verified: verifiedUser(employer) }, undefined);
      });
    const candidates = db.users
      .filter((user) => user.role === 'candidate' && user.demo)
      .slice(0, 10)
      .map((user) => ({ id: user.id, name: user.name, title: user.title, photo: user.photo, location: user.location, skills: (user.skills || []).slice(0, 4), availability: user.availability, experienceLevel: user.experienceLevel }));
    // "New Matches Hired" (founder, 2026-11-23): pre-launch demo examples only — both people must be demo
    // accounts, so no real member is ever shown publicly. Real hires will feed this later.
    const userById = new Map(db.users.map((user) => [user.id, user]));
    const hires = db.matches
      .filter((m) => m.stage === 'Hired' || m.currentStepId === 'hire')
      .map((m) => ({ m, c: userById.get(m.candidateId), e: userById.get(m.employerId), job: db.jobs.find((j) => j.id === m.jobId) }))
      .filter(({ c, e, job }) => c?.demo === true && e?.demo === true && job)
      .sort((a, b) => Number(b.m.stageChangedAt || b.m.createdAt || 0) - Number(a.m.stageChangedAt || a.m.createdAt || 0))
      .slice(0, 6)
      .map(({ m, c, e, job }) => ({
        id: m.id, hiredAt: m.stageChangedAt || m.createdAt,
        candidate: { name: c.name, title: c.title, photo: c.photo, location: c.location },
        recruiter: { name: e.name, photo: e.photo, company: e.company || job.company },
        job: { title: job.title, company: job.company, accent: job.accent, location: job.location },
      }));
    res.json({ jobs, candidates, hires, demo: true });
  } catch (error) { next(error); }
});

const publicReview = (f) => ({ id: f.id, name: f.name || 'Anonymous', role: f.role, rating: f.rating, message: f.message, createdAt: f.createdAt });
const feedbackLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, bucket: 'feedback' });

// Only approved reviews are shown publicly (moderation).
app.get('/api/feedback', async (_req, res, next) => {
  try {
    const db = await store.read();
    res.json({ reviews: (db.feedback || []).filter((f) => f.type === 'review' && f.approved).slice(-8).reverse().map(publicReview) });
  } catch (error) { next(error); }
});

// Public: which landing-page hero banner to render. Read before login, so no auth.
app.get('/api/site-settings', async (_req, res, next) => {
  try {
    const db = await store.read();
    const settings = db.siteSettings || {};
    const activeLandingBanner = ['default', 'alt', 'image'].includes(settings.activeLandingBanner) ? settings.activeLandingBanner : 'default';
    res.json({
      activeLandingBanner,
      bannerImage: settings.bannerImageExt ? { url: `/api/site-settings/banner-image?v=${settings.bannerImageUpdatedAt || 0}`, updatedAt: settings.bannerImageUpdatedAt || null } : null,
      trialDays: TRIAL_DAYS,
    });
  } catch (error) { next(error); }
});

app.get('/api/site-settings/banner-image', async (req, res, next) => {
  try {
    const db = await store.read();
    const ext = db.siteSettings?.bannerImageExt;
    if (!ext) { const error = new Error('No banner image on file'); error.status = 404; throw error; }
    res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(SITE_DIR, `banner.${ext}`));
  } catch (error) { next(error); }
});

const BLOCKED_WORDS = /\b(fuck|shit|bitch|cunt|nigger|faggot|asshole|whore)\b/i;

app.post('/api/feedback', feedbackLimiter, async (req, res, next) => {
  try {
    const type = oneOf(req.body, 'type', ['review', 'suggestion']);
    const message = reqString(req.body, 'message', { min: 3, max: 1000 });
    if (BLOCKED_WORDS.test(message)) throw new ValidationError('message', 'Please keep it respectful.');
    const name = optString(req.body, 'name', { max: 80 });
    const role = optString(req.body, 'role', { max: 80 });
    const rating = type === 'review' ? Math.max(1, Math.min(5, Math.round(Number(req.body.rating) || 5))) : undefined;
    // In-app suggestion form: area, importance, and (when signed in) who sent it + consent to be contacted.
    const area = type === 'suggestion' ? optString(req.body, 'area', { max: 60 }) : undefined;
    const importance = type === 'suggestion' && ['nice', 'important', 'blocking'].includes(req.body.importance) ? req.body.importance : undefined;
    const session = authSession(req);
    const fromUserId = type === 'suggestion' && session ? session.sub : undefined;
    const contactOk = type === 'suggestion' && req.body.contactOk === true && Boolean(fromUserId);
    // New submissions are held for moderation — never shown until approved.
    const entry = { id: `fb-${crypto.randomUUID().slice(0, 8)}`, type, name: name || 'Anonymous', role, rating, message, approved: false, createdAt: Date.now(),
      ...(area ? { area } : {}), ...(importance ? { importance } : {}), ...(fromUserId ? { fromUserId, contactOk } : {}) };
    await store.transaction((db) => { db.feedback = Array.isArray(db.feedback) ? db.feedback : []; db.feedback.push(entry); });
    res.status(201).json({ ok: true, pending: true });
  } catch (error) { next(error); }
});

// Admin (signed-in admin role): improvement suggestions from the in-app Feedback page, newest first.
app.get('/api/admin/suggestions', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const items = (db.feedback || []).filter((f) => f.type === 'suggestion').slice().reverse().map((f) => {
      const u = f.fromUserId ? db.users.find((x) => x.id === f.fromUserId) : null;
      return { id: f.id, message: f.message, area: f.area || null, importance: f.importance || null, createdAt: f.createdAt, name: u?.name || f.name, role: u?.role || f.role || null, email: f.contactOk ? u?.email || null : null };
    });
    res.json({ suggestions: items });
  } catch (error) { next(error); }
});

// Admin moderation (gated by ADMIN_TOKEN header). List + approve.
function requireAdmin(req) {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.headers['x-admin-token'] !== token) { const error = new Error('Admin access required'); error.status = 403; throw error; }
}
app.get('/api/admin/feedback', async (req, res, next) => {
  try { requireAdmin(req); const db = await store.read(); res.json({ feedback: (db.feedback || []).slice().reverse() }); }
  catch (error) { next(error); }
});
app.post('/api/admin/feedback/:id/approve', async (req, res, next) => {
  try {
    requireAdmin(req);
    const entry = await store.transaction((db) => { const f = (db.feedback || []).find((item) => item.id === req.params.id); if (f) f.approved = true; return f; });
    if (!entry) { const error = new Error('Not found'); error.status = 404; throw error; }
    res.json({ ok: true, entry });
  } catch (error) { next(error); }
});

app.get('/api/integrations', (_req, res) => res.json({
  linkedin: { signInConfigured: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_REDIRECT_URI), talentSyncEnabled: process.env.LINKEDIN_TALENT_SYNC_ENABLED === 'true' },
  platforms: { web: true, pwa: true, ios: true, android: true },
}));

app.get('/api/auth/linkedin', (req, res) => {
  const { LINKEDIN_CLIENT_ID: clientId, LINKEDIN_REDIRECT_URI: redirectUri } = process.env;
  if (!clientId || !redirectUri) return res.redirect('/?linkedin=configure');
  const state = signedValue({ nonce: crypto.randomUUID(), createdAt: Date.now(), native: req.query.platform === 'native' }, sessionSecret);
  setCookie(res, 'jm_oauth_state', state);
  res.redirect(linkedinAuthorizationUrl({ clientId, redirectUri, state, native: req.query.platform === 'native' }));
});

app.get('/api/auth/linkedin/callback', async (req, res, next) => {
  try {
    if (req.query.error) return res.redirect(`/?linkedin=${encodeURIComponent(String(req.query.error))}`);
    const state = String(req.query.state || '');
    const statePayload = readSignedValue(state, sessionSecret);
    if (!statePayload || cookies(req).jm_oauth_state !== state || Date.now() - statePayload.createdAt > 600000) {
      const error = new Error('Invalid or expired OAuth state'); error.status = 401; throw error;
    }
    const { profile, expiresIn } = await exchangeLinkedinCode({ code: String(req.query.code || ''), clientId: process.env.LINKEDIN_CLIENT_ID, clientSecret: process.env.LINKEDIN_CLIENT_SECRET, redirectUri: process.env.LINKEDIN_REDIRECT_URI });
    const session = signedValue({ sub: profile.sub, name: profile.name, email: profile.email, picture: profile.picture, provider: 'linkedin', expiresAt: Date.now() + Math.min(expiresIn * 1000, 86400000) }, sessionSecret);
    setCookie(res, 'jm_session', session, { maxAge: Math.min(expiresIn, 86400) });
    setCookie(res, 'jm_oauth_state', '', { maxAge: 0 });
    // The real person's identity stays in their jm_session cookie only — never
    // copied onto candidate-demo, which anyone can sign into in demo mode.
    res.redirect(statePayload.native ? 'jobmatch://auth/linkedin?success=1' : '/?linkedin=connected');
  } catch (error) { next(error); }
});

app.get('/api/auth/session', (req, res) => {
  const session = readSignedValue(cookies(req).jm_session, sessionSecret);
  if (!session || session.expiresAt < Date.now()) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: { name: session.name, email: session.email, picture: session.picture, provider: session.provider } });
});

app.post('/api/integrations/linkedin/jobs/:jobId/sync', async (req, res, next) => {
  try {
    if (process.env.LINKEDIN_TALENT_SYNC_ENABLED !== 'true' || !process.env.LINKEDIN_JOB_POSTING_TOKEN) { const error = new Error('LinkedIn Talent Solutions partner access is required'); error.status = 403; throw error; }
    const db = await store.read();
    const job = db.jobs.find((item) => item.id === req.params.jobId);
    if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
    const integrationContext = reqString(req.body, 'integrationContext', { max: 128 });
    const response = await fetch('https://api.linkedin.com/rest/simpleJobPostings', { method: 'POST', headers: { Authorization: `Bearer ${process.env.LINKEDIN_JOB_POSTING_TOKEN}`, 'Content-Type': 'application/json', 'LinkedIn-Version': '202603', 'X-Restli-Protocol-Version': '2.0.0' }, body: JSON.stringify(toLinkedinJobPayload(job, integrationContext)) });
    if (!response.ok) { const error = new Error('LinkedIn job sync failed'); error.status = 502; throw error; }
    res.status(202).json({ accepted: true });
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Demo auth: instant profile login, mock SSO, near-instant registration.
// ---------------------------------------------------------------------------

function publicProfile(user) {
  return { id: user.id, role: user.role, kind: user.kind, name: user.name, email: user.email, title: user.title, company: user.company, photo: user.photo, provider: user.provider, completeness: user.completeness, demo: user.demo === true, emailVerified: user.emailVerified !== false };
}

// ---------------------------------------------------------------------------
// Email verification + password reset (mailer-optional).
// ---------------------------------------------------------------------------
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://jobsmatchnow.com').replace(/\/$/, '');
function actionToken(purpose, userId, ttlMs) {
  return signedValue({ purpose, sub: userId, expiresAt: Date.now() + ttlMs }, sessionSecret);
}
function readActionToken(token, purpose) {
  const payload = readSignedValue(token, sessionSecret);
  if (!payload || payload.purpose !== purpose || payload.expiresAt < Date.now() || typeof payload.sub !== 'string') return null;
  return payload;
}
async function sendVerificationEmail(user) {
  const token = actionToken('verify', user.id, 48 * 3600 * 1000);
  const link = `${publicOrigin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMail({ to: user.email, subject: 'Verify your JobsMatchNow email', text: `Welcome to JobsMatchNow! Confirm your email:\n${link}\n\nThis link expires in 48 hours.` });
}

const authLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 30, bucket: 'auth' });

app.get('/api/auth/config', (_req, res) => res.json({ demoAuth, mockSso, passwordMinLength: PASSWORD_MIN_LENGTH, sso: oauthProviders() }));

// ---------------------------------------------------------------------------
// Real SSO (Google / LinkedIn via OpenID Connect) — active when env vars exist.
// ---------------------------------------------------------------------------

app.get('/api/auth/oauth/:provider', (req, res, next) => {
  try {
    const provider = oneOf(req.params, 'provider', ['google', 'linkedin']);
    const role = req.query.role === 'employer' ? 'employer' : 'candidate';
    const state = signedValue({ nonce: crypto.randomUUID(), createdAt: Date.now(), provider, role }, sessionSecret);
    setCookie(res, 'jm_oauth_state', state);
    res.redirect(oauthAuthorizationUrl(provider, state));
  } catch (error) { next(error); }
});

app.get('/api/auth/oauth/:provider/callback', async (req, res, next) => {
  try {
    const provider = oneOf(req.params, 'provider', ['google', 'linkedin']);
    if (req.query.error) return res.redirect(`${APP_PATH}?sso=${encodeURIComponent(String(req.query.error))}`);
    const state = String(req.query.state || '');
    const statePayload = readSignedValue(state, sessionSecret);
    if (!statePayload || statePayload.provider !== provider || cookies(req).jm_oauth_state !== state || Date.now() - statePayload.createdAt > 600000) {
      const error = new Error('Invalid or expired OAuth state'); error.status = 401; throw error;
    }
    const identity = await oauthExchangeCode(provider, String(req.query.code || ''));
    const user = await store.transaction((db) => {
      // 1) returning SSO user; 2) existing real account with the same verified
      // email (link it); 3) brand-new account. Demo accounts can't be claimed.
      let found = db.users.find((item) => item.authProvider === provider && item.authSubject === identity.sub);
      if (!found && identity.email) found = db.users.find((item) => item.demo !== true && item.email && item.email.toLowerCase() === identity.email);
      if (found) {
        Object.assign(found, { authProvider: provider, authSubject: identity.sub, provider, photo: found.photo || identity.picture });
        // Admin accounts only ever authenticate through this Google SSO path
        // (password login for role==='admin' is rejected below), so this is
        // the one place a successful admin login can be logged.
        if (found.role === 'admin') logBillingEvent(db, found.id, 'admin_login_success', 'user', found.id, { provider });
        return found;
      }
      const created = {
        id: `u-${crypto.randomUUID().slice(0, 8)}`, role: statePayload.role, name: identity.name || 'New member', email: identity.email,
        ...(statePayload.role === 'employer' ? { kind: 'company' } : {}),
        authProvider: provider, authSubject: identity.sub, provider,
        title: statePayload.role === 'candidate' ? 'New member' : 'Recruiter',
        photo: identity.picture || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(identity.name || 'user')}`,
        skills: [], languages: [], experienceLevel: 'mid', completeness: 15, onboarding: true, createdAt: Date.now(),
        // The real-SSO redirect can't carry a request body, so this path can't
        // be server-enforced the way /api/auth/register is — the Register
        // modal disables the SSO buttons client-side until the checkbox is
        // checked, and that's the acceptance being recorded here.
        conductAcceptedAt: Date.now(),
      };
      db.users.push(created);
      assignProfileSlug(db, created); // jobsmatchnow.com/firstname.lastname
      track(db, 'signup_completed', { dim: `${actorSide(created)}/${provider}` });
      return created;
    });
    if (user.suspendedAt) return res.redirect(`${APP_PATH}?sso=${encodeURIComponent('account_suspended')}`);
    setCookie(res, 'jm_oauth_state', '', { maxAge: 0 });
    issueSession(res, user);
    res.redirect(`${APP_PATH}?sso=ok`);
  } catch (error) { next(error); }
});

// Demo login dropdown: demo-flagged accounts only — real users are never listed,
// and emails stay out of the listing.
app.get('/api/auth/profiles', async (_req, res, next) => {
  try {
    if (!demoAuth) { const error = new Error('Demo logins are disabled'); error.status = 403; throw error; }
    const db = await store.read();
    res.json({
      profiles: db.users
        // Every seeded demo persona (50+ candidates, 25+ recruiters), never a real or sample account.
        .filter((user) => user.demoTemplate === true && user.demo === true && !user.sample && (user.role === 'candidate' || user.role === 'employer'))
        .map((user) => ({ id: user.id, role: user.role, kind: user.kind, name: user.name, title: user.title, company: user.company, photo: user.photo, demo: true })),
    });
  } catch (error) { next(error); }
});

// Login: { email, password } for real accounts; { userId } instant-login for
// demo-flagged accounts when demo auth is enabled. Both issue a session cookie.
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const db = await store.read();
    let user;
    if (typeof req.body.userId === 'string' && req.body.userId) {
      if (!demoAuth) { const error = new Error('Demo logins are disabled — sign in with your email and password'); error.status = 403; throw error; }
      user = db.users.find((item) => item.id === req.body.userId && item.demo === true);
      if (!user) { const error = new Error('Unknown demo profile'); error.status = 404; throw error; }
    } else {
      const email = reqString(req.body, 'email', { max: 200 }).toLowerCase();
      const password = reqString(req.body, 'password', { max: 200 });
      user = db.users.find((item) => item.email && item.email.toLowerCase() === email);
      // Admin accounts sign in with Google, or with an admin password that was set
      // through a one-time setup link only someone with server access can create
      // (POST /api/admin/password-link). Without that password, password login is refused.
      if (user?.role === 'admin' && !user.passwordHash) {
        await store.transaction((db2) => logBillingEvent(db2, user.id, 'admin_login_blocked_password_attempt', 'user', user.id, {}));
        const error = new Error('Set your admin password with the setup link first (or sign in with Google)'); error.status = 403; throw error;
      }
      // Same error for wrong email and wrong password — no account probing.
      if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
        if (user?.role === 'admin') await store.transaction((db2) => logBillingEvent(db2, user.id, 'admin_login_failed', 'user', user.id, {}));
        const error = new Error('Email or password is incorrect'); error.status = 401; throw error;
      }
      if (user.role === 'admin') await store.transaction((db2) => logBillingEvent(db2, user.id, 'admin_login_success', 'user', user.id, { provider: 'password' }));
    }
    if (user.suspendedAt) { const error = new Error('This account has been suspended. Contact support if you believe this is a mistake.'); error.status = 403; throw error; }
    issueSession(res, user);
    res.json({ user: publicProfile(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/sso', authLimiter, async (req, res, next) => {
  try {
    if (!mockSso) { const error = new Error('Mock SSO is disabled'); error.status = 403; throw error; }
    const provider = oneOf(req.body, 'provider', ['linkedin', 'google']);
    const db = await store.read();
    const user = db.users.find((item) => item.id === `sso-${provider}-demo`);
    if (!user) { const error = new Error('SSO demo profile missing'); error.status = 500; throw error; }
    issueSession(res, user);
    res.json({ user: publicProfile(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const role = oneOf(req.body, 'role', ['candidate', 'employer']);
    const kind = oneOf(req.body, 'kind', ['company', 'headhunter'], { optional: true });
    const provider = oneOf(req.body, 'provider', ['linkedin', 'google', 'email'], { optional: true });
    const name = reqString(req.body, 'name', { max: 120 });
    const email = reqString(req.body, 'email', { max: 200 });
    if (!/.+@.+\..+/.test(email)) throw new ValidationError('email', 'A valid email address is required');
    const password = optString(req.body, 'password', { max: 200 });
    const photo = optString(req.body, 'photo', { max: 500 });
    // Recruiters' company country (founder, 2026-11-24): decides which payment methods they are offered.
    const country = optString(req.body, 'country', { max: 80 });
    // Recruiters' own citizenship (founder, 2026-11-24): with the company country, decides their payment methods.
    const citizenship = optString(req.body, 'citizenship', { max: 80 });
    // Every real account needs a password — DEMO_AUTH only affects the demo
    // personas, never sign-up. The one passwordless path is dev-only mock SSO.
    const mockSsoSignup = mockSso && (provider === 'linkedin' || provider === 'google');
    if ((!mockSsoSignup || password !== undefined) && !validPassword(password)) throw new ValidationError('password', `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    if (req.body.conductAccepted !== true) throw new ValidationError('conductAccepted', 'You must agree to the Code of Conduct to register');
    const user = await store.transaction((db) => {
      const existing = db.users.find((item) => item.email && item.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        // Signing up with a taken email never signs you in as that account.
        // Only dev mock SSO re-uses its own pre-made passwordless account.
        if (mockSsoSignup && existing.demo !== true && !existing.passwordHash && existing.provider === provider) return existing;
        const error = new Error('An account with this email already exists — log in instead'); error.status = 409; throw error;
      }
      // Password accounts need email verification once a mailer is configured;
      // without one (demo/dev) they're auto-verified so the flow stays usable.
      const needsVerification = Boolean(password) && mailerConfigured();
      const created = {
        id: `u-${crypto.randomUUID().slice(0, 8)}`, role, name, email,
        ...(role === 'employer' ? { kind: kind || 'company', ...(country ? { country } : {}) } : {}),
        // Citizenship for both roles (founder, 2026-11-24): decides the payment methods for subscriptions / Premium.
        ...(citizenship ? { nationality: citizenship, citizenship: [citizenship] } : {}),
        ...(password ? { passwordHash: hashPassword(password) } : {}),
        provider: provider || 'email',
        emailVerified: !needsVerification,
        title: role === 'candidate' ? 'New member' : 'Recruiter',
        photo: photo || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
        skills: [], languages: [], experienceLevel: 'mid', completeness: 15, onboarding: true, createdAt: Date.now(),
        conductAcceptedAt: Date.now(),
      };
      // Where the visitor came from (job groups / LinkedIn links, 2026-11-25): only known values, no tracking ids.
      const acq = req.body?.source && typeof req.body.source === 'object' ? req.body.source : {};
      const acquisition = { src: cleanSrc(acq.src), group: typeof acq.group === 'string' ? acq.group.slice(0, 60) : undefined, jobId: typeof acq.jobId === 'string' ? acq.jobId.slice(0, 60) : undefined };
      if (acquisition.src || acquisition.group || acquisition.jobId) created.acquisition = { ...Object.fromEntries(Object.entries(acquisition).filter(([, v]) => v)), at: Date.now() };
      db.users.push(created);
      assignProfileSlug(db, created); // jobsmatchnow.com/firstname.lastname
      if (acquisition.group || acquisition.jobId) track(db, 'grp_register_completed', { dim: acquisition.src || '' });
      if (acquisition.src === 'linkedin') track(db, 'li_signup', { dim: actorSide(created) });
      // Only brand-new accounts count — the dev mock-SSO re-use above returns
      // early and is never a signup.
      track(db, 'signup_completed', { dim: `${actorSide(created)}/${provider || 'email'}` });
      if (role === 'employer') {
        getOrCreateTrialSubscription(db, created.id);
        const referralCode = readReferralCookie(req);
        if (referralCode) attachReferralOnRegister(db, created, referralCode);
      }
      return created;
    });
    if (user.emailVerified === false) await sendVerificationEmail(user).catch((e) => console.error('verify email failed', e.message));
    issueSession(res, user);
    res.status(201).json({ user: publicProfile(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (_req, res) => {
  setCookie(res, AUTH_COOKIE, '', { maxAge: 0 });
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) return res.status(401).json({ authenticated: false });
    const db = await store.read();
    const user = db.users.find((item) => item.id === session.sub);
    if (!user) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, user: publicProfile(user) });
  } catch (error) { next(error); }
});

app.get('/api/auth/verify', async (req, res, next) => {
  try {
    const payload = readActionToken(String(req.query.token || ''), 'verify');
    if (!payload) return res.redirect(`${APP_PATH}?verify=expired`);
    await store.transaction((db) => { const u = db.users.find((item) => item.id === payload.sub); if (u) u.emailVerified = true; });
    res.redirect(`${APP_PATH}?verify=ok`);
  } catch (error) { next(error); }
});

app.post('/api/auth/resend-verification', authLimiter, async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) { const error = new Error('Sign in first'); error.status = 401; throw error; }
    const db = await store.read();
    const user = db.users.find((item) => item.id === session.sub);
    if (user && user.emailVerified === false) await sendVerificationEmail(user).catch(() => undefined);
    res.json({ ok: true, mailer: mailerConfigured() });
  } catch (error) { next(error); }
});

app.post('/api/auth/forgot', authLimiter, async (req, res, next) => {
  try {
    const email = reqString(req.body, 'email', { max: 200 }).toLowerCase();
    const db = await store.read();
    // Passwordless accounts from the old demo sign-up set their first password
    // here too — the emailed link proves control of the address.
    const sameEmail = (item) => item.email && item.email.toLowerCase() === email;
    const user = db.users.find((item) => sameEmail(item) && item.demo !== true && item.role !== 'admin');
    // One log line per request so "I never got the email" can be answered from the server log (founder bug,
    // 2026-11-25). Never the address or the link: only the outcome.
    let outcome;
    if (user) {
      const token = actionToken('reset', user.id, 3600 * 1000);
      const link = `${publicOrigin}${APP_PATH}?reset=${encodeURIComponent(token)}`;
      try {
        const sent = await sendMail({ to: user.email, subject: 'Reset your JobsMatchNow password', text: `Reset your password:\n${link}\n\nThis link expires in 1 hour. If you didn't ask, ignore this email.` });
        outcome = sent && sent.delivered ? 'sent' : 'not sent (mailer off)';
      } catch (error) {
        outcome = `send failed ${[error && error.code, error && error.responseCode].filter(Boolean).join(' ')}`.trim();
      }
    } else {
      const other = db.users.find(sameEmail);
      outcome = !other ? 'no account with this address' : other.role === 'admin' ? 'admin account (uses the admin password setup link)' : 'demo account';
    }
    console.log(`[forgot] ${outcome}`);
    // Founder, 2026-11-25: tell the person when no member account uses that address (registering with a taken
    // address already reveals this; requests are rate-limited). Admin and demo addresses answer the same
    // "no account", so the admin address is never confirmed.
    res.json({ ok: true, mailer: mailerConfigured(), account: Boolean(user) });
  } catch (error) { next(error); }
});

app.post('/api/auth/reset', authLimiter, async (req, res, next) => {
  try {
    const payload = readActionToken(reqString(req.body, 'token', { max: 4000 }), 'reset');
    if (!payload) { const error = new Error('This reset link is invalid or expired'); error.status = 400; throw error; }
    const password = reqString(req.body, 'password', { max: 200 });
    if (!validPassword(password)) throw new ValidationError('password', `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    const user = await store.transaction((db) => {
      const u = db.users.find((item) => item.id === payload.sub);
      if (!u) { const error = new Error('Account not found'); error.status = 404; throw error; }
      // Same gates as /forgot and /login: a reset never revives a suspended,
      // demo or admin account (admins sign in through Google only).
      if (u.suspendedAt || u.demo === true || u.role === 'admin') { const error = new Error('This reset link is invalid or expired'); error.status = 400; throw error; }
      u.passwordHash = hashPassword(password);
      u.emailVerified = true; // proving email control also verifies it
      return u;
    });
    issueSession(res, user);
    res.json({ ok: true, user: publicProfile(user) });
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// GDPR: export my data, delete my account.
// ---------------------------------------------------------------------------
app.get('/api/me/export', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) { const error = new Error('Sign in first'); error.status = 401; throw error; }
    const db = await store.read();
    const me = db.users.find((item) => item.id === session.sub);
    if (!me) { const error = new Error('Account not found'); error.status = 404; throw error; }
    const { passwordHash, ...profile } = me;
    res.setHeader('Content-Disposition', 'attachment; filename="jobsmatchnow-data.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      profile,
      jobs: db.jobs.filter((j) => j.employerId === me.id),
      swipes: db.swipes.filter((s) => s.actorId === me.id),
      matches: db.matches.filter((m) => m.candidateId === me.id || m.employerId === me.id),
      messages: db.messages.filter((m) => m.senderId === me.id),
    });
  } catch (error) { next(error); }
});

app.delete('/api/me', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) { const error = new Error('Sign in first'); error.status = 401; throw error; }
    let coverNames = [];
    await store.transaction((db) => {
      const me = db.users.find((item) => item.id === session.sub);
      if (!me) { const error = new Error('Account not found'); error.status = 404; throw error; }
      if (me.demo === true) { const error = new Error('Demo accounts cannot be deleted'); error.status = 403; throw error; }
      coverNames = db.jobs.filter((j) => j.employerId === me.id && j.coverName).map((j) => j.coverName);
      const myMatchIds = new Set(db.matches.filter((m) => m.candidateId === me.id || m.employerId === me.id).map((m) => m.id));
      const myJobIds = new Set(db.jobs.filter((j) => j.employerId === me.id).map((j) => j.id));
      // Private notes written by this account, or by others about this person or their roles.
      if (Array.isArray(db.notes)) db.notes = db.notes.filter((n) => n.userId !== me.id && n.targetId !== me.id && !myJobIds.has(n.targetId));
      db.users = db.users.filter((u) => u.id !== me.id);
      db.jobs = db.jobs.filter((j) => j.employerId !== me.id);
      db.swipes = db.swipes.filter((s) => s.actorId !== me.id && s.targetId !== me.id);
      db.matches = db.matches.filter((m) => !myMatchIds.has(m.id));
      db.messages = db.messages.filter((m) => !myMatchIds.has(m.matchId) && m.senderId !== me.id);
      db.calls = db.calls.filter((c) => !myMatchIds.has(c.matchId) && c.createdBy !== me.id);
      db.bookmarks = db.bookmarks.filter((b) => b.userId !== me.id);
      if (Array.isArray(db.aiKeys)) db.aiKeys = db.aiKeys.filter((k) => k.id !== me.id); // own AI key goes with the account
      // Funnel counters (db.eventCounts) hold no user ids, so nothing to unlink.
    });
    // Uploaded files go too, on disk and in S3 (Privacy Policy: deleted with the account). Founder, 2026-11-24.
    const filesRemoved = await removeAccountFiles(session.sub, coverNames);
    setCookie(res, AUTH_COOKIE, '', { maxAge: 0 });
    res.json({ ok: true, filesRemoved });
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Profile: wizard saves + resume upload
// ---------------------------------------------------------------------------

app.patch('/api/users/:id', async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    let hiredEffects = null;
    const user = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, item.id);
      if (item.role === 'candidate') {
        const wasHired = item.jobStatus?.kind === 'hired';
        applyCandidateProfile(item, req.body);
        // Rule 1: becoming "hired" closes the other processes, cancels their meetings, thanks each recruiter.
        if (!wasHired && item.jobStatus?.kind === 'hired') hiredEffects = onCandidateHired(db, item, item.jobStatus.matchId);
        item.completeness = candidateCompleteness(item);
        // No starter roles for real candidates any more (founder, 2026-11-23): they were posted under a demo
        // recruiter, and real accounts must never see demo accounts (see matching-pool.js).
      } else { applyRecruiterProfile(item, req.body); item.completeness = recruiterCompleteness(item); }
      return item;
    });
    res.json({ user: selfView(user), ...(hiredEffects ? { effects: hiredEffects } : {}) });
  } catch (error) { next(error); }
});

// "Invite a friend" -- just tracks that an invite was sent (the app has no
// billing/paywall today, so there's nothing yet to actually credit; this
// exists so the count is real data whenever a rewards program is built).
app.post('/api/users/:id/invite', async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    const invitesSent = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      item.invitesSent = (item.invitesSent || 0) + 1;
      return item.invitesSent;
    });
    res.json({ invitesSent });
  } catch (error) { next(error); }
});

// UPLOADS_DIR keeps user files outside the release directory in production,
// so resumes survive deploys (e.g. /var/lib/jobsmatchnow/uploads).
const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(dirname, 'uploads');
const RESUME_DIR = path.join(UPLOADS_ROOT, 'resumes');
const PHOTOS_DIR = path.join(UPLOADS_ROOT, 'photos');
const SITE_DIR = path.join(UPLOADS_ROOT, 'site');
const mirror = (localPath) => mirrorToS3(localPath, UPLOADS_ROOT); // durable copy to S3 when configured
/** Delete an uploaded file on disk AND its S3 copy (else restoreFromS3 brings it back on the next start). */
async function removeUpload(localPath) {
  const existed = await fs.promises.unlink(localPath).then(() => true, () => false);
  await removeFromS3(localPath, UPLOADS_ROOT);
  return existed;
}
/** Every file an account uploaded (CVs and their previews, recommendation letters, photo, verification selfie,
 *  covers of its roles). Payment proofs are kept: accounting law requires them. Real ids are `u-` + 8 hex, so the
 *  `<id>-` / `<id>.` name prefixes can only match this account; other ids only clear exact names. */
async function removeAccountFiles(userId, coverNames = []) {
  const realId = /^u-[0-9a-f]{8}$/.test(userId);
  const names = async (dir) => fs.promises.readdir(dir).catch(() => []);
  let removed = 0;
  if (realId) for (const name of await names(RESUME_DIR)) if (name.startsWith(`${userId}-`)) removed += Number(await removeUpload(path.join(RESUME_DIR, name)));
  for (const dir of [PHOTOS_DIR, VERIFY_DIR]) for (const name of await names(dir)) if (name.startsWith(`${userId}.`)) removed += Number(await removeUpload(path.join(dir, name)));
  for (const name of coverNames) if (name && !name.includes('/') && !name.includes('..')) removed += Number(await removeUpload(path.join(UPLOADS_ROOT, 'covers', name)));
  return removed;
}
await fs.promises.mkdir(RESUME_DIR, { recursive: true });
await fs.promises.mkdir(PHOTOS_DIR, { recursive: true });
await fs.promises.mkdir(SITE_DIR, { recursive: true });
// Restore any previously-uploaded files from S3 (survives instance replacement).
if (s3Enabled()) { await restoreFromS3(UPLOADS_ROOT); await backupToS3(UPLOADS_ROOT); console.log(`uploads: S3 mirror enabled (${process.env.S3_BUCKET})`); }
const RESUME_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/**
 * Demo access rule: the owner always sees their full resume; a recruiter sees
 * it only after a mutual match with that candidate. Everyone else gets the
 * anonymized preview. The viewer identity is resolved in loadResume(): the
 * session always wins, and the ?viewerId param is honored only in demo mode and
 * only for demo-flagged accounts, so a real user's resume can never be unlocked
 * by claiming someone else's id.
 */
function fullResumeAccess(db, viewerId, ownerId) {
  if (!viewerId) return false;
  if (viewerId === ownerId) return true;
  return db.matches.some((match) => match.candidateId === ownerId && match.employerId === viewerId);
}

async function processResume(userId, meta) {
  const originalPath = path.join(RESUME_DIR, meta.storedName);
  const base = path.join(RESUME_DIR, `${userId}-${meta.id}`);
  let pdfPath = meta.ext === 'pdf' ? originalPath : null;
  if (meta.ext === 'docx') {
    const converted = await convertDocxToPdf(originalPath, RESUME_DIR);
    if (converted) { meta.pdfName = path.basename(converted); pdfPath = converted; }
    else {
      // LibreOffice unavailable: mammoth HTML keeps DOCX viewable in-app.
      try { await fs.promises.writeFile(`${base}.html`, await docxToHtml(originalPath)); meta.htmlName = path.basename(`${base}.html`); } catch { /* viewer falls back to text */ }
    }
  }
  try {
    const text = meta.ext === 'docx' ? await extractDocxText(originalPath) : await extractPdfText(originalPath);
    await fs.promises.writeFile(`${base}.txt`, text);
    meta.textName = path.basename(`${base}.txt`);
  } catch { /* preview will report extraction unavailable */ }
  if (pdfPath) {
    const thumb = await pdfThumbnail(pdfPath, `${base}-thumb`);
    if (thumb) meta.thumbName = path.basename(thumb);
    else meta.needsClientThumbnail = true; // uploader's browser renders page 1 with pdf.js and posts it back
  }
  // Mirror the original + every derivative to S3 (no-op when S3 isn't configured).
  for (const name of [meta.storedName, meta.pdfName, meta.htmlName, meta.textName, meta.thumbName]) {
    if (name) await mirror(path.join(RESUME_DIR, name));
  }
  return meta;
}

const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, bucket: 'upload' });

app.post('/api/users/:id/resume', uploadLimiter, express.raw({ type: () => true, limit: '10mb' }), async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    const ext = RESUME_TYPES[req.headers['content-type']];
    if (!ext) { const error = new Error('Only PDF or DOCX resumes are accepted'); error.status = 415; throw error; }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    const originalName = decodeURIComponent(String(req.headers['x-filename'] || `resume.${ext}`)).replace(/[/\\]/g, '_').slice(0, 200);
    const id = crypto.randomUUID();
    const storedName = `${req.params.id}-${id}.${ext}`;
    await fs.promises.writeFile(path.join(RESUME_DIR, storedName), req.body);
    await mirror(path.join(RESUME_DIR, storedName));
    const meta = await processResume(req.params.id, {
      id, originalName, storedName, ext, size: req.body.length, mime: req.headers['content-type'], uploadedAt: Date.now(),
      url: `/api/users/${req.params.id}/resume/original`,
      thumbnailUrl: `/api/users/${req.params.id}/resume/thumbnail`,
    });
    const user = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, item.id);
      item.documents = { ...(item.documents || {}), resume: meta };
      if (item.role === 'candidate') item.completeness = candidateCompleteness(item);
      return item;
    });
    res.status(201).json({ resume: meta, completeness: user.completeness });
  } catch (error) { next(error); }
});

app.post('/api/users/:id/resume/thumbnail', uploadLimiter, express.raw({ type: 'image/png', limit: '2mb' }), async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty thumbnail');
    const resume = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item?.documents?.resume) { const error = new Error('No resume on file'); error.status = 404; throw error; }
      assertDemoActor(req, db, item.id);
      item.documents.resume.thumbName = `${req.params.id}-${item.documents.resume.id}-thumb.png`;
      delete item.documents.resume.needsClientThumbnail;
      return item.documents.resume;
    });
    await fs.promises.writeFile(path.join(RESUME_DIR, resume.thumbName), req.body);
    await mirror(path.join(RESUME_DIR, resume.thumbName));
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

const PHOTO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Real profile-photo upload (camera capture or file picker) — one current
// photo per user, overwritten in place, served back via the GET below.
app.post('/api/users/:id/photo', uploadLimiter, express.raw({ type: () => true, limit: '5mb' }), async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    const ext = PHOTO_TYPES[req.headers['content-type']];
    if (!ext) { const error = new Error('Only PNG, JPEG, or WEBP images are accepted'); error.status = 415; throw error; }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    await assertUploadAllowed(req, req.params.id); // before touching any file
    // Company logo (founder bug, 2026-11-25): its own file and address, so it never replaces the recruiter's own
    // photo or resets their verification.
    if (req.query.kind === 'logo') {
      for (const otherExt of new Set(Object.values(PHOTO_TYPES))) {
        if (otherExt !== ext) await fs.promises.unlink(path.join(PHOTOS_DIR, `${req.params.id}-logo.${otherExt}`)).catch(() => {});
      }
      await fs.promises.writeFile(path.join(PHOTOS_DIR, `${req.params.id}-logo.${ext}`), req.body);
      await mirror(path.join(PHOTOS_DIR, `${req.params.id}-logo.${ext}`));
      const logoUrl = `/api/users/${req.params.id}/logo?v=${Date.now()}`;
      const owner = await store.transaction((db) => {
        const item = db.users.find((entry) => entry.id === req.params.id);
        if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
        assertDemoActor(req, db, item.id);
        item.companyLogo = logoUrl;
        item.logoExt = ext;
        return item;
      });
      return res.status(201).json({ photo: owner.companyLogo });
    }
    for (const otherExt of new Set(Object.values(PHOTO_TYPES))) {
      if (otherExt !== ext) await fs.promises.unlink(path.join(PHOTOS_DIR, `${req.params.id}.${otherExt}`)).catch(() => {});
    }
    await fs.promises.writeFile(path.join(PHOTOS_DIR, `${req.params.id}.${ext}`), req.body);
    await mirror(path.join(PHOTOS_DIR, `${req.params.id}.${ext}`));
    const photoUrl = `/api/users/${req.params.id}/photo?v=${Date.now()}`;
    const user = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, item.id);
      item.photo = photoUrl;
      item.photoExt = ext;
      // A new face means the old selfie check no longer applies.
      if (item.photoVerified || item.verification?.status === 'approved') { item.photoVerified = false; delete item.verification; }
      return item;
    });
    res.status(201).json({ photo: user.photo });
  } catch (error) { next(error); }
});

app.get('/api/users/:id/logo', async (req, res, next) => {
  try {
    const db = await store.read();
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user?.logoExt) { const error = new Error('No logo on file'); error.status = 404; throw error; }
    res.setHeader('Content-Type', `image/${user.logoExt === 'jpg' ? 'jpeg' : user.logoExt}`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PHOTOS_DIR, `${req.params.id}-logo.${user.logoExt}`));
  } catch (error) { next(error); }
});

app.get('/api/users/:id/photo', async (req, res, next) => {
  try {
    const db = await store.read();
    const user = db.users.find((item) => item.id === req.params.id);
    if (!user?.photoExt) { const error = new Error('No photo on file'); error.status = 404; throw error; }
    res.setHeader('Content-Type', `image/${user.photoExt === 'jpg' ? 'jpeg' : user.photoExt}`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PHOTOS_DIR, `${req.params.id}.${user.photoExt}`));
  } catch (error) { next(error); }
});

// --- Photo verification ("Get verified") ------------------------------------
// A member sends a live selfie; an admin compares it with the profile photo and
// approves or rejects it. Only an approved selfie sets photoVerified. Selfies are
// private: served to admins only, never to other members.
const VERIFY_DIR = path.join(UPLOADS_ROOT, 'verification');
fs.mkdirSync(VERIFY_DIR, { recursive: true });

/** Same checks the write transaction makes, run BEFORE a file is written, so a refused call changes nothing on disk. */
async function assertUploadAllowed(req, userId) {
  const db = await store.read();
  const item = db.users.find((entry) => entry.id === userId);
  if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
  assertDemoActor(req, db, item.id);
}
async function removeSelfies(userId) {
  for (const ext of new Set(Object.values(PHOTO_TYPES))) await removeUpload(path.join(VERIFY_DIR, `${userId}.${ext}`));
}

app.post('/api/users/:id/verification-selfie', uploadLimiter, express.raw({ type: () => true, limit: '5mb' }), async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    const ext = PHOTO_TYPES[req.headers['content-type']];
    if (!ext) { const error = new Error('Only PNG, JPEG, or WEBP images are accepted'); error.status = 415; throw error; }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    await assertUploadAllowed(req, req.params.id);
    await removeSelfies(req.params.id); // one selfie on file, whatever its type
    const file = path.join(VERIFY_DIR, `${req.params.id}.${ext}`);
    await fs.promises.writeFile(file, req.body);
    await mirror(file);
    const verification = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, item.id);
      item.verification = { status: 'pending', submittedAt: Date.now(), ext };
      return item.verification;
    });
    res.status(201).json({ verification });
  } catch (error) { next(error); }
});

app.get('/api/admin/verifications', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const pending = db.users.filter((user) => user.verification?.status === 'pending')
      .sort((a, b) => a.verification.submittedAt - b.verification.submittedAt)
      .map((user) => ({ userId: user.id, name: user.name, role: user.role, photo: user.photo, submittedAt: user.verification.submittedAt }));
    res.json({ verifications: pending });
  } catch (error) { next(error); }
});

app.get('/api/admin/verifications/:userId/selfie', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const user = db.users.find((item) => item.id === req.params.userId);
    if (!user?.verification?.ext) { const error = new Error('No selfie on file'); error.status = 404; throw error; }
    res.setHeader('Content-Type', `image/${user.verification.ext === 'jpg' ? 'jpeg' : user.verification.ext}`);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(VERIFY_DIR, `${user.id}.${user.verification.ext}`));
  } catch (error) { next(error); }
});

app.post('/api/admin/verifications/:userId/:decision', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const decision = req.params.decision;
    if (decision !== 'approve' && decision !== 'reject') { const error = new Error('Unknown decision'); error.status = 404; throw error; }
    const reason = optString(req.body || {}, 'reason', { max: 300 });
    const verification = await store.transaction((db) => {
      const user = db.users.find((item) => item.id === req.params.userId);
      if (!user?.verification) { const error = new Error('No verification request'); error.status = 404; throw error; }
      user.verification = { ...user.verification, status: decision === 'approve' ? 'approved' : 'rejected', reviewedAt: Date.now(), ...(reason ? { reason } : {}) };
      user.photoVerified = decision === 'approve';
      logBillingEvent(db, session.sub, `verification_${decision === 'approve' ? 'approved' : 'rejected'}`, 'user', user.id, reason ? { reason } : {});
      return user.verification;
    });
    if (decision === 'reject') await removeSelfies(req.params.userId); // not kept once reviewed
    res.json({ verification });
  } catch (error) { next(error); }
});

// Give every seed candidate a realistic on-disk resume (with contact details,
// so the pre-match anonymization is demonstrable). Idempotent.
await (async () => {
  const db = await store.read();
  const seedCandidates = db.users.filter((user) => user.role === 'candidate' && !user.documents?.resume);
  for (const candidate of seedCandidates) {
    const phone = `+84 90${String(Math.abs([...candidate.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % 10000000).padStart(7, '0')}`;
    const lines = [
      candidate.name,
      `${candidate.title} · ${candidate.location || ''}`,
      `Email: ${candidate.email || 'hello@example.com'}   Phone: ${phone}`,
      '',
      'SUMMARY',
      `${candidate.experienceLevel} professional focused on ${candidate.skills.slice(0, 3).join(', ')}.`,
      'Track record of shipping user-centred work with cross-functional teams.',
      '',
      'SKILLS',
      candidate.skills.join(' · '),
      '',
      'LANGUAGES',
      candidate.languages.join(' · '),
      '',
      'EXPERIENCE',
      `${candidate.title} — most recent role`,
      'Led projects end-to-end, from discovery through launch and iteration.',
      'Partnered with product and engineering to raise the craft bar.',
    ];
    const id = crypto.randomUUID();
    const storedName = `${candidate.id}-${id}.pdf`;
    await fs.promises.writeFile(path.join(RESUME_DIR, storedName), makeSimplePdf(lines));
    const meta = await processResume(candidate.id, {
      id, originalName: `${candidate.name.replace(/\s+/g, '-')}-Resume.pdf`, storedName, ext: 'pdf', size: 0, mime: 'application/pdf', uploadedAt: Date.now(),
      url: `/api/users/${candidate.id}/resume/original`, thumbnailUrl: `/api/users/${candidate.id}/resume/thumbnail`,
    });
    meta.size = (await fs.promises.stat(path.join(RESUME_DIR, storedName))).size;
    await store.transaction((inner) => {
      const item = inner.users.find((entry) => entry.id === candidate.id);
      if (item && !item.documents?.resume) item.documents = { ...(item.documents || {}), resume: meta };
    });
  }
})();

async function loadResume(req) {
  const db = await store.read();
  const user = db.users.find((entry) => entry.id === req.params.id);
  const resume = user?.documents?.resume;
  if (!resume) { const error = new Error('No resume on file'); error.status = 404; throw error; }
  // Session identity wins; the query param only counts in demo mode, and even
  // then only for demo-flagged viewers (real identities need their session).
  const session = authSession(req);
  let viewerId = session ? session.sub : (demoAuth && typeof req.query.viewerId === 'string' ? req.query.viewerId : '');
  if (!session && viewerId) {
    const claimed = db.users.find((item) => item.id === viewerId);
    if (claimed && claimed.demo !== true) viewerId = '';
  }
  return { db, user, resume, viewerId };
}

// Descriptor the in-app viewer uses to decide how to render.
app.get('/api/users/:id/resume/view', async (req, res, next) => {
  try {
    const { db, resume, viewerId } = await loadResume(req);
    const unlocked = fullResumeAccess(db, viewerId, req.params.id);
    const tools = await detectTools();
    if (!unlocked) return res.json({ mode: 'preview', name: 'Anonymized resume', previewUrl: `/api/users/${req.params.id}/resume/preview?viewerId=${encodeURIComponent(viewerId)}` });
    const hasPdf = resume.ext === 'pdf' || resume.pdfName;
    res.json({
      mode: hasPdf ? 'pdf' : resume.htmlName ? 'html' : 'text',
      name: resume.originalName, size: resume.size, uploadedAt: resume.uploadedAt, converter: tools.soffice ? 'libreoffice' : 'mammoth',
      pdfUrl: hasPdf ? `/api/users/${req.params.id}/resume/pdf?viewerId=${encodeURIComponent(viewerId)}` : undefined,
      htmlUrl: resume.htmlName ? `/api/users/${req.params.id}/resume/html?viewerId=${encodeURIComponent(viewerId)}` : undefined,
      textUrl: `/api/users/${req.params.id}/resume/preview?viewerId=${encodeURIComponent(viewerId)}`,
      originalUrl: `/api/users/${req.params.id}/resume/original?viewerId=${encodeURIComponent(viewerId)}`,
    });
  } catch (error) { next(error); }
});

app.get('/api/users/:id/resume/pdf', async (req, res, next) => {
  try {
    const { db, resume, viewerId } = await loadResume(req);
    if (!fullResumeAccess(db, viewerId, req.params.id)) { const error = new Error('Full resume unlocks after a mutual match'); error.status = 403; throw error; }
    const fileName = resume.ext === 'pdf' ? resume.storedName : resume.pdfName;
    if (!fileName) { const error = new Error('No PDF rendition available'); error.status = 404; throw error; }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resume.originalName.replace(/\.docx$/i, '.pdf'))}"`);
    res.sendFile(path.join(RESUME_DIR, fileName));
  } catch (error) { next(error); }
});

app.get('/api/users/:id/resume/html', async (req, res, next) => {
  try {
    const { db, resume, viewerId } = await loadResume(req);
    if (!fullResumeAccess(db, viewerId, req.params.id)) { const error = new Error('Full resume unlocks after a mutual match'); error.status = 403; throw error; }
    if (!resume.htmlName) { const error = new Error('No HTML rendition available'); error.status = 404; throw error; }
    res.json({ html: await fs.promises.readFile(path.join(RESUME_DIR, resume.htmlName), 'utf8') });
  } catch (error) { next(error); }
});

// Anonymized text preview: available pre-match (consent-first).
app.get('/api/users/:id/resume/preview', async (req, res, next) => {
  try {
    const { db, user, resume, viewerId } = await loadResume(req);
    if (!resume.textName) return res.json({ text: '', note: 'Text extraction unavailable for this file.' });
    const raw = await fs.promises.readFile(path.join(RESUME_DIR, resume.textName), 'utf8');
    const unlocked = fullResumeAccess(db, viewerId, req.params.id);
    res.json({ text: unlocked ? raw : anonymizeText(raw, user), anonymized: !unlocked });
  } catch (error) { next(error); }
});

app.get('/api/users/:id/resume/thumbnail', async (req, res, next) => {
  try {
    const { resume } = await loadResume(req);
    if (!resume.thumbName) { const error = new Error('No thumbnail'); error.status = 404; throw error; }
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(path.join(RESUME_DIR, resume.thumbName));
  } catch (error) { next(error); }
});

app.get('/api/users/:id/resume/original', async (req, res, next) => {
  try {
    const { db, resume, viewerId } = await loadResume(req);
    if (!fullResumeAccess(db, viewerId, req.params.id)) { const error = new Error('Full resume unlocks after a mutual match'); error.status = 403; throw error; }
    res.setHeader('Content-Type', resume.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(resume.originalName)}"`);
    res.sendFile(path.join(RESUME_DIR, resume.storedName));
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Recommendation letters: PDF, Word or image files a candidate uploads to the
// Recommendations card. Same access rule as the full resume: the owner and
// recruiters with a mutual match can open them; others see only that they exist.
// The file type comes from the bytes, never from the client's Content-Type.
// ---------------------------------------------------------------------------
const MAX_REC_DOCS = 5;
function sniffRecDoc(buf) {
  const head = buf.subarray(0, 12);
  if (head.subarray(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf', inline: true };
  if (head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG') return { ext: 'png', mime: 'image/png', inline: true };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg', inline: true };
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp', inline: true };
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', inline: false };
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return { ext: 'doc', mime: 'application/msword', inline: false };
  return null;
}
const publicRecDoc = (userId, d) => ({ id: d.id, originalName: d.originalName, ext: d.ext, size: d.size, uploadedAt: d.uploadedAt, url: `/api/users/${userId}/recommendation-docs/${d.id}` });

app.post('/api/users/:id/recommendation-docs', uploadLimiter, express.raw({ type: () => true, limit: '10mb' }), async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    const kind = sniffRecDoc(req.body);
    if (!kind) { const error = new Error('Upload a PDF, Word document (.docx/.doc) or image (PNG, JPG, WebP)'); error.status = 415; throw error; }
    const originalName = decodeURIComponent(String(req.headers['x-filename'] || `recommendation.${kind.ext}`)).replace(/[/\\\r\n"]/g, '_').slice(0, 160);
    const id = crypto.randomUUID();
    const storedName = `${req.params.id}-rec-${id}.${kind.ext}`;
    const doc = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, item.id);
      if (item.role !== 'candidate') { const error = new Error('Only candidates upload recommendation letters'); error.status = 403; throw error; }
      const docs = item.documents?.recommendationDocs || [];
      if (docs.length >= MAX_REC_DOCS) { const error = new Error(`Up to ${MAX_REC_DOCS} recommendation letters`); error.status = 400; throw error; }
      const meta = { id, originalName, storedName, ext: kind.ext, mime: kind.mime, size: req.body.length, uploadedAt: Date.now() };
      item.documents = { ...(item.documents || {}), recommendationDocs: [...docs, meta] };
      return meta;
    });
    await fs.promises.writeFile(path.join(RESUME_DIR, storedName), req.body);
    await mirror(path.join(RESUME_DIR, storedName));
    res.status(201).json({ doc: publicRecDoc(req.params.id, doc) });
  } catch (error) { next(error); }
});

app.get('/api/users/:id/recommendation-docs/:docId', async (req, res, next) => {
  try {
    const db = await store.read();
    const user = db.users.find((entry) => entry.id === req.params.id);
    const doc = user?.documents?.recommendationDocs?.find((d) => d.id === req.params.docId);
    if (!doc) { const error = new Error('Not found'); error.status = 404; throw error; }
    const session = authSession(req);
    if (!fullResumeAccess(db, session?.sub, req.params.id)) { const error = new Error('Recommendation letters open after a mutual match'); error.status = 403; throw error; }
    const kind = sniffRecDoc(await fs.promises.readFile(path.join(RESUME_DIR, doc.storedName)).catch(() => Buffer.alloc(0)));
    if (!kind) { const error = new Error('File missing'); error.status = 404; throw error; }
    res.setHeader('Content-Type', kind.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${kind.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(doc.originalName)}"`);
    res.sendFile(path.join(RESUME_DIR, doc.storedName));
  } catch (error) { next(error); }
});

app.delete('/api/users/:id/recommendation-docs/:docId', async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    const removed = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, item.id);
      const docs = item.documents?.recommendationDocs || [];
      const doc = docs.find((d) => d.id === req.params.docId);
      if (!doc) { const error = new Error('Not found'); error.status = 404; throw error; }
      item.documents = { ...item.documents, recommendationDocs: docs.filter((d) => d !== doc) };
      return doc;
    });
    await fs.promises.unlink(path.join(RESUME_DIR, removed.storedName)).catch(() => undefined);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Upload a cover letter (founder, 2026-11-26): PDF / DOCX / TXT → its text, to fill the profile's cover letter box.
// The file is read in a temporary folder and deleted at once; nothing is stored until the candidate saves the form.
app.post('/api/users/:id/cover-letter/extract', express.raw({ type: 'application/octet-stream', limit: '5mb' }), async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ValidationError('file', 'Choose a cover letter file');
    const name = decodeURIComponent(String(req.headers['x-filename'] || 'letter.txt')).slice(0, 200);
    const ext = (name.match(/\.(pdf|docx|txt|md)$/i)?.[1] || '').toLowerCase();
    if (!ext) throw new ValidationError('file', 'Use a PDF, Word (.docx) or text file');
    let text = '';
    if (ext === 'txt' || ext === 'md') text = req.body.toString('utf8');
    else {
      const tmp = path.join(os.tmpdir(), `cl-${crypto.randomUUID()}.${ext}`);
      try { await fs.promises.writeFile(tmp, req.body); text = ext === 'docx' ? await extractDocxText(tmp) : await extractPdfText(tmp); }
      finally { await fs.promises.unlink(tmp).catch(() => undefined); }
    }
    text = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new ValidationError('file', 'No text found in this file (a scanned image?). Paste the text instead.');
    res.json({ text: text.slice(0, 4000), length: text.length });
  } catch (error) { next(error); }
});

// Auto-fill the candidate profile from the uploaded resume's extracted text.
// Returns parsed fields for the wizard to pre-fill; never persisted here.
app.post('/api/users/:id/resume/autofill', async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    const db = await store.read();
    const user = db.users.find((item) => item.id === req.params.id);
    const resume = user?.documents?.resume;
    if (!resume?.textName) throw new ValidationError('resume', 'Upload a resume first, then auto-fill');
    const text = await fs.promises.readFile(path.join(RESUME_DIR, resume.textName), 'utf8');
    res.json(await parseResumeToProfile(text));
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Job postings: create, update, paste-import parsing
// ---------------------------------------------------------------------------

const JOB_ACCENTS = ['#3d5afe', '#ff5a5f', '#00a884', '#8b5cf6', '#f59e0b', '#0ea5e9', '#e11d48'];
// Fair-use job controls (spec: "unlimited legitimate postings" + reasonable-use
// protection). Thresholds live in config, never hard-block a legitimate user.
const JOB_EXPIRY_DAYS = 30;
const ACTIVE_JOB_REVIEW_THRESHOLD = Number(process.env.ACTIVE_JOB_REVIEW_THRESHOLD || 50);
// Statuses a candidate must never see or act on: an unpublished draft, a
// lapsed posting, or one an admin has taken down. Each stays fully visible to
// the recruiter who owns it (to finish, renew, or read the suspension reason).
const HIDDEN_FROM_CANDIDATES = ['draft', 'expired', 'suspended', 'removed']; // removed: JobFinder listings taken down
const isLiveStatus = (status) => String(status).toLowerCase() === 'active';

/** Fire role_posted the first time a job goes live (never again on pause→active toggles). */
function trackRolePosted(db, employer, job, source) {
  if (job.rolePostedTracked) return;
  // Categorical only: no salary amounts or coordinates in analytics.
  job.rolePostedTracked = track(db, 'role_posted', { demo: involvesDemo(employer, job), dim: source });
}

// Move promoted cards to the front, in place, preserving the relative order of
// both groups. Nothing else about a card changes — the match score a promoted
// card shows is the score it earned, so paid reach never edits the explanation.
function sortPromotedFirst(cards) {
  cards.sort((a, b) => Number(Boolean(b.promoted)) - Number(Boolean(a.promoted)));
  return cards;
}

/**
 * The one place a job transitions into "published". Runs the entitlement check,
 * records which allowance paid for the posting, consumes that allowance, and
 * freezes match-relevant fields on free-tier posts — all inside the caller's
 * transaction, so a rejected publish consumes nothing.
 *
 * Called from both create (POST with status=active) and update (PATCH moving a
 * draft to active), because a recruiter can publish either way.
 *
 * While ENTITLEMENTS_ENFORCED is false the verdict is logged but never blocks —
 * that is the deliberate observe-before-enforce rollout, and the kill switch if
 * enforcement ever misfires in production.
 */
function applyPublishEntitlement(db, employer, job) {
  const subscription = findSubscription(db, employer.id);

  /* Spam control that is actually a control: a company email domain or a
   * company LinkedIn page. Gated on the same kill switch as the plan limits so
   * it can be turned off instantly if it misfires on real recruiters, and
   * exempt accounts (demo, admin) skip it entirely. */
  if (!isBillingExempt(employer)) {
    const verification = recruiterVerification(employer);
    if (!verification.verified) {
      logBillingEvent(db, employer.id, 'job_publish_blocked', 'job', job.id, {
        code: 'RECRUITER_NOT_VERIFIED', enforced: entitlementsEnforced(),
      });
      if (entitlementsEnforced()) {
        const error = new Error(verification.message);
        error.status = 403;
        error.code = 'RECRUITER_NOT_VERIFIED';
        throw error;
      }
    }
  }

  // A 60-day term starts now, whether this is a first publish or a re-publish.
  startPostingTerm(job);

  const verdict = checkPublishAllowed(db, employer, subscription);

  if (!verdict.allowed) {
    logBillingEvent(db, employer.id, 'job_publish_blocked', 'job', job.id, {
      code: verdict.code, enforced: entitlementsEnforced(),
    });
    if (entitlementsEnforced()) {
      const error = new Error(verdict.message);
      error.status = 402;
      error.code = verdict.code;
      error.details = { nextFreeJobAvailableAt: verdict.nextFreeJobAvailableAt ?? null, activeJobCount: verdict.activeJobCount, activeJobLimit: verdict.activeJobLimit };
      throw error;
    }
    return null; // shadow mode: allow through, having recorded what would have happened
  }

  job.postingSource = verdict.postingSource;
  if (verdict.postingSource === 'free_base') {
    consumeFreeJobAllowance(db, employer, subscription, job);
    lockMatchFieldsOnPublish(job);
  } else if (verdict.postingSource === 'referral_credit') {
    consumeReferralJobCredit(db, employer, job);
    lockMatchFieldsOnPublish(job);
  }
  return verdict;
}

// Starter "sample" content was retired on 2026-11-23: real accounts never see demo or invented profiles.
// Old sample:true records stay in the database and are hidden by matching-pool.js.
const importedJobMissing = (job) => [
  !job.salaryRange && 'salary',
  !job.workMode && 'work mode',
  (!job.location || job.location === 'Review location') && 'location',
  !job.requiredSkillsDetail?.length && 'skills',
  !job.culture?.length && 'culture',
  !job.interviewProcess?.length && 'hiring process',
].filter(Boolean);

/** Claude fallback settings for an import: only allowlisted emails, only with the account's own saved Claude key. */
function importAiFor(db, employer) {
  if (!importAiAllowed(employer?.email)) return null;
  const rec = aiKeyRecOf(db, employer.id);
  if (!rec || rec.provider !== 'anthropic') return { allowed: true, key: null };
  try { return { allowed: true, key: decryptAiKey(rec.enc, aiKeySecret()), model: rec.model || undefined }; } catch { return { allowed: true, key: null }; }
}

const IMPORT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
const IMPORT_MODES = ['Remote', 'Hybrid', 'On-site', 'Flexible'];
const pickEnum = (value, list) => { const k = String(value || '').toLowerCase().replace(/[^a-z]/g, ''); return k ? list.find((x) => x.toLowerCase().replace(/[^a-z]/g, '') === k) : undefined; };

async function importJobDrafts(employerId, sourceSystem, entries, { ai = null } = {}) {
  const prepared = [];
  const aiStats = { used: 0, failed: 0, reason: '' };
  for (let index = 0; index < entries.length; index += 4) {
    const batch = await Promise.all(entries.slice(index, index + 4).map(async (entry) => {
      // 1. Built-in, section-aware parser on the row's text.
      const base = heuristicParse(entry.rawText, entry.url);
      let parsed = { ...base, title: entry.title || base.title, externalUrl: entry.url || base.externalUrl };
      // 2. Claude, only when the parser found too little and the account may use it (founder, 2026-11-25).
      if (ai?.allowed && parseStrength(base).weak) {
        if (!ai.key) aiStats.reason = 'no_key';
        else {
          const r = await aiParseJob(entry.description || entry.rawText, { key: ai.key, model: ai.model });
          if (r.ok) {
            aiStats.used += 1;
            // Claude ran because the parser found too little: its fields win (the file's columns still win below).
            parsed = { ...parsed, ...r.fields };
            if (r.fields.description) parsed.aiSummary = r.fields.description;
          } else { aiStats.failed += 1; aiStats.reason = r.reason; }
        }
      }
      // 3. The file's own columns win over any guess.
      const type = pickEnum(entry.employmentType, IMPORT_TYPES); if (type) parsed.type = type;
      const mode = pickEnum(entry.workMode, IMPORT_MODES); if (mode) parsed.workMode = mode;
      if (entry.location) parsed.location = entry.location.slice(0, 120);
      const salary = parseSalaryText(entry.salary); if (salary) parsed.salaryRange = salary;
      if (entry.company) parsed.company = entry.company.slice(0, 80);
      if (entry.recruiterName) parsed.recruiterName = entry.recruiterName.slice(0, 80);
      // Private recruiter contact (JobFinder): the file's columns first, else what the parser found in the text.
      const fileEmail = String(entry.contactEmail || '').trim(); const filePhone = String(entry.contactPhone || '').trim();
      parsed.contactEmail = EMAIL_RE.test(fileEmail) ? fileEmail : (EMAIL_RE.test(parsed.contactEmail || '') ? parsed.contactEmail : undefined);
      parsed.contactPhone = validPhone(filePhone) ? filePhone : (validPhone(parsed.contactPhone || '') ? parsed.contactPhone : undefined);
      const missing = [
        !parsed.salaryRange && 'salary',
        !parsed.workMode && 'work mode',
        !parsed.location && 'location',
        !parsed.requiredSkillsDetail?.length && 'skills',
        !parsed.culture?.length && 'culture',
        !parsed.interviewProcess?.length && 'hiring process',
      ].filter(Boolean);
      return { entry, parsed, missing, metadata: importMetadata(sourceSystem, entry) };
    }));
    prepared.push(...batch);
  }

  // The file's job description goes, as written, into Role details (fullDescription); the short summary is
  // its first real paragraph (founder, 2026-11-25: the whole text had landed in the short summary).
  const fullDescriptionOf = (entry) => String(entry.description || entry.rawText || '').replace(/\r\n/g, '\n').trim().slice(0, 20000);
  const summaryOf = summaryFromText;
  // Parsed fields that applyJob does not take (company) or that we set ourselves.
  const jobFields = (parsed) => { const { company, aiSummary, yearsExperience, contactEmail, contactPhone, ...rest } = parsed; return rest; };
  const contactOfParsed = (p) => ({ ...(p.contactEmail ? { email: p.contactEmail } : {}), ...(p.contactPhone ? { phone: p.contactPhone } : {}) });
  const setCompany = (job, parsed, employer) => {
    if (!parsed.company) return false;
    const own = employer.company || employer.name;
    if (job.company && job.company !== own) return false; // someone already set a company
    job.company = parsed.company; job.logo = parsed.company.trim()[0].toUpperCase();
    return true;
  };
  return store.transaction((db) => {
    const employer = db.users.find((user) => user.id === employerId && user.role === 'employer');
    if (!employer) throw new ValidationError('employerId', 'Unknown recruiter account');
    // JobFinder's imports are external listings: they go live at once, without the salary rule (founder, 2026-11-25).
    // Real recruiters' imports stay drafts until they meet the publish rules.
    const goLive = isJobFinderUser(employer);
    const publish = (job) => {
      if (!goLive || job.status !== 'draft') return;
      job.status = 'active';
      if (!job.salaryRange && (!job.salary || job.salary === 'Review salary')) job.salary = 'Salary not disclosed';
    };
    const jobs = [];
    let skipped = 0;
    let updated = 0;
    const duplicates = [];
    for (const item of prepared) {
      const duplicate = db.jobs.find((job) => job.employerId === employerId
        && job.sourceSystem === item.metadata.sourceSystem
        && job.sourceJobId === item.metadata.sourceJobId);
      if (duplicate) {
        // Same file again: fill what is still empty (older imports), never overwrite the recruiter's edits.
        const p = item.parsed; const d = duplicate; let changed = false;
        const full = fullDescriptionOf(item.entry);
        const preFix = !d.fullDescription; // imported before 2026-11-25: its auto-filled fields can be refreshed
        if (preFix && full) {
          const oldAutoSummary = !d.description || d.description.length > 400 || item.entry.rawText.startsWith(d.description) || item.entry.rawText.replace(/\s+/g, ' ').includes(d.description.slice(0, 80));
          d.fullDescription = full;
          if (oldAutoSummary) d.description = p.aiSummary || summaryOf(full);
          changed = true;
        }
        // Skills the old parser filled in (same list it would pick) count as untouched.
        const oldAuto = preFix && JSON.stringify((d.requiredSkills || []).slice().sort()) === JSON.stringify(legacySkills(item.entry.rawText).slice().sort());
        if (p.requiredSkillsDetail?.length && (!d.requiredSkillsDetail?.length || oldAuto)) { applyJob(d, { requiredSkillsDetail: p.requiredSkillsDetail }); changed = true; }
        for (const k of ['niceToHaves', 'requiredLanguages', 'benefits', 'responsibilities']) {
          if (p[k]?.length && !d[k]?.length) { applyJob(d, { [k]: p[k] }); changed = true; }
        }
        if (preFix && p.seniority && p.seniority !== d.seniority && (!d.seniority || d.seniority === 'mid')) { applyJob(d, { seniority: p.seniority }); changed = true; }
        if (p.location && (!d.location || d.location === 'Review location')) { d.location = p.location; changed = true; }
        if (p.workMode && (!d.workMode || (preFix && d.workMode === 'Flexible'))) { d.workMode = p.workMode; changed = true; }
        if (p.salaryRange && !d.salaryRange) { applyJob(d, { salaryRange: p.salaryRange }); changed = true; }
        if (setCompany(d, p, employer)) changed = true;
        if (goLive) { // fill only the empty contact fields
          const rec = jobContactRec(db, d.id) || {};
          const fill = { ...(!rec.email && p.contactEmail ? { email: p.contactEmail } : {}), ...(!rec.phone && p.contactPhone ? { phone: p.contactPhone } : {}) };
          if (Object.keys(fill).length) { setJobContact(db, d.id, fill); changed = true; }
        }
        if (p.recruiterName && !d.recruiterName) { applyJob(d, { recruiterName: p.recruiterName }); changed = true; }
        if (d.status === 'draft' && goLive) { publish(d); changed = true; }
        if (changed) { d.updatedAt = Date.now(); updated += 1; } else skipped += 1;
        continue;
      }
      // Duplicate guardrail (founder, 2026-11-26): the same role arriving another way (other file, LinkedIn paste,
      // job link, Scrapy) or twice in one file is skipped and named, never created twice.
      const same = findImportDuplicate(db, employerId, {
        urls: [item.metadata.sourceUrl, item.parsed.externalUrl],
        title: item.parsed.title, company: item.parsed.company || employer.company || employer.name, location: item.parsed.location,
      });
      if (same) { skipped += 1; duplicates.push({ title: item.parsed.title || same.title, existingId: same.id, existingTitle: same.title }); continue; }
      const job = {
        id: `j-${crypto.randomUUID().slice(0, 8)}`,
        employerId,
        company: employer.company || employer.name,
        logo: (employer.company || employer.name || '?').trim()[0].toUpperCase(),
        accent: JOB_ACCENTS[db.jobs.length % JOB_ACCENTS.length],
        requiredSkills: [],
        requiredSkillsDetail: [],
        requiredLanguages: [],
        culture: [],
        mission: employer.about ? employer.about.slice(0, 80) : 'Imported for review.',
        responseTime: '< 1 week',
        applicants: 0,
        status: 'draft',
        type: 'Full-time',
        workMode: 'Flexible',
        location: 'Review location',
        salary: 'Review salary',
        experienceLevel: 'mid',
        description: item.parsed.description || item.entry.rawText.slice(0, 400),
        createdAt: Date.now(),
      };
      applyJob(job, jobFields(item.parsed));
      setCompany(job, item.parsed, employer);
      const full = fullDescriptionOf(item.entry);
      if (full) { job.fullDescription = full; job.description = item.parsed.aiSummary || summaryOf(full); }
      Object.assign(job, item.metadata, { internalJobId: job.id, importNeedsReview: item.missing });
      publish(job);
      if (goLive && (item.parsed.contactEmail || item.parsed.contactPhone)) setJobContact(db, job.id, contactOfParsed(item.parsed));
      if (!job.screeningQuestions?.length && job.requiredSkillsDetail?.length) job.screeningQuestions = suggestScreeningQuestions(job);
      if (!job.geo && employer.geo) job.geo = employer.geo;
      db.jobs.push(job);
      jobs.push(job);
    }
    return { jobs, skipped, updated, duplicates, live: goLive, ai: ai?.allowed ? { used: aiStats.used, failed: aiStats.failed, reason: aiStats.reason || undefined } : undefined };
  });
}

app.post('/api/jobs/import-file', express.raw({ type: 'application/octet-stream', limit: '3mb' }), async (req, res, next) => {
  try {
    const employerId = resolveActor(req, reqString(req.query, 'employerId', { max: 128 }));
    const filename = decodeURIComponent(reqString(req.headers, 'x-filename', { max: 200 }));
    const sourceSystem = optString(req.query, 'sourceSystem', { max: 40 }) || 'file';
    if (!/^[a-z0-9_-]+$/i.test(sourceSystem)) throw new ValidationError('sourceSystem', 'Choose a valid source');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new ValidationError('file', 'Choose a job feed file');
    const db = await store.read();
    const employer = db.users.find((user) => user.id === employerId && user.role === 'employer');
    if (!employer) throw new ValidationError('employerId', 'Unknown recruiter account');
    assertDemoActor(req, db, employerId);
    let entries;
    try { entries = parseJobImportFile(req.body.toString('utf8'), filename, sourceSystem); }
    catch (error) { throw new ValidationError('file', error.message); }
    if (!entries.length) throw new ValidationError('file', 'No jobs were found in that file');
    const result = await importJobDrafts(employerId, sourceSystem, entries.slice(0, 50), { ai: importAiFor(db, employer) });
    res.status(201).json({ ...result, found: entries.length });
  } catch (error) { next(error); }
});

app.post('/api/jobs/import-linkedin', async (req, res, next) => {
  try {
    const employerId = resolveActor(req, reqString(req.body, 'employerId', { max: 128 }));
    const db = await store.read();
    const employer = db.users.find((user) => user.id === employerId && user.role === 'employer');
    if (!employer) throw new ValidationError('employerId', 'Unknown recruiter account');
    assertDemoActor(req, db, employerId);
    let entries;
    try { entries = normalizeLinkedInImports(req.body.jobs); }
    catch (error) { throw new ValidationError('jobs', error.message); }
    const result = await importJobDrafts(employerId, 'linkedin_manual', entries, { ai: importAiFor(db, employer) });
    res.status(201).json({ ...result, found: entries.length });
  } catch (error) { next(error); }
});

app.post('/api/jobs', async (req, res, next) => {
  try {
    const employerId = resolveActor(req, reqString(req.body, 'employerId', { max: 128 }));
    // Which UI posted it — analytics only, never stored on the job.
    const postSource = oneOf(req.body, 'postSource', ['editor', 'quick_post'], { optional: true }) || 'editor';
    const job = await store.transaction((db) => {
      const employer = db.users.find((user) => user.id === employerId && user.role === 'employer');
      if (!employer) throw new ValidationError('employerId', 'Unknown recruiter account');
      assertDemoActor(req, db, employerId);
      assertRecruiterAccess('publish_job', db, employer);
      const createdAt = Date.now();
      const created = applyJob({
        id: `j-${crypto.randomUUID().slice(0, 8)}`, employerId,
        company: employer.company || employer.name,
        logo: (employer.company || employer.name || '?').trim()[0].toUpperCase(),
        accent: JOB_ACCENTS[db.jobs.length % JOB_ACCENTS.length],
        requiredLanguages: [], culture: [], mission: employer.about ? employer.about.slice(0, 80) : 'Posted on JobsMatchNow.',
        responseTime: '< 1 week', applicants: 0, status: 'draft', createdAt, expiresAt: createdAt + JOB_EXPIRY_DAYS * DAY_MS,
      }, req.body, { strict: true });
      assignGroups(db, created, req.body); // job groups (founder, 2026-11-25): the recruiter's own choice
      // Duplicate guardrail (founder, 2026-11-26): the same role (same link, or same title + company + location) still
      // on offer is refused, unless the recruiter confirms a genuine second opening (allowDuplicate).
      const same = req.body.allowDuplicate === true ? null
        : findImportDuplicate(db, employerId, { urls: [created.externalUrl, created.sourceUrl], title: created.title, company: created.company, location: created.location });
      if (same) { const error = new Error(`Duplicate role: "${same.title}" (${[same.company, same.location].filter(Boolean).join(', ')}) is already in your roles`); error.status = 409; throw error; }
      // Item 11: suggest screening questions from the required skills.
      if (!created.screeningQuestions?.length) created.screeningQuestions = suggestScreeningQuestions(created);
      // Inherit the recruiter's location so distance matching works out of the box.
      if (!created.geo && employer.geo) created.geo = employer.geo;
      // Entitlement check runs BEFORE the job joins db.jobs, so the posting
      // being created never counts against its own active-job limit. Creating a
      // draft is always free — only publishing consumes an allowance.
      if (isLiveStatus(created.status)) applyPublishEntitlement(db, employer, created);
      db.jobs.push(created);
      if (isLiveStatus(created.status)) trackRolePosted(db, employer, created, postSource);
      // Fair-use flag only (never a hard block) once a recruiter crosses the
      // configured active-postings threshold — an admin reviews, nothing is
      // auto-deleted or hidden.
      const activeCount = db.jobs.filter((job) => job.employerId === employerId && !['expired', 'suspended'].includes(String(job.status).toLowerCase())).length;
      if (activeCount > ACTIVE_JOB_REVIEW_THRESHOLD && !employer.flaggedForJobReview) {
        employer.flaggedForJobReview = true;
        logBillingEvent(db, employerId, 'fair_use_flagged', 'user', employerId, { activeJobCount: activeCount, threshold: ACTIVE_JOB_REVIEW_THRESHOLD });
      }
      // No invented starter candidates for real recruiters any more (founder, 2026-11-23): real decks hold
      // only real people (see matching-pool.js).
      return created;
    });
    res.status(201).json({ job });
  } catch (error) { next(error); }
});

app.patch('/api/jobs/:id', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session && !demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    const job = await store.transaction((db) => {
      const item = db.jobs.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Job not found'); error.status = 404; throw error; }
      if (session && item.employerId !== session.sub) { const error = new Error('You can only edit your own postings'); error.status = 403; throw error; }
      assertDemoActor(req, db, item.employerId); // a real user's posting needs their session
      // Fields frozen at publish time (free-tier posts) can't be rewritten into
      // a different role. Checked against the raw body before applyJob mutates
      // anything, so a rejected edit leaves the posting untouched.
      const editVerdict = checkEditAllowed(item, req.body);
      if (!editVerdict.allowed) {
        logBillingEvent(db, item.employerId, 'job_edit_blocked', 'job', item.id, { code: editVerdict.code, blockedFields: editVerdict.blockedFields, enforced: entitlementsEnforced() });
        if (entitlementsEnforced()) {
          const error = new Error(editVerdict.message);
          error.status = 403;
          error.code = editVerdict.code;
          error.details = { blockedFields: editVerdict.blockedFields };
          throw error;
        }
      }
      // A draft going live is a publish, and must pass the same entitlement
      // check as publishing straight from POST — most recruiters reach "active"
      // through this route, not that one.
      const wasLive = isLiveStatus(item.status);
      const employer = db.users.find((user) => user.id === item.employerId);
      if (!wasLive && isLiveStatus(req.body?.status) && employer) {
        applyPublishEntitlement(db, employer, item);
      }
      const updated = applyJob(item, req.body);
      assignGroups(db, updated, req.body); // own postings only (checked above)
      if (updated.sourceSystem) updated.importNeedsReview = importedJobMissing(updated);
      // Publishing (draft/paused → active) must meet the same contract as
      // POST: real salary range, title, skills, location, etc. Throwing here
      // rolls the whole transaction back, so nothing is half-published.
      if (!wasLive && isLiveStatus(updated.status)) assertPublishable(updated);
      if (!wasLive && isLiveStatus(updated.status) && employer) trackRolePosted(db, employer, updated, updated.sourceSystem ? 'import' : 'editor');
      return updated;
    });
    res.json({ job });
  } catch (error) { next(error); }
});

/* Renew a posting for another 60-day term. Free, one click, unlimited: jobs are
 * the scarce resource here, and charging for the renewal risks losing the
 * listing — which costs far more than the fee could earn. */
app.post('/api/jobs/:id/renew', async (req, res, next) => {
  try {
    const result = await store.transaction((db) => {
      const job = db.jobs.find((entry) => entry.id === req.params.id);
      if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
      const actorId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
      assertDemoActor(req, db, actorId);
      const isAdmin = authSession(req)?.role === 'admin';
      if (job.employerId !== actorId && !isAdmin) {
        const error = new Error('Only the recruiter who posted this job can renew it'); error.status = 403; throw error;
      }
      return renewPosting(db, job, actorId);
    });
    res.json(result);
  } catch (error) { next(error); }
});

/* Record the outcome of a role. `platform` locks the slot for 30 days — the
 * recruiter got a hire out of us, so the next one is the moment to ask for
 * money. `elsewhere` and `cancelled` open the slot immediately: never penalise
 * someone for the product not having worked. */
app.post('/api/jobs/:id/hire', async (req, res, next) => {
  try {
    const outcome = reqString(req.body, 'outcome', { max: 32 });
    const candidateId = req.body?.candidateId ? reqString(req.body, 'candidateId', { max: 128 }) : null;
    const result = await store.transaction((db) => {
      const job = db.jobs.find((entry) => entry.id === req.params.id);
      if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
      const actorId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
      assertDemoActor(req, db, actorId);
      if (job.employerId !== actorId) { const error = new Error('Only the recruiter who posted this job can close it'); error.status = 403; throw error; }

      const recorded = recordHire(db, job, { outcome, candidateId });
      if (recorded.outcome === 'invalid_outcome') { const error = new Error(`outcome must be one of ${HIRE_OUTCOMES.join(', ')}`); error.status = 400; throw error; }
      // Closing a role must never leave the deck empty for this recruiter.
      assertNeverZeroLiveJobs(db);
      return recorded;
    });
    res.json(result);
  } catch (error) { next(error); }
});

/** The candidate's own confirmation — the only thing that earns a verified-hire
 *  badge. A recruiter's word alone never does. */
app.post('/api/jobs/:id/hire/confirm', async (req, res, next) => {
  try {
    const result = await store.transaction((db) => {
      const job = db.jobs.find((entry) => entry.id === req.params.id);
      if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
      const candidateId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
      assertDemoActor(req, db, candidateId);
      const confirmed = confirmHire(db, job, candidateId);
      if (confirmed.outcome === 'not_the_hired_candidate') { const error = new Error('Only the hired candidate can confirm this'); error.status = 403; throw error; }
      return confirmed;
    });
    res.json(result);
  } catch (error) { next(error); }
});

// Recruiter deletes their own job posting — cascades to its swipes, matches,
// messages, and calls so nothing orphaned lingers behind (same cleanup shape
// as swipe-undo and account deletion above).
// Recruiter email per role (founder, 2026-11-25): JobFinder recruiters only. Stored apart from the role so no role
// view can leak it; candidates write to the relay address instead. Empty email clears it.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const PHONE_RE = /^\+?[\d\s().-]{6,24}$/;
const validPhone = (p) => PHONE_RE.test(p) && p.replace(/\D/g, '').length >= 6 && p.replace(/\D/g, '').length <= 15;
function jobContactRec(db, jobId) { return (db.jobContacts || []).find((c) => c.jobId === jobId) || null; }
function jobContactOf(db, jobId) { return jobContactRec(db, jobId)?.email || ''; }
/** Upsert the private contact; only the fields given change; empty values clear them; no fields left = removed. */
function setJobContact(db, jobId, changes) {
  if (!Array.isArray(db.jobContacts)) db.jobContacts = [];
  const prev = jobContactRec(db, jobId) || {};
  const next = { email: prev.email || '', phone: prev.phone || '', ...(typeof changes === 'string' ? { email: changes } : changes) };
  db.jobContacts = db.jobContacts.filter((c) => c.jobId !== jobId);
  if (next.email || next.phone) db.jobContacts.push({ id: jobId, jobId, email: next.email || '', phone: next.phone || '', updatedAt: Date.now() });
}
app.put('/api/jobs/:id/contact', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    const changes = {};
    if (req.body?.email !== undefined) {
      changes.email = String(req.body.email ?? '').trim().slice(0, 254);
      if (changes.email && !EMAIL_RE.test(changes.email)) throw new ValidationError('email', 'Enter a valid email address');
    }
    if (req.body?.phone !== undefined) {
      changes.phone = String(req.body.phone ?? '').trim().slice(0, 30);
      if (changes.phone && !validPhone(changes.phone)) throw new ValidationError('phone', 'Enter a valid phone number');
    }
    const saved = await store.transaction((db) => {
      const job = db.jobs.find((entry) => entry.id === req.params.id);
      if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
      const user = db.users.find((u) => u.id === session.sub);
      if (job.employerId !== session.sub || !isJobFinderUser(user)) { const error = new Error('Only the JobFinder account can set a recruiter email'); error.status = 403; throw error; }
      setJobContact(db, job.id, changes);
      const rec = jobContactRec(db, job.id);
      return { email: rec?.email || '', phone: rec?.phone || '' };
    });
    res.json({ ok: true, ...saved });
  } catch (error) { next(error); }
});

app.delete('/api/jobs/:id', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session && !demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    await store.transaction((db) => {
      const job = db.jobs.find((entry) => entry.id === req.params.id);
      if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
      if (session && job.employerId !== session.sub) { const error = new Error('You can only delete your own postings'); error.status = 403; throw error; }
      assertDemoActor(req, db, job.employerId);
      db.jobs = db.jobs.filter((entry) => entry.id !== req.params.id);
      if (Array.isArray(db.jobContacts)) db.jobContacts = db.jobContacts.filter((c) => c.jobId !== req.params.id);
      const removedMatches = db.matches.filter((m) => m.jobId === req.params.id);
      const removedIds = new Set(removedMatches.map((m) => m.id));
      db.matches = db.matches.filter((m) => m.jobId !== req.params.id);
      db.swipes = db.swipes.filter((s) => !(s.targetType === 'job' && s.targetId === req.params.id));
      db.messages = db.messages.filter((msg) => !removedIds.has(msg.matchId));
      db.calls = db.calls.filter((c) => !removedIds.has(c.matchId));
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

const COVER_DIR = path.join(UPLOADS_ROOT, 'covers');
await fs.promises.mkdir(COVER_DIR, { recursive: true });
const COVER_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Recruiter uploads a cover image for a job card (owner-only). Gradient fallback otherwise.
app.post('/api/jobs/:id/cover', uploadLimiter, express.raw({ type: () => true, limit: '6mb' }), async (req, res, next) => {
  try {
    const ext = COVER_TYPES[req.headers['content-type']];
    if (!ext) { const error = new Error('Cover must be PNG, JPG, or WEBP'); error.status = 415; throw error; }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    const db0 = await store.read();
    const job = db0.jobs.find((item) => item.id === req.params.id);
    if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
    const session = authSession(req);
    if (session && job.employerId !== session.sub) { const error = new Error('You can only edit your own postings'); error.status = 403; throw error; }
    if (!session && !demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    assertDemoActor(req, db0, job.employerId);
    const storedName = `${req.params.id}.${ext}`;
    await fs.promises.writeFile(path.join(COVER_DIR, storedName), req.body);
    await mirror(path.join(COVER_DIR, storedName));
    const coverImage = `/api/jobs/${req.params.id}/cover?v=${Date.now()}`;
    await store.transaction((db) => { const j = db.jobs.find((item) => item.id === req.params.id); if (j) { j.coverName = storedName; j.coverImage = coverImage; } });
    res.status(201).json({ coverImage });
  } catch (error) { next(error); }
});

app.get('/api/jobs/:id/cover', async (req, res, next) => {
  try {
    const db = await store.read();
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job?.coverName) { const error = new Error('No cover image'); error.status = 404; throw error; }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(COVER_DIR, job.coverName));
  } catch (error) { next(error); }
});

app.post('/api/jobs/parse', async (req, res, next) => {
  try {
    const text = reqString(req.body, 'text', { min: 40, max: 20000 });
    const url = optString(req.body, 'url', { max: 400 });
    res.json(await parseJobText(text, url));
  } catch (error) { next(error); }
});

// Upload a job-description file (PDF / DOCX / TXT) → extract text → parse into a draft.
app.post('/api/jobs/parse-file', uploadLimiter, express.raw({ type: () => true, limit: '10mb' }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    const contentType = req.headers['content-type'] || '';
    let text;
    if (contentType.startsWith('text/')) {
      text = req.body.toString('utf8');
    } else {
      const ext = RESUME_TYPES[contentType];
      if (!ext) throw new ValidationError('file', 'Upload a PDF, DOCX, or plain-text job description');
      const tmp = path.join(os.tmpdir(), `jd-${crypto.randomUUID()}.${ext}`);
      await fs.promises.writeFile(tmp, req.body);
      try { text = ext === 'docx' ? await extractDocxText(tmp) : await extractPdfText(tmp); }
      finally { fs.promises.unlink(tmp).catch(() => undefined); }
    }
    if (!text || text.trim().length < 40) throw new ValidationError('file', 'Could not read enough text from that file');
    res.json(await parseJobText(text, undefined));
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Coaching: interview prep (item 9), screening suggestions (11), kits (12)
// ---------------------------------------------------------------------------

app.get('/api/jobs/:id/prep', async (req, res, next) => {
  try {
    const db = await store.read();
    const job = db.jobs.find((item) => item.id === req.params.id);
    if (!job) { const error = new Error('Job not found'); error.status = 404; throw error; }
    if (job.prepCache) return res.json(job.prepCache); // cached per job
    const prep = await generatePrep(job);
    await store.transaction((inner) => {
      const item = inner.jobs.find((entry) => entry.id === req.params.id);
      if (item) item.prepCache = prep;
    });
    res.json(prep);
  } catch (error) { next(error); }
});

app.post('/api/coach/screening', (req, res, next) => {
  try {
    const skills = req.body?.requiredSkillsDetail;
    if (!Array.isArray(skills) || !skills.length) throw new ValidationError('requiredSkillsDetail', 'Provide the required skills first');
    res.json({ questions: suggestScreeningQuestions({ requiredSkillsDetail: skills }) });
  } catch (error) { next(error); }
});

app.get('/api/matches/:id/icebreakers', async (req, res, next) => {
  try {
    const db = await store.read();
    const match = db.matches.find((item) => item.id === req.params.id);
    if (!match) { const error = new Error('Match not found'); error.status = 404; throw error; }
    assertMatchParticipant(req, db, match);
    if (match.icebreakerCache) return res.json(match.icebreakerCache);
    const result = await generateIcebreakers(db.users.find((user) => user.id === match.candidateId) || {}, db.jobs.find((item) => item.id === match.jobId) || {});
    await store.transaction((inner) => {
      const item = inner.matches.find((entry) => entry.id === req.params.id);
      if (item) item.icebreakerCache = result;
    });
    res.json(result);
  } catch (error) { next(error); }
});

// The AI interview kit for hiring teams was removed (founder, 2026-11-23): no AI-generated material about a
// candidate is sent to hiring teams. Old clients get a clear 410 instead of a kit.
app.get('/api/matches/:id/kit', (req, res) => {
  res.status(410).json({ error: 'The interview kit feature was removed.' });
});

app.get('/api/bootstrap', async (req, res, next) => {
  try {
    const db = await store.read();
    const requestedId = resolveActor(req, typeof req.query.userId === 'string' ? req.query.userId : '');
    const fallbackRole = req.query.role === 'employer' ? 'employer' : 'candidate';
    const viewer = db.users.find((user) => user.id === requestedId) || (demoAuth ? db.users.find((user) => user.id === `${fallbackRole}-demo`) : undefined);
    if (!viewer) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    if (viewer.suspendedAt) { const error = new Error('This account has been suspended. Contact support if you believe this is a mistake.'); error.status = 403; throw error; }
    assertDemoActor(req, db, viewer.id);
    const role = viewer.role === 'employer' ? 'employer' : 'candidate';
    const pool = matchingPool(db, viewer);
    // Mutual salary reveal: exact ranges are hidden until both sides matched.
    const matchedJobIds = new Set(pool.matches.filter((match) => match.candidateId === viewer.id).map((match) => match.jobId));
    const matchedCandidateIds = new Set(pool.matches.filter((match) => match.employerId === viewer.id).map((match) => match.candidateId));
    // "I just got hired!" takes a candidate out of recruiter search. Teams already matched keep them (and the chat).
    const candidates = pool.users.filter((user) => user.role === 'candidate' && (!isHired(user) || matchedCandidateIds.has(user.id)));
    // Incoming super-likes: who signalled strong interest in the viewer already?
    const incomingEmployerLikes = pool.swipes.filter((s) => s.direction === 'like' && s.targetType === 'candidate' && s.targetId === viewer.id);
    const viewerJobIds = new Set(pool.jobs.filter((job) => job.employerId === viewer.id).map((job) => job.id));
    const candidatesWhoSuperLikedMyJobs = new Set(pool.swipes.filter((s) => s.superLike && s.targetType === 'job' && viewerJobIds.has(s.targetId)).map((s) => s.actorId));
    // Computed once per bootstrap so ranking stays O(1) per card.
    const boostedJobIds = boostedIds(db, 'job');
    const boostedCandidateIds = boostedIds(db, 'candidate');
    const scoredJobs =pool.jobs.filter((job) => role !== 'candidate' || !HIDDEN_FROM_CANDIDATES.includes(String(job.status).toLowerCase())).map((job) => {
      const employer = pool.users.find((user) => user.id === job.employerId);
      // Real haversine distance when both sides have coordinates; else demo fallback.
      const realDist = haversineKm(viewer.geo, job.geo);
      // Recruiter emails/phones written in the role's text are masked for everyone but its owner (2026-11-25).
      const withDistance = { ...(job.employerId === viewer.id ? job : maskJobContacts(job)), distanceKm: realDist ?? job.distanceKm ?? demoDistances[job.id] };
      if (job.employerId !== viewer.id) delete withDistance.geo; // private distance range only
      const match = scoreCandidateForJob(viewer, withDistance);
      // JobFinder listing (2026-11-25): the employer is not a member, so no recruiter card, no company profile from
      // the JobFinder account, and the public salary stays visible. Reachability is refreshed live.
      if (isJobFinderJob(job) && job.jobFinder.listingStatus !== 'claimed') {
        const mine = (db.jfOutreach || []).find((o) => o.jobId === job.id && o.candidateId === viewer.id);
        const jobFinder = { ...memberJobFinder(job.jobFinder), reachability: reachabilityOf(db, job), ...(role === 'candidate' ? { myOutreach: mine ? { status: mine.status } : null } : {}) };
        return { ...withDistance, jobFinder, match, verified: false, likedYou: false, superLikedYou: false, promoted: boostedJobIds.has(job.id) };
      }
      if (role === 'candidate' && !matchedJobIds.has(job.id)) {
        delete withDistance.salary; delete withDistance.salaryRange;
        withDistance.salaryHidden = true;
      }
      const incomingLike = incomingEmployerLikes.find((swipe) => swipe.actorId === job.employerId && swipe.jobId === job.id);
      // Public recruiter card shown on each role (photo/name/title only — no contact info pre-match). A role's own
      // recruiter details (e.g. imported listings) win over the account's (founder, 2026-11-25).
      const recruiter = job.recruiterName ? { name: job.recruiterName, title: job.recruiterTitle, company: job.company }
        : employer ? { name: employer.name, title: employer.title, photo: employer.photo, company: employer.company } : undefined;
      // Public company profile for the role's "Company" page (no contact details).
      const companyProfile = employer ? { about: employer.about, industry: employer.industry, companySize: employer.companySize, headquarters: employer.headquarters, website: employer.website, foundedYear: employer.foundedYear, officeLocations: employer.officeLocations, techStack: employer.techStack, benefits: employer.benefits } : undefined;
      // A role posted by a demo recruiter is a demo role, even if the role record itself lacks the flag (DEMO ACCOUNT stamp).
      // Starter sample roles (real accounts' starter deck) stay `sample`, never `demo`: the client stamps those too.
      const demo = job.demo === true || (employer?.demo === true && !employer?.sample && !job.sample) || undefined;
      // Recruiter email per role (founder, 2026-11-25): kept in db.jobContacts, never on the role. Only the JobFinder
      // owner sees it; everyone else only learns that candidates can write through the JobsMatchNow relay address.
      const rec = jobContactRec(db, job.id);
      const contact = rec?.email || rec?.phone
        ? (job.employerId === viewer.id && isJobFinderUser(viewer)
          // claimUrl: the JobFinder owner's preview of the recruiter's "See your candidates" link.
          ? { contactEmail: rec.email || undefined, contactPhone: rec.phone || undefined, ...(rec.email ? { claimUrl: claimUrl(publicOrigin, sessionSecret, job.id, rec.email) } : {}) }
          : (rec.email ? { relayContact: true } : {}))
        : {};
      return { ...withDistance, ...contact, ...(demo ? { demo: true } : {}), companyLogo: employer?.companyLogo, recruiter, companyProfile, match, likedYou: Boolean(incomingLike), superLikedYou: Boolean(incomingLike?.superLike), verified: verifiedUser(employer), promoted: boostedJobIds.has(job.id) };
    // External roles (JobFinder account): company hidden, nothing sends candidates off JobsMatchNow (2026-11-26).
    }).map((card) => hideExternalCompany(db, card, viewer.id, viewer.role));
    // Boosted cards ride to the front of the deck, keeping their own relative
    // order. The match score is never touched — a promoted card shows the same
    // fit it would have shown unboosted, and is labelled `promoted` so the UI
    // can say so. Paid reach changes the order; it must not change the score.
    sortPromotedFirst(scoredJobs);
    // Score candidates against this recruiter's own (first active) job when possible.
    const referenceJob = pool.jobs.find((job) => job.employerId === viewer.id && String(job.status).toLowerCase() === 'active')
      || pool.jobs.find((job) => job.employerId === viewer.id) || pool.jobs[0];
    // Deck candidates: contact details and exact salary stay hidden until a mutual match.
    const jobGeo = referenceJob?.geo || viewer.geo;
    // passwordHash/authSubject/geo never leave the server for another user.
    const scoredCandidates = candidates.filter((candidate) => candidate.id !== viewer.id).map((source) => {
      const { email, phone, contactChannels, calendarLink, geo } = source;
      const { email: _e, phone: _p, contactChannels: _c, calendarLink: _b, ...candidate } = otherPartyView(source);
      if (candidate.agePrivacy !== 'public' && !candidate.discloseAge) delete candidate.birthdate; // age shown in deck only if public
      const realDist = haversineKm(jobGeo, geo);
      const withDistance = { ...candidate, distanceKm: realDist ?? candidate.distanceKm ?? demoDistances[candidate.id] };
      const match = scoreCandidateForJob(withDistance, { ...referenceJob, distanceKm: withDistance.distanceKm });
      if (!matchedCandidateIds.has(candidate.id) && withDistance.preferences?.salary) {
        withDistance.preferences = { ...withDistance.preferences, salary: undefined };
        withDistance.salaryHidden = true;
      }
      const unlockedContacts = matchedCandidateIds.has(candidate.id) ? { email, phone, contactChannels, calendarLink } : {};
      return { ...withDistance, ...unlockedContacts, match, superLikedYou: candidatesWhoSuperLikedMyJobs.has(candidate.id), verified: verifiedUser(candidate), promoted: boostedCandidateIds.has(candidate.id) };
    });
    sortPromotedFirst(scoredCandidates);
    // Every recruiter role receives its own correctly scored candidate list.
    // Candidate contact details remain stripped because these objects reuse the
    // same recruiter-safe payload as the discovery deck.
    // Own drafts are listed too (founder, 2026-11-26: imported JobFinder drafts were invisible in My Jobs list),
    // after the live roles; the page marks them Draft with a Publish button.
    const roleMatches = role === 'employer' ? pool.jobs
      .filter((job) => job.employerId === viewer.id && ['active', 'draft'].includes(String(job.status).toLowerCase()))
      .sort((a, b) => (String(a.status) === 'draft') - (String(b.status) === 'draft'))
      .map((job) => {
        const likesByCandidate = new Map(pool.swipes
          .filter((swipe) => swipe.direction === 'like' && swipe.targetType === 'job' && swipe.targetId === job.id)
          .map((swipe) => [swipe.actorId, swipe]));
        const likedCandidateIds = new Set(likesByCandidate.keys());
        const ranked = scoredCandidates.map((candidate) => {
          // Score with the private source profile, but return only the recruiter-safe
          // candidate payload. Salary expectations remain hidden until mutual match.
          const sourceCandidate = candidates.find((person) => person.id === candidate.id) || candidate;
          return {
            ...candidate,
            likedYou: likedCandidateIds.has(candidate.id),
            // Applications page (2026-11-25): when they applied, Super Like, and whether it came from a LinkedIn link.
            ...(likedCandidateIds.has(candidate.id) ? { appliedAt: likesByCandidate.get(candidate.id).createdAt, appliedSuper: likesByCandidate.get(candidate.id).superLike === true || undefined, appliedSrc: likesByCandidate.get(candidate.id).src } : {}),
            match: scoreCandidateForJob({ ...sourceCandidate, distanceKm: candidate.distanceKm }, { ...job, distanceKm: candidate.distanceKm }),
          };
        }).sort((a, b) => Number(b.likedYou) - Number(a.likedYou)
          || (job.demoTemplate ? (a.demoOrder || 99) - (b.demoOrder || 99) : 0)
          || (b.match?.score || 0) - (a.match?.score || 0));
        const interested = ranked.filter((candidate) => candidate.likedYou);
        const matchingCandidates = ranked.filter((candidate) => isStrongRoleMatch(candidate.match));
        return {
          job: { ...job, companyLogo: viewer.companyLogo, match: scoreCandidateForJob(viewer, job) },
          candidates: interested,
          matchingCandidates,
          // Light per-role fit for EVERY candidate, so the recruiter can swipe the whole pool for this role
          // (Find My Match role dropdown) without resending full profiles per role.
          scores: Object.fromEntries(ranked.map((c) => [c.id, { score: c.match?.score, matchedSkills: c.match?.matchedSkills || [], missingSkills: c.match?.missingSkills || [], extraSkills: c.match?.extraSkills || [], matchedLanguages: c.match?.matchedLanguages || [], experienceFit: c.match?.experienceFit, salaryStatus: c.match?.salaryStatus }])),
          interestedCount: interested.length,
          newCount: interested.slice(0, 4).length,
        };
      }) : [];
    const matches = pool.matches.filter((match) => role === 'candidate' ? match.candidateId === viewer.id : match.employerId === viewer.id).map((match) => {
      const candidateUser = pool.users.find((user) => user.id === match.candidateId);
      const job = pool.jobs.find((item) => item.id === match.jobId);
      const employer = pool.users.find((user) => user.id === match.employerId);
      return {
        ...match,
        // Recruiter-side match rows show a real fit % — score the candidate against
        // the specific job they matched on rather than leaving match undefined (0%).
        candidate: candidateUser && job ? { ...otherPartyView(candidateUser), match: scoreCandidateForJob(candidateUser, job) } : otherPartyView(candidateUser),
        employer: otherPartyView(employer),
        job: job ? { ...jobPublicView(job), companyLogo: employer?.companyLogo } : job,
        screeningAnswers: db.swipes.find((swipe) => swipe.actorId === match.candidateId && swipe.targetId === match.jobId && swipe.direction === 'like')?.answers,
      };
    });
    const matchIds = new Set(matches.map((match) => match.id));
    const bookmarkedIds = db.bookmarks.filter((b) => b.userId === viewer.id).map((b) => b.targetId);
    const notes = (db.notes || []).filter((note) => note.userId === viewer.id);
    let billing;
    if (role === 'employer' && !isBillingExempt(viewer)) {
      let subscription = findSubscription(db, viewer.id);
      if (!subscription) subscription = await store.transaction((db2) => getOrCreateTrialSubscription(db2, viewer.id));
      // Bootstrap is a read (the state is frozen), so a first-time code is
      // generated and saved in its own transaction, stable on every later load.
      const referralCode = viewer.referralCode || await store.transaction((db2) => {
        const u = db2.users.find((entry) => entry.id === viewer.id);
        return u ? getOrCreateReferralCode(db2, u) : null;
      });
      billing = {
        subscription,
        effectiveStatus: computeEffectiveStatus(subscription),
        canPublishJob: canUseRecruiterFeatures(viewer, subscription) && computeEffectiveStatus(subscription) !== 'grace_period',
        credits: availableCredits(db, viewer.id),
        referralCode,
        vnpayEnabled: isVnpayConfigured(),
        vnpayAmountVnd: VNPAY_AMOUNT_VND,
        stripeEnabled: isStripeConfigured(),
        paypalEnabled: isPaypalConfigured(),
        payosEnabled: isPayosConfigured(),
        methods: allowedMethods(db, viewer),
        googlePlayEnabled: isGooglePlayConfigured(),
        googlePlayProductId: googlePlaySubscriptionProductId(),
        appleEnabled: isAppleConfigured(),
        appleProductId: appleSubscriptionProductId(),
      };
    }
    // Candidates only get their JobFinder notices ("the recruiter is now reachable"); recruiters get all of theirs.
    // "Jobs Applied (liked)" (2026-11-25): every job this candidate liked, newest first, with its state today.
    const applied = role === 'candidate' ? pool.swipes
      .filter((s) => s.actorId === viewer.id && s.targetType === 'job' && s.direction === 'like')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => {
        const card = scoredJobs.find((j) => j.id === s.targetId);
        const raw = pool.jobs.find((j) => j.id === s.targetId);
        if (!card && !raw) return null;
        const match = pool.matches.find((m) => m.candidateId === viewer.id && m.jobId === s.targetId);
        const job = card || hideExternalCompany(db, { id: raw.id, title: raw.title, company: raw.company, location: raw.location, workMode: raw.workMode, status: raw.status, employerId: raw.employerId }, viewer.id, viewer.role);
        // Application tracker (2026-11-26): recruiter contacted → application viewed → answer expected within 48 h.
        const tracker = trackerFor(db, s.targetId, viewer.id) || undefined;
        return { jobId: s.targetId, at: s.createdAt, superLike: s.superLike === true || undefined, src: s.src, matchId: match?.id, open: Boolean(card), job, tracker };
      }).filter(Boolean) : undefined;
    const myNotices = (db.billingNotifications || []).filter((entry) => entry.userId === viewer.id && (billing || entry.kind === 'jobfinder_contact'));
    const billingNotifications = billing || myNotices.length ? myNotices.slice(-20).reverse() : undefined;
    res.json({ viewer: selfView(viewer), jobs: scoredJobs, candidates: scoredCandidates, roleMatches, matches, messages: db.messages.filter((message) => matchIds.has(message.matchId)), calls: db.calls.filter((call) => matchIds.has(call.matchId)), notes, bookmarkedIds, likesRemaining: likesRemainingToday(pool.swipes, viewer.id), billing, billingNotifications, ...(applied ? { applied } : {}) });
  } catch (error) { next(error); }
});

app.post('/api/swipes', async (req, res, next) => {
  try {
    const actorId = resolveActor(req, reqString(req.body, 'actorId', { max: 128 }));
    const targetId = reqString(req.body, 'targetId', { max: 128 });
    const targetType = oneOf(req.body, 'targetType', ['job', 'candidate']);
    const direction = oneOf(req.body, 'direction', ['like', 'pass']);
    const superLike = req.body.superLike === true; // Tinder-style stronger interest signal
    // Item 11: candidate answers to the job's screening questions ride on the like-swipe.
    const answers = Array.isArray(req.body.answers)
      ? req.body.answers.map((item) => ({ question: String(item?.question || '').slice(0, 300), answer: String(item?.answer || '').slice(0, 600) })).filter((item) => item.question && item.answer).slice(0, 5)
      : undefined;
    // "First impression": a short note that rides on a Super Like. Mutual opt-in still holds:
    // the other side never sees the text before a match; it becomes the first message when one forms.
    const note = direction === 'like' && superLike ? (optString(req.body, 'note', { max: 280 }) || '').trim() || undefined : undefined;
    const result = await store.transaction((db) => {
      const actor = db.users.find((user) => user.id === actorId);
      if (!actor) throw new ValidationError('actorId', 'Unknown user');
      assertDemoActor(req, db, actorId);
      // JobFinder lists jobs for employers who are not members yet: it never expresses interest in candidates, so a
      // like on a JobFinder job can never become a mutual match (spec 12).
      if (isJobFinderUser(actor) && targetType === 'candidate') {
        const error = new Error('JobFinder lists jobs for employers and never expresses interest in candidates'); error.status = 403; throw error;
      }
      // Grace-period recruiters may keep reading, but not initiate new
      // candidate contact — candidates swiping on jobs are never affected by
      // the job's recruiter's billing state.
      if (actor.role === 'employer' && targetType === 'candidate' && direction === 'like') {
        assertRecruiterAccess('contact_candidate', db, actor);
      }
      if (!targetIsInMatchingPool(db, actor, targetType, targetId)) {
        const error = new Error('Demo and live matching are separate'); error.status = 403; throw error;
      }
      // A hired candidate is out of search: no new likes from recruiters who are not already matched.
      if (actor.role === 'employer' && targetType === 'candidate') {
        const target = db.users.find((u) => u.id === targetId);
        if (isHired(target) && !db.matches.some((m) => m.candidateId === targetId && m.employerId === actor.id)) {
          const error = new Error('This candidate just got hired and is no longer in search'); error.status = 409; throw error;
        }
      }
      // A job only accepts interest while it is genuinely live. Without this a
      // candidate could swipe a job id straight from the API and match against
      // an unpublished draft or an expired posting — the deck filter alone
      // can't prevent that.
      if (targetType === 'job') {
        const targetJob = db.jobs.find((job) => job.id === targetId);
        if (targetJob && HIDDEN_FROM_CANDIDATES.includes(String(targetJob.status).toLowerCase())) {
          const error = new Error('This role is not open for applications'); error.status = 409; throw error;
        }
      }
      if (direction === 'like' && likesRemainingToday(db.swipes, actorId) <= 0) {
        const error = new Error('Daily like limit reached'); error.status = 429; throw error;
      }
      // Demo if ANY party is demo/sample — starter sample accounts pre-like
      // real users, and those interactions must not inflate real counts.
      const targetJob = targetType === 'job' ? db.jobs.find((job) => job.id === targetId) : undefined;
      const targetUser = targetType === 'candidate'
        ? db.users.find((user) => user.id === targetId)
        : db.users.find((user) => user.id === targetJob?.employerId);
      // Demo accounts only (founder, 2026-11-22): 1 match per 3 likes, on every card of the deck. Passes never count;
      // the count restarts after every match; liking someone who already liked you still matches at once. The deck
      // shows every card, so a demo like on a card swiped before counts as a fresh like, and a 3rd like on someone the
      // demo account is already matched with opens that match again. Real users are never touched.
      const demoLike = direction === 'like' && actor.demo === true && (targetUser?.demo === true || targetJob?.demo === true);
      const existing = db.swipes.find((swipe) => swipe.actorId === actorId && swipe.targetType === targetType && swipe.targetId === targetId);
      if (existing && !demoLike) return { swipe: existing, match: null, duplicate: true };
      if (existing) { untrack(db, existing.tracked); db.swipes = db.swipes.filter((s) => s.id !== existing.id); }
      // A recruiter swiping from one role's deck tags the swipe with that role (must be their own job).
      const roleJobId = actor.role === 'employer' && targetType === 'candidate' && typeof req.body.jobId === 'string'
        && db.jobs.some((job) => job.id === req.body.jobId && job.employerId === actor.id) ? req.body.jobId : undefined;
      // An application that came from a LinkedIn link (this visit, or the account was created from one).
      const fromLinkedIn = targetType === 'job' && direction === 'like' && (cleanSrc(req.body.src) === 'linkedin' || actor.acquisition?.src === 'linkedin');
      const swipe = { id: crypto.randomUUID(), actorId, targetId, targetType, direction, createdAt: Date.now(), ...(roleJobId ? { jobId: roleJobId } : {}), ...(fromLinkedIn ? { src: 'linkedin' } : {}), ...(superLike && direction === 'like' ? { superLike: true } : {}), ...(answers ? { answers } : {}), ...(note ? { note } : {}) };
      const matchedPair = (p) => db.matches.find((m) => m.candidateId === p.candidateId && m.jobId === p.jobId);
      let mutual = detectMutualMatch(swipe, db);
      // Demo: a mutual like with someone already matched is just a like (counted below), not an instant match.
      if (demoLike && mutual && matchedPair(mutual)) mutual = null;
      db.swipes.push(swipe);
      let reshown = null;
      if (!mutual && demoLike) {
        const every = Math.max(1, Number(process.env.DEMO_MATCH_EVERY) || 3);
        const mine = (m) => m.candidateId === actorId || m.employerId === actorId;
        const lastMatchAt = Math.max(0, ...db.matches.filter(mine).map((m) => Number(m.createdAt) || 0),
          ...db.swipes.filter((s) => s.actorId === actorId && s.demoMatchShown).map((s) => Number(s.createdAt) || 0));
        const likesSinceMatch = db.swipes.filter((s) => s.actorId === actorId && s.direction === 'like' && !s.demoAutoLike && (Number(s.createdAt) || 0) > lastMatchAt).length;
        if (likesSinceMatch >= every) {
          let pair = null;
          if (targetType === 'job' && targetJob) pair = { candidateId: actorId, jobId: targetJob.id, employerId: targetJob.employerId };
          else if (targetType === 'candidate' && targetUser) {
            const active = db.jobs.filter((job) => job.employerId === actorId && String(job.status).toLowerCase() === 'active');
            const roleJob = (roleJobId && db.jobs.find((job) => job.id === roleJobId))
              || active.find((job) => !matchedPair({ candidateId: targetId, jobId: job.id })) || active[0];
            if (roleJob) pair = { candidateId: targetId, jobId: roleJob.id, employerId: actorId };
          }
          if (pair) {
            // The demo counterpart's like-back (recorded once; an earlier pass by them never blocks the match).
            const counter = targetType === 'job'
              ? { actorId: pair.employerId, targetId: actorId, targetType: 'candidate', jobId: pair.jobId }
              : { actorId: targetId, targetId: pair.jobId, targetType: 'job' };
            const has = db.swipes.some((s) => s.actorId === counter.actorId && s.targetType === counter.targetType && s.targetId === counter.targetId && s.direction === 'like' && (counter.targetType === 'job' || s.jobId === counter.jobId));
            if (!has) db.swipes.push({ id: crypto.randomUUID(), ...counter, direction: 'like', createdAt: swipe.createdAt, demoAutoLike: true });
            const old = matchedPair(pair);
            if (old) { swipe.demoMatchShown = true; reshown = old; } else mutual = pair;
          }
        }
      }
      // The stamp lives on the swipe so undo can retract exactly this count.
      swipe.tracked = track(db, 'swipe', { demo: involvesDemo(actor, targetUser, targetJob), dim: `${direction}/${actorSide(actor)}`, at: swipe.createdAt });
      if (fromLinkedIn) track(db, 'li_apply', { demo: involvesDemo(actor, targetUser, targetJob) });
      let match = null;
      // One match (and so one match_created) per candidate × job pair.
      if (mutual && !db.matches.some((item) => item.candidateId === mutual.candidateId && item.jobId === mutual.jobId)) {
        match = { id: crypto.randomUUID(), ...mutual, stage: 'Matched', createdAt: Date.now() };
        const matchJob = db.jobs.find((job) => job.id === match.jobId);
        const parties = [db.users.find((user) => user.id === match.candidateId), db.users.find((user) => user.id === match.employerId), matchJob];
        // dim = which side's swipe closed the mutual match.
        match.tracked = track(db, 'match_created', { demo: involvesDemo(...parties), dim: actorSide(actor), at: match.createdAt });
        db.matches.push(match);
        // Notes from either side's Super Like open the conversation, oldest first.
        // A recruiter's note rides on a candidate swipe (not a job), so it opens only their FIRST match with that candidate.
        const firstWithCandidate = !db.matches.some((m) => m.id !== match.id && m.employerId === match.employerId && m.candidateId === match.candidateId);
        const pairSwipes = db.swipes.filter((s) => s.note && ((s.actorId === match.candidateId && s.targetType === 'job' && s.targetId === match.jobId)
          || (firstWithCandidate && s.actorId === match.employerId && s.targetType === 'candidate' && s.targetId === match.candidateId)));
        pairSwipes.sort((a, b) => a.createdAt - b.createdAt).forEach((s, i) => {
          db.messages.push({ id: crypto.randomUUID(), matchId: match.id, senderId: s.actorId, text: s.note, createdAt: match.createdAt + i, firstImpression: true });
        });
        if (pairSwipes.length) match.firstMessageTracked = track(db, 'first_message', { demo: involvesDemo(...parties), dim: actorSide(db.users.find((u) => u.id === pairSwipes[0].actorId)), at: match.createdAt });
        // Expand for the match screen: names, photos, and the mutual salary reveal.
        match = { ...match, candidate: otherPartyView(db.users.find((user) => user.id === match.candidateId)), employer: otherPartyView(db.users.find((user) => user.id === match.employerId)), job: jobPublicView(db.jobs.find((job) => job.id === match.jobId)) };
      } else if (reshown) {
        // Demo: the 3rd like landed on an existing match: open "It's a Match!" on it (same conversation).
        match = { ...reshown, candidate: otherPartyView(db.users.find((user) => user.id === reshown.candidateId)), employer: otherPartyView(db.users.find((user) => user.id === reshown.employerId)), job: jobPublicView(db.jobs.find((job) => job.id === reshown.jobId)) };
      }
      return { swipe, match, duplicate: false, likesRemaining: likesRemainingToday(db.swipes, actorId) };
    });
    // JobFinder job liked: count it, auto-send only with the candidate's one-click preference, and tell the client
    // what to show next (send panel, "apply on the original site", or "contact not yet available").
    if (targetType === 'job' && direction === 'like' && result.swipe && !result.duplicate) {
      const jf = await afterJobFinderLike(jobFinderCtx, { candidateId: actorId, jobId: targetId }).catch(() => null);
      if (jf) result.jobFinder = jf;
      const notified = await afterRoleInterest(roleInterestCtx, { candidateId: actorId, jobId: targetId }).catch(() => null);
      if (notified) result.recruiterNotified = notified.status;
    }
    res.status(201).json(result);
  } catch (error) { next(error); }
});

// Rewind/Undo: remove the actor's most recent swipe, and any match it created.
// Withdraw an application (founder, 2026-11-26): a candidate cancels a job they applied to (liked) and did NOT match on
// yet. The like is removed (gone from Jobs Applied and the recruiter's applicants). A recruiter email that already went
// out can't be recalled; it is marked withdrawn so no follow-up counts this candidate. After a match: Stop process.
app.post('/api/applications/:jobId/withdraw', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    const out = await store.transaction((db) => {
      const user = db.users.find((u) => u.id === session.sub);
      if (!user || user.role !== 'candidate') { const error = new Error('Only candidates can withdraw an application'); error.status = 403; throw error; }
      const jobId = String(req.params.jobId);
      if (db.matches.some((m) => m.candidateId === user.id && m.jobId === jobId)) { const error = new Error('You already matched on this role: use “Stop process” in the conversation instead'); error.status = 409; throw error; }
      const before = db.swipes.length;
      db.swipes = db.swipes.filter((s) => !(s.actorId === user.id && s.targetType === 'job' && s.targetId === jobId && s.direction === 'like'));
      const removed = before - db.swipes.length;
      if (!removed) { const error = new Error('No application to withdraw'); error.status = 404; throw error; }
      for (const m of db.roleInterestMails || []) if (m.jobId === jobId && m.candidateId === user.id) m.withdrawnAt = Date.now();
      logBillingEvent(db, user.id, 'application_withdrawn', 'job', jobId, {});
      return { ok: true, removed };
    });
    res.json(out);
  } catch (error) { next(error); }
});

app.post('/api/swipes/undo', async (req, res, next) => {
  try {
    const actorId = resolveActor(req, reqString(req.body, 'actorId', { max: 128 }));
    const result = await store.transaction((db) => {
      assertDemoActor(req, db, actorId);
      const mine = db.swipes.filter((swipe) => swipe.actorId === actorId).sort((a, b) => b.createdAt - a.createdAt);
      const last = mine[0];
      if (!last) return { undone: null };
      db.swipes = db.swipes.filter((swipe) => swipe.id !== last.id);
      // Drop any match this swipe completed (and its messages), so undo is clean.
      // Only a match this swipe created (never an older match on the same pair, e.g. a demo match shown again).
      const removedMatches = db.matches.filter((m) => (Number(m.createdAt) || 0) >= (Number(last.createdAt) || 0)
        && (last.targetType === 'job' ? m.candidateId === actorId && m.jobId === last.targetId : m.employerId === actorId && m.candidateId === last.targetId));
      const removedIds = new Set(removedMatches.map((m) => m.id));
      // Retract exactly what was counted, so undo + re-swipe never double counts.
      untrack(db, last.tracked);
      for (const m of removedMatches) { untrack(db, m.tracked); untrack(db, m.firstMessageTracked); }
      db.matches = db.matches.filter((m) => !removedIds.has(m.id));
      db.messages = db.messages.filter((msg) => !removedIds.has(msg.matchId));
      db.calls = db.calls.filter((c) => !removedIds.has(c.matchId));
      return { undone: { targetId: last.targetId, targetType: last.targetType, direction: last.direction }, likesRemaining: likesRemainingToday(db.swipes, actorId) };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch('/api/matches/:id', async (req, res, next) => {
  try {
    const stage = oneOf(req.body, 'stage', ['Matched', 'Screen', 'Interview', 'Offer', 'Hired', 'Archived']);
    const session = authSession(req);
    if (!session && !demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    let effects = null;
    const match = await store.transaction((db) => {
      const item = db.matches.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Match not found'); error.status = 404; throw error; }
      if (session && item.candidateId !== session.sub && item.employerId !== session.sub) { const error = new Error('Only the matched parties can update this match'); error.status = 403; throw error; }
      assertDemoActor(req, db, item.employerId); // matches involving a real account need a party session
      const byRecruiter = session ? session.sub === item.employerId : true; // demo calls act as the recruiter
      const now = Date.now();
      // Recruitment process rules (hiring-rules.js): hiring fills the role and thanks the others;
      // stopping a process needs a reason and honest feedback, sent to the candidate.
      if (byRecruiter && stage === 'Hired' && item.stage !== 'Hired') effects = onRoleFilled(db, item, item.employerId, now);
      else if (byRecruiter && stage === 'Archived' && item.stage !== 'Archived') effects = stopProcess(db, item, item.employerId, { category: req.body.closeCategory, feedback: req.body.closeFeedback }, now);
      else { item.stage = stage; item.stageChangedAt = now; } // idle-time tracking for pipeline nudges
      return item;
    });
    res.json({ ...match, ...(effects ? { effects } : {}) });
  } catch (error) { next(error); }
});

const STEP_KINDS = ['match', 'hr', 'technical', 'manager', 'culture', 'assignment', 'offer', 'hired', 'other'];
app.patch('/api/matches/:id/pipeline', async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.pipeline)) { const error = new Error('pipeline must be an array'); error.status = 400; throw error; }
    const pipeline = req.body.pipeline.slice(0, 20).map((step) => ({
      id: String(step.id || '').slice(0, 60),
      name: String(step.name || '').slice(0, 120),
      owner: String(step.owner || '').slice(0, 80),
      hidden: step.hidden === true,
      ...(STEP_KINDS.includes(step.kind) ? { kind: step.kind } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(String(step.date || '')) ? { date: step.date } : {}),
      ...(step.format ? { format: String(step.format).slice(0, 40) } : {}),
    })).filter((step) => step.id && step.name);
    const currentStepId = req.body.currentStepId ? String(req.body.currentStepId).slice(0, 60) : undefined;
    const session = authSession(req);
    if (!session && !demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    const match = await store.transaction((db) => {
      const item = db.matches.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Match not found'); error.status = 404; throw error; }
      if (session && item.candidateId !== session.sub && item.employerId !== session.sub) { const error = new Error('Only the matched parties can update this match'); error.status = 403; throw error; }
      assertDemoActor(req, db, item.employerId);
      item.pipeline = pipeline;
      if (currentStepId) item.currentStepId = currentStepId;
      return item;
    });
    res.json(match);
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// Billing: recruiter subscriptions, manual payments, referrals, admin review.
// Candidates never touch any of this — every handler below is employer-only.
// ---------------------------------------------------------------------------

function billingPayload(db, recruiter) {
  const subscription = findSubscription(db, recruiter.id) || getOrCreateTrialSubscription(db, recruiter.id);
  return {
    subscription,
    effectiveStatus: computeEffectiveStatus(subscription),
    credits: availableCredits(db, recruiter.id),
    referralCode: getOrCreateReferralCode(db, recruiter),
    instructions: paymentInstructions(db),
    vnpayEnabled: isVnpayConfigured(),
    vnpayAmountVnd: VNPAY_AMOUNT_VND,
    stripeEnabled: isStripeConfigured(),
    paypalEnabled: isPaypalConfigured(),
    payosEnabled: isPayosConfigured(),
    // Methods for this recruiter's country: switched on, configured, and ticked for the country/region (Admin grid).
    methods: allowedMethods(db, recruiter),
    // USDT: only when the SARL wallet is set, and never for companies in Vietnam (founder, 2026-11-24).
    usdtEnabled: isTrc20Address(paymentInstructions(db).usdtTrc20Address) && Boolean(companyCountry(recruiter)) && !isVietnam(companyCountry(recruiter)),
    usdtBlockedReason: !isTrc20Address(paymentInstructions(db).usdtTrc20Address) ? 'not_configured' : (!companyCountry(recruiter) || isVietnam(companyCountry(recruiter))) ? 'country' : null,
    googlePlayEnabled: isGooglePlayConfigured(),
    googlePlayProductId: googlePlaySubscriptionProductId(),
    appleEnabled: isAppleConfigured(),
    appleProductId: appleSubscriptionProductId(),
    // Plan limits, usage, and remaining allowances — folded into the payload the
    // Subscription page already loads rather than a second round trip.
    entitlements: getRecruiterEntitlements(db, recruiter, subscription),
    plan: planSummary(db, recruiter),
    // What the next payment will actually be, in their own currency — every
    // payment button on the page renders from this rather than a hardcoded 20.
    charge: chargeFor(db, recruiter, subscription),
    selectablePlans: SELECTABLE_PLANS.map((key) => ({
      key,
      display: PLANS[key].display,
      seats: PLANS[key].seats,
      liveJobSlots: PLANS[key].liveJobSlots,
      monthly: planPrice(key, currencyForCountry(recruiter.country)),
      annual: planPrice(key, currencyForCountry(recruiter.country), 'annual'),
    })),
    team: teamPayload(db, recruiter),
    verification: recruiterVerification(recruiter),
    trial: trialPayload(subscription),
    postings: postingsPayload(db, recruiter),
  };
}

/**
 * Amount + currency for a new payment row, derived from the plan the recruiter
 * actually chose. Every payment-creation path uses this: before the seat ladder
 * existed a flat PRICE_AMOUNT was correct, and the moment it existed a recruiter
 * on Agency would have been billed 20 and granted 130-worth of product.
 * The plan and interval are stamped on the payment too, so an old row still
 * says what it was for after the catalogue moves on.
 */
function paymentAmountFields(db, subscription) {
  const recruiter = db.users.find((user) => user.id === subscription.recruiterUserId);
  const charge = chargeFor(db, recruiter, subscription);
  return { amount: charge.amount, baseAmount: charge.baseAmount, currency: charge.currency, planKey: charge.planKey, billingInterval: charge.interval, extraJobSlots: charge.extraJobSlots };
}

/** VNPay settles in VND and nothing else, so its rail always bills the plan's
 *  stored VND price — never a converted USD figure. */
function vnpayAmount(db, subscription) {
  const recruiter = db.users.find((user) => user.id === subscription.recruiterUserId);
  const charge = chargeFor(db, recruiter, subscription, { currency: 'VND' });
  return { amount: charge.amount, baseAmount: charge.baseAmount, currency: 'VND' };
}

/** Trial terms as the recruiter sees them. */
function trialPayload(subscription) {
  if (!subscription) return null;
  return {
    days: subscription.trialDays ?? TRIAL_DAYS,
    startedAt: subscription.trialStartedAt ?? null,
    endsAt: subscription.trialEndsAt ?? null,
    extendedForHire: Boolean(subscription.hireExtensionGrantedAt),
  };
}

function postingsPayload(db, recruiter) {
  const now = Date.now();
  const own = (db.jobs || []).filter((job) => job.employerId === recruiter.id);
  return {
    termDays: POSTING_TERM_DAYS,
    live: own.filter((job) => String(job.status).toLowerCase() === 'active').length,
    paused: own.filter((job) => String(job.status).toLowerCase() === 'paused').length,
    lockedSlots: own.filter((job) => job.slotLockedUntil && job.slotLockedUntil > now).length,
    verifiedHire: hasVerifiedHire(db, recruiter.id),
  };
}

/** What this recruiter's plan costs and grants, in their own currency. */
function planSummary(db, recruiter) {
  const planCode = resolvePlanCode(findSubscription(db, recruiter.id));
  const key = seatPlanKey(planCode);
  const plan = PLANS[key];
  const currency = currencyForCountry(recruiter.country);
  return {
    planCode, key, display: plan.display, currency,
    monthly: planPrice(key, currency),
    annual: planPrice(key, currency, 'annual'),
    seats: plan.seats, liveJobSlots: plan.liveJobSlots,
    analytics: plan.analytics, atsExport: plan.atsExport,
  };
}

/** A recruiter with no team row still gets a coherent one-person answer, so the
 *  Subscription page never has to special-case "no team yet". */
function teamPayload(db, recruiter) {
  const planCode = resolvePlanCode(findSubscription(db, recruiter.id));
  const team = findTeam(db, recruiter.id);
  const nameOf = (id) => db.users.find((user) => user.id === id)?.name || id;
  return {
    teamId: team?.id || null,
    isOwner: team ? team.ownerUserId === recruiter.id : true,
    seatsAllowed: seatsAllowed(planCode),
    seatsUsed: team ? activeMembers(team).length : 1,
    members: team
      ? team.members.map((member) => ({ ...member, name: nameOf(member.userId) }))
      : [{ userId: recruiter.id, role: 'owner', status: 'active', joinedAt: recruiter.createdAt || null, name: recruiter.name }],
  };
}

app.get('/api/billing/subscription', async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    const payload = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts have a subscription'); error.status = 400; throw error; }
      return billingPayload(db, recruiter);
    });
    res.json(payload);
  } catch (error) { next(error); }
});

app.post('/api/billing/start-trial', async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const payload = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts can start a trial'); error.status = 400; throw error; }
      getOrCreateTrialSubscription(db, recruiterId); // idempotent — a repeat call never restarts the clock
      return billingPayload(db, recruiter);
    });
    res.status(201).json(payload);
  } catch (error) { next(error); }
});

/* Choose which plan to pay for. This records an intention only — entitlements
 * still follow the subscription's real state, so selecting Agency does not hand
 * out Agency until Agency has actually been paid for. */
app.post('/api/billing/plan', async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const planKey = reqString(req.body, 'planKey', { max: 32 });
    const interval = req.body?.interval ? reqString(req.body, 'interval', { max: 16 }) : null;
    const payload = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts have a plan'); error.status = 400; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      const result = selectPlan(db, subscription, planKey, interval, recruiterId);
      if (result.outcome === 'invalid_plan') { const error = new Error(`planKey must be one of ${SELECTABLE_PLANS.join(', ')}`); error.status = 400; throw error; }
      if (result.outcome === 'invalid_interval') { const error = new Error('interval must be monthly or annual'); error.status = 400; throw error; }
      // Extra live roles (+USD 20 each per month, every plan).
      if (req.body?.extraJobSlots !== undefined) setExtraJobSlots(db, subscription, req.body.extraJobSlots, recruiterId);
      return billingPayload(db, recruiter);
    });
    res.json(payload);
  } catch (error) { next(error); }
});

/* Seats. A recruiter who never invites anyone has no team row and this returns
 * a one-person view built on the fly — so nothing about a solo account changes
 * shape just because the seat model now exists. */
app.get('/api/billing/team', async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    const payload = await store.read().then((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts have seats'); error.status = 400; throw error; }
      return teamPayload(db, recruiter);
    });
    res.json(payload);
  } catch (error) { next(error); }
});

/** Invite a teammate by email. Over the seat limit they join read-only rather
 * than being refused — losing seats must never lock a colleague out. */
app.post('/api/billing/team/members', rateLimit({ windowMs: 3600000, max: 20, bucket: 'team-invite' }), async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const email = reqString(req.body, 'email', { max: 254 }).trim().toLowerCase();
    const payload = await store.transaction((db) => {
      const owner = db.users.find((user) => user.id === recruiterId);
      if (!owner) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (owner.role !== 'employer') { const error = new Error('Only recruiter accounts have seats'); error.status = 400; throw error; }

      const invitee = db.users.find((user) => String(user.email || '').toLowerCase() === email);
      if (!invitee) { const error = new Error('No account with that email yet — ask them to register first.'); error.status = 404; throw error; }
      if (invitee.role !== 'employer') { const error = new Error('Only recruiter accounts can take a seat'); error.status = 400; throw error; }
      if (findTeam(db, invitee.id)) { const error = new Error('That recruiter already belongs to a team'); error.status = 409; throw error; }

      const team = getOrCreateTeam(db, owner.id);
      const planCode = resolvePlanCode(db.subscriptions.find((entry) => entry.recruiterUserId === owner.id));
      const result = addMember(db, team, invitee.id, planCode);
      logBillingEvent(db, owner.id, 'team_member_added', 'team', team.id, { memberId: invitee.id, outcome: result.outcome });
      return teamPayload(db, owner);
    });
    res.status(201).json(payload);
  } catch (error) { next(error); }
});

app.get('/api/billing/referral', async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    const payload = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts have a referral link'); error.status = 400; throw error; }
      const code = getOrCreateReferralCode(db, recruiter);
      const referrals = db.referrals.filter((entry) => entry.referrerUserId === recruiterId);
      return {
        referralCode: code,
        successfulReferrals: referrals.filter((entry) => entry.status === 'qualified').length,
        pendingReferrals: referrals.filter((entry) => entry.status !== 'qualified' && entry.status !== 'rejected').length,
        credits: availableCredits(db, recruiterId),
      };
    });
    res.json(payload);
  } catch (error) { next(error); }
});

// Fired once by the landing page the moment a ?ref=/ /ref/ link is opened —
// sets the 30-day signed cookie later read (only) by recruiter registration.
app.post('/api/billing/referral/track', rateLimit({ windowMs: 3600000, max: 60, bucket: 'referral-track' }), async (req, res, next) => {
  try {
    const code = reqString(req.body, 'code', { max: 40 });
    const db = await store.read();
    if (!findReferrerByCode(db, code)) return res.json({ ok: false });
    issueReferralCookie(res, code);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/billing/payments', rateLimit({ windowMs: 3600000, max: 20, bucket: 'payment-submit' }), async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const paymentMethod = oneOf(req.body, 'paymentMethod', MANUAL_METHOD_IDS);
    const payerName = optString(req.body, 'payerName', { max: 160 });
    const bankName = optString(req.body, 'bankName', { max: 160 });
    const transferDate = optString(req.body, 'transferDate', { max: 40 });
    const txHash = optString(req.body, 'txHash', { max: 80 });
    const payment = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts submit payments'); error.status = 400; throw error; }
      if (paymentMethod === USDT_METHOD) {
        // SARL only, never from Vietnam (crypto is not a lawful means of payment there). Founder, 2026-11-24.
        if (!isTrc20Address(paymentInstructions(db).usdtTrc20Address)) { const error = new Error('USDT payment is not available yet'); error.status = 503; throw error; }
        if (!companyCountry(recruiter) || isVietnam(companyCountry(recruiter))) { const error = new Error('USDT payment is only available to companies outside Vietnam. Please add your company country in your profile, or pay by bank transfer or PayPal.'); error.status = 403; throw error; }
        if (!allowedMethods(db, recruiter).includes('usdt')) { const error = new Error('USDT payment is not offered for your company’s country'); error.status = 403; throw error; }
        if (txHash && !isTronTxHash(txHash)) throw new ValidationError('txHash', 'Enter the 64-character TRON transaction ID');
        if (txHash && db.payments.some((p) => p.txHash === txHash.toLowerCase())) { const error = new Error('This transaction was already submitted'); error.status = 409; throw error; }
      }
      if (paymentMethod === 'sepa_transfer' && !allowedMethods(db, recruiter).includes('sepa_transfer')) { const error = new Error('SEPA transfer is not offered for your company’s country'); error.status = 403; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      const now = Date.now();
      const amountFields = paymentAmountFields(db, subscription);
      const created = {
        id: crypto.randomUUID(),
        recruiterUserId: recruiterId,
        subscriptionId: subscription.id,
        ...amountFields,
        // USDT is a USD stablecoin: always billed as the plan's USD price, 1 USDT = 1 USD.
        ...(paymentMethod === USDT_METHOD ? { currency: 'USDT', amount: chargeFor(db, recruiter, subscription, { currency: 'USD' }).amount, txHash: txHash ? txHash.toLowerCase() : null, network: 'TRC-20' } : {}),
        paymentMethod,
        status: 'submitted',
        paymentReference: generateTransferReference(db),
        invoiceNumber: generateInvoiceNumber(db),
        payerName: payerName || null,
        bankName: bankName || null,
        transferDate: transferDate || null,
        proofFileUrl: null,
        adminNote: null,
        confirmedByAdminId: null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.payments.push(created);
      logBillingEvent(db, recruiterId, 'payment_submitted', 'payment', created.id, { paymentMethod, invoiceNumber: created.invoiceNumber });
      return created;
    });
    await sendMail({ to: process.env.BILLING_SUPPORT_EMAIL, subject: `Payment submitted — ${payment.invoiceNumber}`, text: `Recruiter ${recruiterId} submitted a ${payment.paymentMethod} payment (${payment.currency} ${payment.amount}). Reference ${payment.paymentReference}. Review in the admin billing dashboard.` }).catch(() => undefined);
    res.status(201).json(payment);
  } catch (error) { next(error); }
});

app.get('/api/billing/payments', async (req, res, next) => {
  try {
    const recruiterId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    const db = await store.read();
    assertDemoActor(req, db, recruiterId);
    const payments = db.payments.filter((entry) => entry.recruiterUserId === recruiterId).sort((a, b) => b.createdAt - a.createdAt);
    res.json({ payments });
  } catch (error) { next(error); }
});

const PROOF_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const PROOF_MAX_BYTES = Number(process.env.PAYMENT_PROOF_MAX_MB || 5) * 1024 * 1024;
const PROOF_DIR = path.join(UPLOADS_ROOT, 'payment-proofs');
await fs.promises.mkdir(PROOF_DIR, { recursive: true });

app.post('/api/billing/payments/:id/proof', uploadLimiter, express.raw({ type: () => true, limit: `${Number(process.env.PAYMENT_PROOF_MAX_MB || 5)}mb` }), async (req, res, next) => {
  try {
    const ext = PROOF_TYPES[req.headers['content-type']];
    if (!ext) { const error = new Error('Only PNG, JPEG, WEBP, or PDF proof files are accepted'); error.status = 415; throw error; }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    if (req.body.length > PROOF_MAX_BYTES) { const error = new Error(`Proof file must be under ${process.env.PAYMENT_PROOF_MAX_MB || 5}MB`); error.status = 413; throw error; }
    const payment = await store.transaction((db) => {
      const item = db.payments.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Payment not found'); error.status = 404; throw error; }
      requireSelf(req, item.recruiterUserId);
      assertDemoActor(req, db, item.recruiterUserId);
      return item;
    });
    const storedName = `${payment.recruiterUserId}-${payment.id}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await fs.promises.writeFile(path.join(PROOF_DIR, storedName), req.body);
    const updated = await store.transaction((db) => {
      const item = db.payments.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Payment not found'); error.status = 404; throw error; }
      item.proofFileUrl = `/api/billing/payments/${item.id}/proof`;
      item.proofStoredName = storedName;
      item.updatedAt = Date.now();
      return item;
    });
    res.status(201).json(updated);
  } catch (error) { next(error); }
});

// Gated read-back: only the recruiter who submitted it, or an admin, can view
// a proof file — never served as a public/unauthenticated static asset.
app.get('/api/billing/payments/:id/proof', async (req, res, next) => {
  try {
    const db = await store.read();
    const payment = db.payments.find((entry) => entry.id === req.params.id);
    if (!payment || !payment.proofStoredName) { const error = new Error('Not found'); error.status = 404; throw error; }
    const session = authSession(req);
    const isOwner = session ? session.sub === payment.recruiterUserId : demoAuth;
    const isAdmin = session?.role === 'admin';
    if (!isOwner && !isAdmin) { const error = new Error('Not authorized to view this file'); error.status = 403; throw error; }
    if (isOwner && !isAdmin) assertDemoActor(req, db, payment.recruiterUserId);
    res.sendFile(path.join(PROOF_DIR, payment.proofStoredName));
  } catch (error) { next(error); }
});

// --- VNPay: direct Visa/Mastercard/JCB card payment ------------------------
// Card number is entered on VNPay's own hosted page, never on ours. The
// browser-facing return route is UX-only; the server-to-server IPN route
// below is the sole authority that ever confirms a payment — see
// server/billing/providers/vnpay.js for why.

app.post('/api/billing/payments/vnpay/create', rateLimit({ windowMs: 3600000, max: 20, bucket: 'vnpay-create' }), async (req, res, next) => {
  try {
    if (!isVnpayConfigured()) { const error = new Error('Card payment is not configured yet — use bank transfer / VietQR for now'); error.status = 503; throw error; }
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const payment = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts submit payments'); error.status = 400; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      const now = Date.now();
      const created = {
        id: crypto.randomUUID(),
        recruiterUserId: recruiterId,
        subscriptionId: subscription.id,
        // VNPay settles in VND only, so the charge is forced to that currency
        // regardless of where the account says it is.
        ...paymentAmountFields(db, subscription),
        ...vnpayAmount(db, subscription),
        paymentMethod: 'vnpay',
        status: 'pending',
        paymentReference: null,
        invoiceNumber: generateInvoiceNumber(db),
        payerName: null,
        bankName: null,
        transferDate: null,
        proofFileUrl: null,
        adminNote: null,
        confirmedByAdminId: null,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.payments.push(created);
      logBillingEvent(db, recruiterId, 'vnpay_payment_created', 'payment', created.id, { invoiceNumber: created.invoiceNumber });
      return created;
    });
    const returnUrl = process.env.VNPAY_RETURN_URL;
    if (!returnUrl) { const error = new Error('VNPAY_RETURN_URL is not configured'); error.status = 503; throw error; }
    const redirectUrl = buildPaymentUrl({
      txnRef: payment.id,
      orderInfo: `JobsMatchNow subscription ${payment.invoiceNumber}`,
      ipAddr: req.ip,
      returnUrl,
    });
    res.status(201).json({ payment, redirectUrl });
  } catch (error) { next(error); }
});

// Browser-facing redirect target after the recruiter finishes on VNPay's
// page. Confirms the payment (idempotent, signature-gated) as a UX
// convenience in case the IPN call hasn't landed yet, but is never the only
// path that can confirm a payment.
app.get('/api/billing/vnpay/return', async (req, res) => {
  try {
    if (!verifyVnpaySignature(req.query)) return res.redirect('/?billing=failed');
    const txnRef = String(req.query.vnp_TxnRef || '');
    if (isVnpaySuccess(req.query)) {
      await store.transaction((db) => {
        const payment = db.payments.find((entry) => entry.id === txnRef && entry.paymentMethod === 'vnpay');
        if (payment && payment.status !== 'confirmed') confirmPayment(db, payment, { source: 'vnpay' });
      }).catch(() => undefined);
      return res.redirect('/?billing=success');
    }
    return res.redirect('/?billing=failed');
  } catch {
    res.redirect('/?billing=failed');
  }
});

// Server-to-server webhook VNPay calls directly — the authoritative
// confirmation path. Must always reply with VNPay's own {RspCode,Message}
// JSON shape (never a generic error page), or VNPay will keep retrying.
app.get('/api/billing/vnpay/ipn', async (req, res) => {
  try {
    if (!verifyVnpaySignature(req.query)) return res.json({ RspCode: '97', Message: 'Invalid signature' });
    const txnRef = String(req.query.vnp_TxnRef || '');
    const result = await store.transaction((db) => {
      const payment = db.payments.find((entry) => entry.id === txnRef && entry.paymentMethod === 'vnpay');
      if (!payment) return { code: '01', message: 'Order not found' };
      const expectedAmount = Math.round(payment.amount) * 100;
      if (String(req.query.vnp_Amount) !== String(expectedAmount)) return { code: '04', message: 'Invalid amount' };
      if (payment.status === 'confirmed') return { code: '02', message: 'Order already confirmed' };
      if (!isVnpaySuccess(req.query)) {
        payment.status = 'rejected';
        payment.adminNote = `VNPay declined: response ${req.query.vnp_ResponseCode}`;
        payment.updatedAt = Date.now();
        logBillingEvent(db, payment.recruiterUserId, 'vnpay_payment_declined', 'payment', payment.id, { responseCode: req.query.vnp_ResponseCode });
        return { code: '00', message: 'Confirm Success' };
      }
      const confirmed = confirmPayment(db, payment, { source: 'vnpay' });
      return { code: '00', message: 'Confirm Success', confirmed };
    });
    if (result.confirmed && !result.confirmed.alreadyConfirmed) {
      if (result.confirmed.recruiterEmail) await sendMail({ to: result.confirmed.recruiterEmail, subject: 'Payment confirmed — JobsMatchNow', text: `Hi ${result.confirmed.recruiterName || ''},\n\nYour card payment has been confirmed. Your recruiter access is active through ${new Date(result.confirmed.subscription.currentPeriodEndsAt).toDateString()}.\n\n— JobsMatchNow` }).catch(() => undefined);
      if (result.confirmed.qualification && result.confirmed.referrerEmail) await sendMail({ to: result.confirmed.referrerEmail, subject: 'You earned a free month — JobsMatchNow', text: 'A recruiter you referred just completed their first paid month. You\'ve earned one free 30-day month, applied automatically the next time your subscription needs it.\n\n— JobsMatchNow' }).catch(() => undefined);
    }
    res.json({ RspCode: result.code, Message: result.message });
  } catch {
    res.json({ RspCode: '99', Message: 'Unknown error' });
  }
});

// --- payOS: VietQR checkout, automatic confirmation (founder, 2026-11-24) ---
// Customers scan the VietQR with any Vietnamese banking app, ZaloPay or MoMo. VND only (the plan's VND price).
// The browser return is UX only; the signed webhook below is the only path that confirms a payment.

app.post('/api/billing/payments/payos/create', rateLimit({ windowMs: 3600000, max: 20, bucket: 'payos-create' }), async (req, res, next) => {
  try {
    if (!isPayosConfigured()) { const error = new Error('VietQR payment (payOS) is not configured yet'); error.status = 503; throw error; }
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const { payment, recruiterEmail } = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts submit payments'); error.status = 400; throw error; }
      if (!allowedMethods(db, recruiter).includes('payos')) { const error = new Error('VietQR payment is not offered for your company’s country'); error.status = 403; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      const vnd = vnpayAmount(db, subscription);
      if (!(vnd.amount > 0)) { const error = new Error('This plan has no VND price'); error.status = 400; throw error; }
      const existing = new Set(db.payments.filter((p) => p.paymentMethod === 'payos').map((p) => Number(p.paymentReference)));
      const now = Date.now();
      const created = {
        id: crypto.randomUUID(), recruiterUserId: recruiterId, subscriptionId: subscription.id,
        ...paymentAmountFields(db, subscription), ...vnd, paymentMethod: 'payos', status: 'pending',
        paymentReference: String(newOrderCode(existing)), invoiceNumber: generateInvoiceNumber(db), payerName: null, bankName: null,
        transferDate: null, proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null,
        createdAt: now, updatedAt: now,
      };
      db.payments.push(created);
      logBillingEvent(db, recruiterId, 'payos_payment_created', 'payment', created.id, { invoiceNumber: created.invoiceNumber });
      return { payment: created, recruiterEmail: recruiter.email };
    });
    const base = process.env.WEB_APP_URL || 'https://jobsmatchnow.com';
    const link = await createPayosLink({
      orderCode: Number(payment.paymentReference), amount: payment.amount, description: payosDescription(payment.invoiceNumber),
      returnUrl: `${base}/api/billing/payos/return`, cancelUrl: `${base}/?billing=failed`, buyerEmail: recruiterEmail,
      items: [{ name: `JobsMatchNow ${payment.planKey || 'plan'}`, quantity: 1, price: Math.round(payment.amount) }],
    });
    res.status(201).json({ payment, redirectUrl: link.checkoutUrl });
  } catch (error) { next(error); }
});

// Browser return after the payOS page: UX only (never confirms), the webhook does.
app.get('/api/billing/payos/return', (req, res) => {
  res.redirect(String(req.query.status || '').toUpperCase() === 'PAID' || req.query.code === '00' ? '/?billing=success' : '/?billing=failed');
});

// payOS server-to-server webhook: the authoritative confirmation. Always answers 200 JSON so payOS stops retrying
// (and so its "test webhook" on registration, for an unknown order, succeeds).
app.post('/api/billing/payos/webhook', async (req, res) => {
  try {
    if (!verifyPayosWebhook(req.body)) return res.status(400).json({ success: false, error: 'Invalid signature' });
    const data = req.body.data || {};
    const result = await store.transaction((db) => {
      const payment = db.payments.find((p) => p.paymentMethod === 'payos' && p.paymentReference === String(data.orderCode));
      if (!payment) return { skipped: true };
      if (payment.status === 'confirmed') return { alreadyConfirmed: true };
      if (Math.round(Number(data.amount)) !== Math.round(payment.amount)) {
        payment.adminNote = `payOS amount mismatch: received ${data.amount}, expected ${payment.amount}`;
        payment.updatedAt = Date.now();
        logBillingEvent(db, payment.recruiterUserId, 'payos_amount_mismatch', 'payment', payment.id, { received: data.amount });
        return { mismatch: true };
      }
      if (!isPayosPaid(req.body)) return { notPaid: true };
      payment.payerName = data.counterAccountName || null;
      payment.bankName = data.counterAccountBankName || null;
      payment.transferDate = data.transactionDateTime || null;
      return confirmPayment(db, payment, { source: 'payos' });
    });
    if (result?.payment && !result.alreadyConfirmed && result.recruiterEmail) {
      await sendMail({ to: result.recruiterEmail, subject: 'Payment confirmed — JobsMatchNow', text: `Hi ${result.recruiterName || ''},\n\nYour VietQR payment has been confirmed. Your recruiter access is active through ${new Date(result.subscription.currentPeriodEndsAt).toDateString()}.\n\n— JobsMatchNow` }).catch(() => undefined);
    }
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// --- Stripe: recruiter subscription checkout (France-registered merchant) --
// The webhook (registered earlier, before express.json()) is the sole
// confirmation authority; this route only starts the checkout.

app.post('/api/billing/payments/stripe/create-checkout-session', rateLimit({ windowMs: 3600000, max: 20, bucket: 'stripe-create' }), async (req, res, next) => {
  try {
    if (!isStripeConfigured()) { const error = new Error('Card payment via Stripe is not configured yet'); error.status = 503; throw error; }
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const { payment, recruiterEmail, paymentMethodTypes } = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts submit payments'); error.status = 400; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      // EUR for European companies when the plan has a EUR price (SEPA, Bancontact and iDEAL need EUR); else USD.
      // Extra live roles have no EUR price, so a charge with extras stays in USD.
      const allowed = allowedMethods(db, recruiter);
      const { region } = zoneOf(companyCountry(recruiter) || recruiter.country);
      const usdCharge = chargeFor(db, recruiter, subscription, { currency: 'USD' });
      const eurPrice = planPrice(usdCharge.planKey, 'EUR', usdCharge.interval);
      const currency = region === 'EU' && Number.isFinite(eurPrice) && eurPrice > 0 && !usdCharge.extraJobSlots ? 'EUR' : 'USD';
      const charge = currency === 'EUR' ? chargeFor(db, recruiter, subscription, { currency: 'EUR' }) : usdCharge;
      const types = stripePaymentTypes(allowed, currency);
      if (!types.length) { const error = new Error('Card payment is not offered for your company’s country'); error.status = 403; throw error; }
      const now = Date.now();
      const created = {
        id: crypto.randomUUID(), recruiterUserId: recruiterId, subscriptionId: subscription.id,
        ...paymentAmountFields(db, subscription), amount: charge.amount, baseAmount: charge.baseAmount, currency, paymentMethod:'stripe', status: 'pending',
        paymentReference: null, invoiceNumber: generateInvoiceNumber(db), payerName: null, bankName: null,
        transferDate: null, proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null,
        createdAt: now, updatedAt: now,
      };
      db.payments.push(created);
      logBillingEvent(db, recruiterId, 'stripe_checkout_created', 'payment', created.id, { invoiceNumber: created.invoiceNumber, currency, types });
      return { payment: created, recruiterEmail: recruiter.email, paymentMethodTypes: types };
    });
    const returnBase = process.env.WEB_APP_URL || 'https://jobsmatchnow.com';
    const session = await createCheckoutSession({
      clientReferenceId: payment.id, customerEmail: recruiterEmail,
      successUrl: `${returnBase}/?billing=success`, cancelUrl: `${returnBase}/?billing=failed`,
      amount: payment.amount, currency: payment.currency, interval: payment.billingInterval, productName: `JobsMatchNow ${PLANS[payment.planKey]?.display || 'plan'}`,
      paymentMethodTypes,
    });
    res.status(201).json({ payment, redirectUrl: session.url });
  } catch (error) { next(error); }
});

// --- PayPal: recruiter subscription checkout ------------------------------
// Same shape as Stripe/VNPay: the webhook is authoritative, this route only
// starts the subscription approval flow.

app.post('/api/billing/payments/paypal/create-subscription', rateLimit({ windowMs: 3600000, max: 20, bucket: 'paypal-create' }), async (req, res, next) => {
  try {
    if (!isPaypalConfigured()) { const error = new Error('Card payment via PayPal is not configured yet'); error.status = 503; throw error; }
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const payment = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts submit payments'); error.status = 400; throw error; }
      if (!allowedMethods(db, recruiter).includes('paypal')) { const error = new Error('PayPal is not offered for your company’s country'); error.status = 403; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      const now = Date.now();
      const created = {
        id: crypto.randomUUID(), recruiterUserId: recruiterId, subscriptionId: subscription.id,
        ...paymentAmountFields(db, subscription), paymentMethod:'paypal', status: 'pending',
        paymentReference: null, invoiceNumber: generateInvoiceNumber(db), payerName: null, bankName: null,
        transferDate: null, proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null,
        createdAt: now, updatedAt: now,
      };
      db.payments.push(created);
      logBillingEvent(db, recruiterId, 'paypal_subscription_created', 'payment', created.id, { invoiceNumber: created.invoiceNumber });
      return created;
    });
    const returnBase = process.env.WEB_APP_URL || 'https://jobsmatchnow.com';
    const subscription = await createPaypalSubscription({
      customId: payment.id, planKey: payment.planKey, returnUrl: `${returnBase}/?billing=success`, cancelUrl: `${returnBase}/?billing=failed`,
    });
    await store.transaction((db) => {
      const item = db.payments.find((entry) => entry.id === payment.id);
      if (item) item.paymentReference = subscription.id;
    });
    res.status(201).json({ payment, redirectUrl: approveLink(subscription) });
  } catch (error) { next(error); }
});

// --- Google Play: recruiter subscription purchased inside the Android app -
// The native PlayBillingPlugin (android/app/.../PlayBillingPlugin.java)
// acknowledges the purchase locally (required by Google), but this route —
// or the RTDN webhook below — is the only thing that ever confirms it,
// after independently re-verifying the purchase token against Google's own
// Android Publisher API.

app.post('/api/billing/payments/google-play/verify', rateLimit({ windowMs: 3600000, max: 20, bucket: 'google-play-verify' }), async (req, res, next) => {
  try {
    if (!isGooglePlayConfigured()) { const error = new Error('Google Play billing is not configured yet'); error.status = 503; throw error; }
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const purchaseToken = reqString(req.body, 'purchaseToken', { max: 4000 });
    const verified = await verifySubscriptionPurchase(purchaseToken);
    if (!verified.isActive) { const error = new Error('This purchase is not in an active state'); error.status = 402; throw error; }
    const result = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts submit payments'); error.status = 400; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      const invoiceNumber = `google-play-${verified.latestOrderId || purchaseToken}`;
      if (db.payments.some((entry) => entry.paymentMethod === 'google_play' && entry.invoiceNumber === invoiceNumber)) {
        return { alreadyConfirmed: true };
      }
      // The plan comes from the base plan Google says was bought (solo / duo / team), never from the app.
      const planKey = planKeyForBasePlan(verified.basePlanId, PLANS) || selectedPlanKeyOf(subscription);
      subscription.selectedPlanKey = planKey;
      const now = Date.now();
      const payment = {
        id: crypto.randomUUID(), recruiterUserId: recruiterId, subscriptionId: subscription.id,
        ...paymentAmountFields(db, subscription), currency: 'USD', paymentMethod:'google_play', status: 'pending',
        paymentReference: purchaseToken, invoiceNumber, payerName: null, bankName: null, transferDate: null,
        proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null, createdAt: now, updatedAt: now,
      };
      db.payments.push(payment);
      return confirmPayment(db, payment, { source: 'google_play' });
    });
    res.json(result);
  } catch (error) { next(error); }
});

// Pub/Sub push subscription target for Real-time Developer Notifications.
// Secured by a shared secret in the URL (?token=...) rather than verifying
// Pub/Sub's own OIDC token, same idiom as the existing billing-cron
// endpoint. Always returns 200 (even on a no-op) so Pub/Sub doesn't retry
// forever — the notification is only ever a hint to re-verify, never
// trusted on its own.
app.post('/api/billing/google-play/rtdn', async (req, res) => {
  try {
    if (!isValidRtdnSecret(req.query.token)) return res.status(403).json({ error: 'Invalid token' });
    const parsed = parseRtdnMessage(req.body);
    if (!parsed?.purchaseToken) return res.json({ ok: true, skipped: true });
    const verified = await verifySubscriptionPurchase(parsed.purchaseToken).catch(() => null);
    if (!verified?.isActive) return res.json({ ok: true, skipped: true });
    const result = await store.transaction((db) => {
      // Each Google order (first purchase, then every renewal) extends the plan exactly once (founder, 2026-11-24:
      // renewals were never extended before, because the first, already-confirmed payment was reused).
      const invoiceNumber = `google-play-${verified.latestOrderId || parsed.purchaseToken}`;
      if (db.payments.some((entry) => entry.paymentMethod === 'google_play' && entry.invoiceNumber === invoiceNumber)) return { alreadyConfirmed: true };
      const first = db.payments.find((entry) => entry.paymentMethod === 'google_play' && entry.paymentReference === parsed.purchaseToken);
      if (!first) return { skipped: true }; // not linked to a recruiter yet (the app's verify call does that)
      const subscription = db.subscriptions.find((entry) => entry.id === first.subscriptionId);
      if (!subscription) return { skipped: true };
      const planKey = planKeyForBasePlan(verified.basePlanId, PLANS);
      if (planKey) subscription.selectedPlanKey = planKey;
      const now = Date.now();
      const payment = {
        id: crypto.randomUUID(), recruiterUserId: first.recruiterUserId, subscriptionId: subscription.id,
        ...paymentAmountFields(db, subscription), currency: 'USD', paymentMethod: 'google_play', status: 'pending',
        paymentReference: parsed.purchaseToken, invoiceNumber, payerName: null, bankName: null, transferDate: null,
        proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null, createdAt: now, updatedAt: now,
      };
      db.payments.push(payment);
      return confirmPayment(db, payment, { source: 'google_play' });
    });
    if (result?.payment && !result.alreadyConfirmed && result.recruiterEmail) {
      await sendMail({ to: result.recruiterEmail, subject: 'Payment confirmed — JobsMatchNow', text: `Hi ${result.recruiterName || ''},\n\nYour Google Play payment has been confirmed. Your recruiter access is active through ${new Date(result.subscription.currentPeriodEndsAt).toDateString()}.\n\n— JobsMatchNow` }).catch(() => undefined);
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true, error: true });
  }
});

// --- Apple: recruiter subscription purchased inside the iOS app ------------
// The native AppleIAPPlugin (ios/App/App/AppleIAPPlugin.swift) finishes the
// StoreKit transaction locally, but this route — or the Server Notification
// V2 webhook below — is the only thing that ever confirms it, after
// independently re-verifying against Apple's own App Store Server API.

app.post('/api/billing/payments/apple/verify', rateLimit({ windowMs: 3600000, max: 20, bucket: 'apple-verify' }), async (req, res, next) => {
  try {
    if (!isAppleConfigured()) { const error = new Error('Apple App Store billing is not configured yet'); error.status = 503; throw error; }
    const recruiterId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const transactionId = reqString(req.body, 'transactionId', { max: 200 });
    const verified = await getTransactionInfo(transactionId);
    if (!verified.isActive) { const error = new Error('This purchase is not in an active state'); error.status = 402; throw error; }
    const result = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterId);
      if (!recruiter) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, recruiterId);
      if (recruiter.role !== 'employer') { const error = new Error('Only recruiter accounts submit payments'); error.status = 400; throw error; }
      const subscription = getOrCreateTrialSubscription(db, recruiterId);
      const invoiceNumber = `apple-${verified.transactionId}`;
      if (db.payments.some((entry) => entry.paymentMethod === 'apple_iap' && entry.invoiceNumber === invoiceNumber)) {
        return { alreadyConfirmed: true };
      }
      const now = Date.now();
      const payment = {
        id: crypto.randomUUID(), recruiterUserId: recruiterId, subscriptionId: subscription.id,
        ...paymentAmountFields(db, subscription), paymentMethod:'apple_iap', status: 'pending',
        paymentReference: verified.originalTransactionId, invoiceNumber, payerName: null, bankName: null, transferDate: null,
        proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null, createdAt: now, updatedAt: now,
      };
      db.payments.push(payment);
      return confirmPayment(db, payment, { source: 'apple_iap' });
    });
    res.json(result);
  } catch (error) { next(error); }
});

// Apple Server Notifications V2 target. Always returns 200 (even on a
// no-op) so Apple doesn't keep retrying — the notification is only ever a
// hint to re-verify, never trusted on its own beyond its JWS signature.
app.post('/api/billing/apple/notifications', async (req, res) => {
  try {
    const outer = req.body?.signedPayload;
    if (!outer || !(await verifyJws(outer))) return res.json({ ok: true, skipped: true });
    const decoded = decodeJws(outer);
    const signedTransactionInfo = decoded?.payload?.data?.signedTransactionInfo;
    if (!signedTransactionInfo || !(await verifyJws(signedTransactionInfo))) return res.json({ ok: true, skipped: true });
    const transactionInfo = decodeJws(signedTransactionInfo).payload;
    const isActive = !transactionInfo.revocationDate && (!transactionInfo.expiresDate || transactionInfo.expiresDate > Date.now());
    if (!isActive) return res.json({ ok: true, skipped: true });
    const result = await store.transaction((db) => {
      // originalTransactionId is constant for the life of the subscription,
      // but transactionId is unique PER RENEWAL — so dedup/lookup on the
      // invoice number (transactionId), never reuse the first payment's row
      // for a later renewal, or renewals 2+ would silently never extend
      // anything (confirmPayment would just see it's already confirmed).
      const invoiceNumber = `apple-${transactionInfo.transactionId}`;
      if (db.payments.some((entry) => entry.paymentMethod === 'apple_iap' && entry.invoiceNumber === invoiceNumber)) {
        return { alreadyConfirmed: true };
      }
      const priorPayment = db.payments.find((entry) => entry.paymentMethod === 'apple_iap' && entry.paymentReference === transactionInfo.originalTransactionId);
      if (!priorPayment) return { skipped: true }; // no local recruiter linked to this subscription yet
      // Bug fix (2026-11-24): `subscription` was never defined here, so every renewal threw and was silently dropped.
      const subscription = db.subscriptions.find((entry) => entry.id === priorPayment.subscriptionId);
      if (!subscription) return { skipped: true };
      const now = Date.now();
      const payment = {
        id: crypto.randomUUID(), recruiterUserId: priorPayment.recruiterUserId, subscriptionId: priorPayment.subscriptionId,
        ...paymentAmountFields(db, subscription), paymentMethod:'apple_iap', status: 'pending',
        paymentReference: transactionInfo.originalTransactionId, invoiceNumber, payerName: null, bankName: null, transferDate: null,
        proofFileUrl: null, adminNote: null, confirmedByAdminId: null, confirmedAt: null, createdAt: now, updatedAt: now,
      };
      db.payments.push(payment);
      return confirmPayment(db, payment, { source: 'apple_iap' });
    });
    if (result?.payment && !result.alreadyConfirmed && result.recruiterEmail) {
      await sendMail({ to: result.recruiterEmail, subject: 'Payment confirmed — JobsMatchNow', text: `Hi ${result.recruiterName || ''},\n\nYour App Store payment has been confirmed. Your recruiter access is active through ${new Date(result.subscription.currentPeriodEndsAt).toDateString()}.\n\n— JobsMatchNow` }).catch(() => undefined);
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true, error: true });
  }
});

// --- Admin billing dashboard & actions (real per-user admin role) ----------

app.get('/api/admin/billing/payments', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const status = optString(req.query, 'status', { max: 40 });
    let payments = [...db.payments].sort((a, b) => b.createdAt - a.createdAt);
    if (status) payments = payments.filter((entry) => entry.status === status);
    const withRecruiter = payments.map((payment) => {
      const recruiter = db.users.find((user) => user.id === payment.recruiterUserId);
      return { ...payment, recruiter: recruiter ? { id: recruiter.id, name: recruiter.name, email: recruiter.email, company: recruiter.company } : null };
    });
    res.json({ payments: withRecruiter });
  } catch (error) { next(error); }
});

app.get('/api/admin/billing/overview', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const now = Date.now();
    const recruiters = db.users.filter((user) => user.role === 'employer' && !user.demo);
    const subsByRecruiter = new Map(db.subscriptions.map((entry) => [entry.recruiterUserId, entry]));
    const withStatus = recruiters.map((recruiter) => {
      const subscription = subsByRecruiter.get(recruiter.id);
      return { recruiter: { id: recruiter.id, name: recruiter.name, email: recruiter.email, company: recruiter.company }, subscription, effectiveStatus: computeEffectiveStatus(subscription, now) };
    });
    res.json({
      pendingPayments: db.payments.filter((p) => p.status === 'submitted' || p.status === 'pending'),
      confirmedPayments: db.payments.filter((p) => p.status === 'confirmed'),
      rejectedOrRefundedPayments: db.payments.filter((p) => ['rejected', 'refunded', 'reversed'].includes(p.status)),
      activeTrials: withStatus.filter((entry) => entry.effectiveStatus === 'trialing'),
      trialsEndingSoon: withStatus.filter((entry) => entry.effectiveStatus === 'trialing' && entry.subscription?.trialEndsAt && entry.subscription.trialEndsAt - now <= 7 * DAY_MS),
      graceAccounts: withStatus.filter((entry) => entry.effectiveStatus === 'grace_period'),
      expiredAccounts: withStatus.filter((entry) => entry.effectiveStatus === 'expired'),
      referralRewards: db.referrals.filter((entry) => entry.status === 'qualified'),
      suspiciousReferrals: db.referrals.filter((entry) => entry.suspicious === true),
      flaggedForJobReview: db.users.filter((user) => user.flaggedForJobReview === true).map((user) => ({ id: user.id, name: user.name, email: user.email })),
      recentAuditLog: db.billingEvents.slice(-200).reverse(),
    });
  } catch (error) { next(error); }
});

/**
 * Plans, per-recruiter usage against their limits, and the job-post credit
 * ledger — everything the pricing model exposes, in one read. Uses the bulk
 * entitlement index so this stays a single pass over jobs and credits no matter
 * how many recruiters exist.
 */
app.get('/api/admin/billing/plans', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const now = Date.now();
    const index = buildEntitlementIndex(db);
    const subsByRecruiter = new Map(db.subscriptions.map((entry) => [entry.recruiterUserId, entry]));
    const nameById = new Map(db.users.map((user) => [user.id, user.name || user.id]));

    const recruiters = db.users
      .filter((user) => user.role === 'employer' && !user.demo)
      .map((recruiter) => {
        const subscription = subsByRecruiter.get(recruiter.id);
        const entitlements = getRecruiterEntitlements(db, recruiter, subscription, now, index);
        return {
          recruiter: { id: recruiter.id, name: recruiter.name, email: recruiter.email, company: recruiter.company },
          effectiveStatus: computeEffectiveStatus(subscription, now),
          trialEndsAt: subscription?.trialEndsAt ?? null,
          currentPeriodEndsAt: subscription?.currentPeriodEndsAt ?? null,
          ...entitlements,
        };
      })
      .sort((a, b) => (b.activeJobCount - a.activeJobCount) || a.recruiter.name.localeCompare(b.recruiter.name));

    const planCounts = recruiters.reduce((acc, entry) => { acc[entry.planCode] = (acc[entry.planCode] || 0) + 1; return acc; }, {});

    res.json({
      enforced: entitlementsEnforced(),
      planCounts,
      recruiters,
      creditLedger: [...(db.jobPostCredits || [])]
        .sort((a, b) => (b.grantedAt || 0) - (a.grantedAt || 0))
        .slice(0, 200)
        .map((credit) => ({ ...credit, recruiterName: nameById.get(credit.recruiterUserId) || credit.recruiterUserId })),
      // What the entitlement checks WOULD have blocked — the observe-before-
      // enforce signal. Only meaningful while `enforced` is false.
      shadowBlocks: db.billingEvents
        .filter((event) => event.eventType === 'job_publish_blocked' || event.eventType === 'job_edit_blocked')
        .slice(-100).reverse()
        .map((event) => ({ ...event, userName: nameById.get(event.userId) || event.userId })),
      // The price list itself, read straight from the catalogue so the dashboard
      // can never show a tier the server does not actually sell.
      catalog: {
        plans: Object.values(PLANS).map((plan) => ({
          key: plan.key, display: plan.display, order: plan.order,
          seats: plan.seats, liveJobSlots: plan.liveJobSlots,
          monthlyMatchCap: plan.monthlyMatchCap,
          analytics: plan.analytics, atsExport: plan.atsExport, priorityPlacement: plan.priorityPlacement,
          usd: planPrice(plan.key, 'USD'), vnd: planPrice(plan.key, 'VND'),
          hireFeePercent: plan.hireFeePercent ?? null,
        })).sort((a, b) => a.order - b.order),
        boost: { hours: BOOST_HOURS, usd: boostPrice('USD'), vnd: boostPrice('VND'), kinds: BOOST_KINDS },
        singlePosting: { termDays: SINGLE_POSTING.termDays, usd: singlePostingPrice('USD'), vnd: singlePostingPrice('VND') },
        payPerHireFeePercent: PAY_PER_HIRE_FEE_PERCENT,
        postingTermDays: POSTING_TERM_DAYS,
        trialDays: TRIAL_DAYS,
        trialLiveJobs: TRIAL_ACTIVE_JOB_LIMIT,
      },
      teams: (db.teams || []).map((team) => ({
        id: team.id,
        owner: nameById.get(team.ownerUserId) || team.ownerUserId,
        planCode: subsByRecruiter.get(team.ownerUserId)?.planCode || 'free',
        seatsAllowed: seatsAllowed(subsByRecruiter.get(team.ownerUserId)?.planCode || 'starter'),
        active: activeMembers(team).length,
        total: team.members.length,
      })),
      boosts: [...(db.boosts || [])]
        .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        .slice(0, 100)
        .map((boost) => ({
          ...boost,
          targetName: boost.kind === 'job'
            ? (db.jobs.find((job) => job.id === boost.targetId)?.title || boost.targetId)
            : (nameById.get(boost.targetId) || boost.targetId),
          buyerName: nameById.get(boost.purchasedByUserId) || boost.purchasedByUserId,
          live: boost.status === 'active' && boost.expiresAt > now,
        })),
    });
  } catch (error) { next(error); }
});

/** Grant a job-post credit by hand (support/goodwill/compensation). Reason is
 * mandatory and lands in the audit log, same contract as every other admin
 * override in this dashboard. */
app.post('/api/admin/billing/job-credits', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const recruiterUserId = reqString(req.body, 'recruiterUserId', { max: 128 });
    const reason = reqString(req.body, 'reason', { min: 3, max: 500 });
    const credit = await store.transaction((db) => {
      const recruiter = db.users.find((user) => user.id === recruiterUserId && user.role === 'employer');
      if (!recruiter) { const error = new Error('Recruiter not found'); error.status = 404; throw error; }
      if (!Array.isArray(db.jobPostCredits)) db.jobPostCredits = [];
      const now = Date.now();
      const granted = {
        id: crypto.randomUUID(), recruiterUserId, sourceType: 'admin_grant', sourceReferenceId: null,
        idempotencyKey: `admin:${crypto.randomUUID()}`, status: 'available', grantedAt: now,
        consumedAt: null, revokedAt: null, consumedByJobId: null, createdAt: now, updatedAt: now,
      };
      db.jobPostCredits.push(granted);
      logBillingEvent(db, session.sub, 'admin_job_credit_granted', 'jobPostCredit', granted.id, { recruiterUserId, reason });
      return granted;
    });
    res.status(201).json(credit);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/job-credits/:id/revoke', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = reqString(req.body, 'reason', { min: 3, max: 500 });
    const credit = await store.transaction((db) => {
      const item = (db.jobPostCredits || []).find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Credit not found'); error.status = 404; throw error; }
      if (item.status !== 'available') { const error = new Error(`Only unused credits can be revoked (this one is ${item.status})`); error.status = 409; throw error; }
      return revokeJobCredit(db, item, session.sub, reason);
    });
    res.json(credit);
  } catch (error) { next(error); }
});

/* Boosts are granted by an admin, not bought self-serve. The card rails are
 * still test-mode/sandbox, so there is no honest way to take money for one
 * in-app yet — rather than fake a purchase flow, an admin starts the boost once
 * payment is settled the same way bank-transfer subscriptions already work. */
app.post('/api/admin/billing/boosts', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const kind = reqString(req.body, 'kind', { max: 32 });
    const targetId = reqString(req.body, 'targetId', { max: 128 });
    const reason = reqString(req.body, 'reason', { min: 3, max: 500 });
    if (!BOOST_KINDS.includes(kind)) { const error = new Error(`kind must be one of ${BOOST_KINDS.join(', ')}`); error.status = 400; throw error; }

    const result = await store.transaction((db) => {
      const owner = kind === 'job'
        ? db.users.find((user) => user.id === db.jobs.find((job) => job.id === targetId)?.employerId)
        : db.users.find((user) => user.id === targetId && user.role === 'candidate');
      if (!owner) { const error = new Error(kind === 'job' ? 'Job not found' : 'Candidate not found'); error.status = 404; throw error; }
      const started = startBoost(db, { kind, targetId, purchasedByUserId: owner.id, currency: currencyForCountry(owner.country) });
      logBillingEvent(db, session.sub, 'admin_boost_granted', 'boost', started.boost.id, { kind, targetId, reason, outcome: started.outcome });
      return started;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/boosts/:id/revoke', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = reqString(req.body, 'reason', { min: 3, max: 500 });
    const boost = await store.transaction((db) => {
      const item = (db.boosts || []).find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Boost not found'); error.status = 404; throw error; }
      item.status = 'revoked';
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'admin_boost_revoked', 'boost', item.id, { kind: item.kind, targetId: item.targetId, reason });
      return item;
    });
    res.json(boost);
  } catch (error) { next(error); }
});

// Read-only marketplace snapshot for the solo admin — real (non-demo) users
// only, so the seeded showcase accounts never inflate the numbers.
app.get('/api/admin/analytics/overview', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const now = Date.now();
    const since = (days) => now - days * DAY_MS;
    const demoUserIds = new Set(db.users.filter((user) => user.demo === true).map((user) => user.id));
    const realUsers = db.users.filter((user) => !demoUserIds.has(user.id));
    const candidates = realUsers.filter((user) => user.role === 'candidate');
    const recruiters = realUsers.filter((user) => user.role === 'employer');
    const realJobs = db.jobs.filter((job) => !demoUserIds.has(job.employerId));
    const realMatches = db.matches.filter((match) => !demoUserIds.has(match.employerId) && !demoUserIds.has(match.candidateId));

    // Revenue: MRR sums each subscription's OWN plan price, normalised to USD.
    // It used to be (count × one flat price), which was right when there was
    // one plan and quietly wrong the moment the ladder shipped — an Agency
    // account would have counted as 20 instead of 130. Still never summed from
    // payment.amount directly: payments are stored in whatever currency the
    // rail used, so adding those raw would mix USD and VND into one number.
    const realRecruiterIds = new Set(recruiters.map((user) => user.id));
    const realSubscriptions = db.subscriptions.filter((sub) => realRecruiterIds.has(sub.recruiterUserId) && sub.status !== 'cancelled');
    const activeSubscriptions = realSubscriptions.filter((sub) => computeEffectiveStatus(sub, now) === 'active');
    const mrr = monthlyRecurringRevenue(db, activeSubscriptions);
    const confirmedPayments = db.payments.filter((payment) => payment.status === 'confirmed' && realRecruiterIds.has(payment.recruiterUserId));
    const recruitersEverPaid = new Set(confirmedPayments.map((payment) => payment.recruiterUserId));
    const trialToPaidConversionPct = realSubscriptions.length ? Math.round((recruitersEverPaid.size / realSubscriptions.length) * 100) : 0;

    res.json({
      totalCandidates: candidates.length,
      newCandidates7d: candidates.filter((user) => user.createdAt >= since(7)).length,
      newCandidates30d: candidates.filter((user) => user.createdAt >= since(30)).length,
      totalRecruiters: recruiters.length,
      newRecruiters7d: recruiters.filter((user) => user.createdAt >= since(7)).length,
      newRecruiters30d: recruiters.filter((user) => user.createdAt >= since(30)).length,
      totalJobs: realJobs.length,
      activeJobs: realJobs.filter((job) => !['expired', 'suspended'].includes(String(job.status).toLowerCase())).length,
      totalMatches: realMatches.length,
      newMatches7d: realMatches.filter((match) => match.createdAt >= since(7)).length,
      totalMessages: db.messages.filter((message) => realMatches.some((match) => match.id === message.matchId)).length,
      mrr, mrrCurrency: PRICE_CURRENCY,
      activeSubscriptions: activeSubscriptions.length,
      trialToPaidConversionPct,
      confirmedPaymentsCount: confirmedPayments.length,
      confirmedPayments30d: confirmedPayments.filter((payment) => payment.confirmedAt >= since(30)).length,
    });
  } catch (error) { next(error); }
});

// Funnel events per ISO week (Monday, UTC). Demo/seeded activity excluded
// unless ?includeDemo=true. Read-only, admin session required.
app.get('/api/admin/analytics/events', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    res.json({ weeks: weeklyCounts(db.eventCounts, { includeDemo: req.query.includeDemo === 'true' }) });
  } catch (error) { next(error); }
});

// --- Paid-feature interest (no charge): e.g. "Target roles+" (3 roles, $5/month) ---
// Candidates can't be charged yet; this records who wants a feature so the founder can decide.
const INTEREST_FEATURES = ['target-roles-plus', 'direct-messages-plus', 'candidate-premium'];
app.post('/api/me/interest', rateLimit({ windowMs: 3600000, max: 20, bucket: 'interest' }), async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const feature = oneOf(req.body, 'feature', INTEREST_FEATURES);
    await store.transaction((db) => {
      assertDemoActor(req, db, userId);
      if (!Array.isArray(db.featureInterest)) db.featureInterest = [];
      if (!db.featureInterest.some((x) => x.userId === userId && x.feature === feature)) db.featureInterest.push({ userId, feature, at: Date.now() });
    });
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

// --- Read-only connector for the member's own AI assistant (MCP) ---------------
// Members create a personal key in "Use your chatbot here"; their assistant calls
// POST /api/mcp with it. Keys are stored hashed and can be revoked.
app.get('/api/me/connector-keys', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    const db = await store.read();
    res.json({ keys: (db.connectorKeys || []).filter((k) => k.userId === userId).map(({ hash, ...k }) => k) });
  } catch (error) { next(error); }
});
app.post('/api/me/connector-keys', rateLimit({ windowMs: 3600000, max: 10, bucket: 'connector-key' }), async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const label = optString(req.body, 'label', { max: 60 }) || 'My assistant';
    const key = newConnectorKey();
    const record = await store.transaction((db) => {
      assertDemoActor(req, db, userId);
      if (!Array.isArray(db.connectorKeys)) db.connectorKeys = [];
      if (db.connectorKeys.filter((k) => k.userId === userId).length >= 5) throw new ValidationError('label', 'You already have 5 keys — revoke one first');
      const item = { id: crypto.randomUUID(), userId, label, hash: hashKey(key), last4: key.slice(-4), createdAt: Date.now(), lastUsedAt: null };
      db.connectorKeys.push(item);
      return item;
    });
    const { hash, ...shown } = record;
    res.status(201).json({ key, record: shown }); // the key is shown once, never again
  } catch (error) { next(error); }
});
app.delete('/api/me/connector-keys/:id', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    await store.transaction((db) => {
      assertDemoActor(req, db, userId);
      db.connectorKeys = (db.connectorKeys || []).filter((k) => !(k.id === req.params.id && k.userId === userId));
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------
// "Ask AI" (job seekers): questions about the member's OWN data, answered by a configurable
// server-side AI provider (see server/ai-chat.js). Session required — no demo bypass, no userId
// parameter: the member is always the session user. Read-only. Daily per-member limit.
// ---------------------------------------------------------------------------
// Burst guard on top of the daily limit (AI_CHAT_BURST_PER_MIN, default 10 requests a minute).
const aiChatLimiter = rateLimit({ windowMs: 60 * 1000, max: Number(process.env.AI_CHAT_BURST_PER_MIN) || 10, bucket: 'ai-chat' });
async function aiChatUser(req) {
  const session = authSession(req);
  if (!session) { const error = new Error('Sign in to use Ask AI'); error.status = 401; throw error; }
  const db = await store.read();
  const user = db.users.find((u) => u.id === session.sub && !u.suspendedAt);
  if (!user) { const error = new Error('Sign in to use Ask AI'); error.status = 401; throw error; }
  if (user.role !== 'candidate' && user.role !== 'employer') { const error = new Error('Ask AI is for job seekers and hiring teams'); error.status = 403; throw error; }
  return { user, db };
}
/* Premium for this user. Candidates: the 7-day Premium add-on (server/premium.js).
 * Hiring teams: their plan — the 8-week trial and every paid plan include the AI Hiring Assistant. */
function premiumFor(db, user, now = Date.now()) {
  if (user.role !== 'employer') return premiumState(user, now);
  const sub = findSubscription(db, user.id);
  const status = sub ? computeEffectiveStatus(sub, now) : null;
  const onPlan = ['trialing', 'active', 'grace_period'].includes(status);
  const exempt = isBillingExempt(user) || user.demo === true;
  const endsAt = status === 'trialing' ? sub.trialEndsAt : (sub?.currentPeriodEndsAt || null);
  return {
    active: onPlan || exempt || premiumActive(user, now),
    source: exempt ? 'demo' : status === 'trialing' ? 'trial' : onPlan ? 'paid' : null,
    trialUsed: Boolean(sub?.trialStartedAt), trialDays: TRIAL_DAYS, plan: 'recruiter',
    trialEndsAt: sub?.trialEndsAt || null, paidUntil: sub?.currentPeriodEndsAt || null,
    daysLeft: onPlan && endsAt ? Math.max(0, Math.ceil((endsAt - now) / DAY_MS)) : null,
  };
}
const aiUsageOf = (db, userId) =>(db.aiChatUsage || []).find((u) => u.id === `${userId}:${aiToday()}`)?.count || 0;
// Members' own keys are encrypted with AI_KEY_SECRET (or the session secret when it is not set).
const aiKeySecret = () => process.env.AI_KEY_SECRET || sessionSecret;
const aiKeyRecOf = (db, userId) => (db.aiKeys || []).find((k) => k.id === userId) || null;
/** The member's own key wins; else the server's provider (if configured). */
function aiChatConfig(db, user) {
  const rec = aiKeyRecOf(db, user.id);
  if (rec) {
    const key = decryptAiKey(rec.enc, aiKeySecret());
    if (key) return { cfg: aiOwnKeyConfig(rec, key), rec };
    return { cfg: { enabled: false, reason: 'own_key_unreadable' }, rec };
  }
  return { cfg: aiProviderConfig(), rec: null };
}

app.get('/api/ai/chat/status', async (req, res, next) => {
  try {
    const { user, db } = await aiChatUser(req);
    const { cfg, rec } = aiChatConfig(db, user);
    const base = { ownKey: publicAiKeyInfo(rec), canSaveKey: user.demo !== true, keyLinks: AI_KEY_LINKS, premium: premiumFor(db, user) };
    res.json(cfg.enabled ? { ...base, enabled: true, source: cfg.source, provider: cfg.provider, providerLabel: cfg.label, model: cfg.model, dailyLimit: cfg.limit, remaining: Math.max(0, cfg.limit - aiUsageOf(db, user.id)) } : { ...base, enabled: false, reason: cfg.reason });
  } catch (error) { next(error); }
});

// The member's own AI key: checked with the provider, stored encrypted, never sent back (last 4 only).
const aiKeyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: Number(process.env.AI_KEY_SAVES_PER_HOUR) || 10, bucket: 'ai-key' });
app.get('/api/ai/key', async (req, res, next) => {
  try {
    const { user, db } = await aiChatUser(req);
    res.json({ key: publicAiKeyInfo(aiKeyRecOf(db, user.id)), canSave: user.demo !== true, links: AI_KEY_LINKS });
  } catch (error) { next(error); }
});
app.put('/api/ai/key', aiKeyLimiter, async (req, res, next) => {
  try {
    const { user } = await aiChatUser(req);
    if (user.demo === true) return res.status(403).json({ error: 'Demo accounts are shared, so they cannot save an AI key. Create your own free account to connect your chatbot.', code: 'demo_account' });
    const provider = String(req.body?.provider || '');
    const apiKey = String(req.body?.apiKey || '').trim();
    const tier = req.body?.tier === 'fast' ? 'fast' : 'best';
    const formatError = aiKeyFormatError(provider, apiKey);
    if (formatError) throw new ValidationError('apiKey', formatError);
    const check = await verifyAiKey(provider, apiKey);
    const who = provider === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (ChatGPT)';
    if (!check.ok) {
      const msg = check.code === 'key_refused' ? `${who} refused this key. Check that you copied the whole key and that it is still active.` : `We could not reach ${who} to check the key. Try again in a minute.`;
      return res.status(check.status).json({ error: msg, code: check.code, field: 'apiKey' });
    }
    const rec = { id: user.id, userId: user.id, provider, tier, model: pickAiModel(provider, tier, check.models), last4: apiKey.slice(-4), enc: encryptAiKey(apiKey, aiKeySecret()), savedAt: Date.now() };
    await store.transaction((tx) => {
      if (!Array.isArray(tx.aiKeys)) tx.aiKeys = [];
      tx.aiKeys = tx.aiKeys.filter((k) => k.id !== user.id);
      tx.aiKeys.push(rec);
    });
    res.json({ key: publicAiKeyInfo(rec) });
  } catch (error) { next(error); }
});
// Premium add-on: state + one-time free trial (no card, no auto-renewal). See server/premium.js.
app.get('/api/premium', async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) { const error = new Error('Sign in first'); error.status = 401; throw error; }
    const db = await store.read();
    const user = db.users.find((u) => u.id === session.sub && !u.suspendedAt);
    if (!user) { const error = new Error('Sign in first'); error.status = 401; throw error; }
    res.json(premiumFor(db, user));
  } catch (error) { next(error); }
});
app.post('/api/premium/trial', rateLimit({ windowMs: 60 * 60 * 1000, max: 10, bucket: 'premium-trial' }), async (req, res, next) => {
  try {
    const session = authSession(req);
    if (!session) { const error = new Error('Sign in first'); error.status = 401; throw error; }
    const citizenship = optString(req.body || {}, 'citizenship', { max: 80 });
    const state = await store.transaction((tx) => {
      const user = tx.users.find((u) => u.id === session.sub && !u.suspendedAt);
      if (!user) { const error = new Error('Sign in first'); error.status = 401; throw error; }
      // Candidates starting Premium give their citizenship (founder, 2026-11-24): it decides which payment methods
      // they will be offered. Asked only if their profile does not have it yet.
      if (user.role === 'candidate') {
        if (citizenship) {
          if (!user.nationality) user.nationality = citizenship;
          user.citizenship = [...new Set([...(user.citizenship || []), citizenship])].slice(0, 5);
        }
        if (!user.nationality && !user.citizenship?.length) throw new ValidationError('citizenship', 'Choose your citizenship to start Premium (it decides which payment methods you can use).');
      }
      if (user.role === 'employer') { // hiring teams: the plan's free trial (idempotent, never restarts the clock)
        if (findSubscription(tx, user.id)) { const error = new Error('Your free trial was already used.'); error.status = 409; throw error; }
        getOrCreateTrialSubscription(tx, user.id);
        return premiumFor(tx, user);
      }
      return startPremiumTrial(user);
    });
    res.json(state);
  } catch (error) { next(error); }
});

app.delete('/api/ai/key', async (req, res, next) => {
  try {
    const { user } = await aiChatUser(req);
    await store.transaction((tx) => { tx.aiKeys = (tx.aiKeys || []).filter((k) => k.id !== user.id); });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/ai/chat', aiChatLimiter, async (req, res, next) => {
  try {
    const { user, db } = await aiChatUser(req);
    const question = String(req.body?.question || '').trim();
    if (!question) throw new ValidationError('question', 'Ask a question');
    if (question.length > 1000) throw new ValidationError('question', 'Keep the question under 1000 characters');
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : [];
    const prem = premiumFor(db, user);
    if (!prem.active) return res.status(402).json({ error: user.role === 'employer'
      ? (prem.trialUsed ? 'Your trial has ended. Ask AI is included in every recruiter plan.' : `Ask AI is included in every recruiter plan. Start your free ${TRIAL_DAYS}-day trial to use it.`)
      : (prem.trialUsed ? 'Your Premium trial has ended. Ask AI is part of Premium.' : `Ask AI is part of Premium. Start your free ${PREMIUM_TRIAL_DAYS}-day trial to use it.`), code: 'premium_required' });
    const { cfg } = aiChatConfig(db, user);
    if (!cfg.enabled) return res.status(503).json(cfg.reason === 'own_key_unreadable'
      ? { error: 'Your saved AI key can no longer be read. Please connect your chatbot again.', code: cfg.reason }
      : { error: 'Ask AI is not set up yet. Connect your own Claude or ChatGPT key to start.', code: cfg.reason });
    if (aiUsageOf(db, user.id) >= cfg.limit) return res.status(429).json({ error: `You reached today's limit of ${cfg.limit} questions. It resets tomorrow.`, code: 'daily_limit' });
    // The member's own data, through the same bootstrap the app shows them (session user only).
    const cookie = `${AUTH_COOKIE}=${signedValue({ sub: user.id, role: user.role, expiresAt: Date.now() + 60000 }, sessionSecret)}`;
    const r = await fetch(`http://127.0.0.1:${req.socket.localPort}/api/bootstrap?userId=${encodeURIComponent(user.id)}`, { headers: { Cookie: cookie } });
    if (!r.ok) return res.status(503).json({ error: 'Your JobsMatchNow data could not be loaded right now. Try again in a minute.', code: 'data_unavailable' });
    const ctx = buildAiContext(await r.json());
    if (ctx.empty) return res.json({ answer: user.role === 'employer'
      ? 'I don\'t have enough of your data yet to answer: you have no active roles and no matches. Post a role, then ask again.'
      : 'I don\'t have enough of your data yet to answer: your profile has no skills, and you have no matching roles or matches. Add your skills and target roles in your profile, then ask again.', sources: [], provider: null, remaining: Math.max(0, cfg.limit - aiUsageOf(db, user.id)) });
    // Count the question before calling the provider (failed calls still count; protects cost).
    const used = await store.transaction((tx) => {
      if (!Array.isArray(tx.aiChatUsage)) tx.aiChatUsage = [];
      const id = `${user.id}:${aiToday()}`;
      let rec = tx.aiChatUsage.find((u) => u.id === id);
      if (!rec) { rec = { id, userId: user.id, day: aiToday(), count: 0 }; tx.aiChatUsage.push(rec); }
      rec.count += 1;
      return rec.count;
    });
    let answerText;
    try { answerText = await callAiProvider(cfg, { context: ctx.text, question, history, role: user.role }); }
    catch (e) {
      const own = cfg.source === 'own';
      const msg = {
        provider_busy: 'The AI service is busy. Try again in a moment.',
        key_refused: own ? 'Your AI provider refused your key. Open "My AI chatbot" and connect it again.' : 'The AI service is not answering right now. Try again in a moment.',
        no_credit: own ? 'Your AI provider account has no credit left. Add credit on your provider\'s billing page, then retry.' : 'The AI service is not answering right now. Try again in a moment.',
        model_unavailable: own ? 'Your account cannot use the chosen model. Open "My AI chatbot" and switch to the other option.' : 'The AI service is not answering right now. Try again in a moment.',
      }[e.code] || 'The AI service is not answering right now. Try again in a moment.';
      return res.status(e.status || 502).json({ error: msg, code: e.code || 'provider_error', remaining: Math.max(0, cfg.limit - used) });
    }
    res.json({ answer: answerText, sources: citedAiSources(answerText, ctx.sources), provider: cfg.label, remaining: Math.max(0, cfg.limit - used) });
  } catch (error) { next(error); }
});

app.get('/api/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST (MCP streamable HTTP, JSON responses)' }));
app.post('/api/mcp', rateLimit({ windowMs: 60000, max: 60, bucket: 'mcp' }), async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const db = await store.read();
  const keyRec = token ? (db.connectorKeys || []).find((k) => k.hash === hashKey(token)) : null;
  const user = keyRec && db.users.find((u) => u.id === keyRec.userId && !u.suspendedAt);
  if (!user) return res.status(401).set('WWW-Authenticate', 'Bearer').json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Missing or invalid connector key' } });
  store.transaction((d) => { const k = (d.connectorKeys || []).find((x) => x.id === keyRec.id); if (k) k.lastUsedAt = Date.now(); }).catch(() => undefined);
  // The member's own bootstrap, fetched exactly as the app does with a short-lived session for them.
  const loadBoot = async () => {
    const cookie = `${AUTH_COOKIE}=${signedValue({ sub: user.id, role: user.role, expiresAt: Date.now() + 60000 }, sessionSecret)}`;
    const r = await fetch(`http://127.0.0.1:${req.socket.localPort}/api/bootstrap?userId=${encodeURIComponent(user.id)}`, { headers: { Cookie: cookie } });
    if (!r.ok) throw new Error(`bootstrap ${r.status}`);
    return r.json();
  };
  try {
    const body = req.body;
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleRpc(m, loadBoot)))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handleRpc(body, loadBoot);
    return out ? res.json(out) : res.status(202).end();
  } catch (e) {
    return res.status(500).json({ jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32603, message: 'Internal error' } });
  }
});

// --- Admin: the 3 KPIs that matter most for a hiring marketplace -------------
// 1. New registrations (real candidates + hiring teams), 2. mutual matches, 3. hires.
// Real accounts only; each with this week, last week, last 30 days and an 8-week series.
app.get('/api/admin/kpis', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const now = Date.now();
    const demo = new Set(db.users.filter((u) => u.demo === true || u.sample === true).map((u) => u.id));
    const real = (m) => !demo.has(m.candidateId) && !demo.has(m.employerId);
    const regs = db.users.filter((u) => !demo.has(u.id) && (u.role === 'candidate' || u.role === 'employer') && u.createdAt).map((u) => u.createdAt);
    const matches = db.matches.filter(real).map((m) => m.createdAt).filter(Boolean);
    const hiredAt = db.matches.filter((m) => real(m) && (m.stage === 'Hired' || m.currentStepId === 'hire')).map((m) => m.stageChangedAt || m.createdAt).filter(Boolean);
    const weekStart = (t) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day); };
    const thisWeek = weekStart(now);
    const kpi = (times) => ({
      total: times.length,
      thisWeek: times.filter((t) => t >= thisWeek).length,
      lastWeek: times.filter((t) => t >= thisWeek - 7 * DAY_MS && t < thisWeek).length,
      last30d: times.filter((t) => t >= now - 30 * DAY_MS).length,
      weeks: Array.from({ length: 8 }, (_, i) => { const start = thisWeek - (7 - i) * 7 * DAY_MS; return { week: new Date(start).toISOString().slice(0, 10), n: times.filter((t) => t >= start && t < start + 7 * DAY_MS).length }; }),
    });
    res.json({
      registrations: { label: 'New registrations', hint: 'Real candidates and hiring teams who created an account', ...kpi(regs) },
      matches: { label: 'Mutual matches', hint: 'Both sides said yes: a conversation opened', ...kpi(matches) },
      hires: { label: 'Hires', hint: 'Matches moved to the Hired stage (finish line)', ...kpi(hiredAt) },
    });
  } catch (error) { next(error); }
});

// --- Visitor analytics + click heatmap (cookie-free, self-hosted) -----------
const ANALYTICS_DIR = process.env.ANALYTICS_DIR || path.join(path.dirname(UPLOADS_ROOT), 'analytics');
app.post('/api/track', rateLimit({ windowMs: 60000, max: 120, bucket: 'track' }), express.text({ type: () => true, limit: '64kb' }), async (req, res) => {
  try {
    const ua = String(req.headers['user-agent'] || '');
    if (BOT_UA.test(ua)) return res.status(204).end();
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    const payload = parsePayload(body);
    if (!payload) return res.status(400).json({ error: 'Invalid payload' });
    // The owner's own visits never count (founder, 2026-11-24): a signed-in admin is ignored, whatever the device.
    if (authSession(req)?.role === 'admin') return res.status(204).end();
    await recordEvents(ANALYTICS_DIR, payload, { ip: req.ip || '', ua, secret: process.env.SESSION_SECRET });
    res.status(204).end();
  } catch { res.status(204).end(); }
});

app.get('/api/admin/web-analytics', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const days = [1, 7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const now = Date.now();
    const events = await readEvents(ANALYTICS_DIR, reportSince(days, now), now);
    res.json(buildReport(events, days, now));
  } catch (error) { next(error); }
});

// --- Admin: Mixpanel / Amplitude / Heap (server-side event forwarding) -------
app.get('/api/admin/integrations', async (req, res, next) => {
  try { requireAdminRole(authSession(req)); const db = await store.read(); res.json({ integrations: maskedConfig(db.integrations || {}) }); }
  catch (error) { next(error); }
});

app.put('/api/admin/integrations/:vendor', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const vendor = VENDORS[req.params.vendor];
    if (!vendor) { const error = new Error('Unknown integration'); error.status = 404; throw error; }
    const key = req.body?.key === undefined ? undefined : String(req.body.key).trim().slice(0, 200);
    if (key !== undefined && key && !/^[A-Za-z0-9_\-.]{4,200}$/.test(key)) throw new ValidationError('key', 'That key has unexpected characters');
    const integrations = await store.transaction((db) => {
      db.integrations ||= {};
      const current = db.integrations[req.params.vendor] || {};
      db.integrations[req.params.vendor] = { ...current, ...(key !== undefined ? { [vendor.field]: key } : {}), enabled: req.body?.enabled === undefined ? Boolean(current.enabled) : req.body.enabled === true };
      logBillingEvent(db, session.sub, 'integration_updated', 'integration', req.params.vendor, { enabled: db.integrations[req.params.vendor].enabled, keyChanged: key !== undefined });
      return db.integrations;
    });
    setIntegrationConfig(integrations);
    res.json({ integrations: maskedConfig(integrations) });
  } catch (error) { next(error); }
});

app.post('/api/admin/integrations/:vendor/test', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const vendor = VENDORS[req.params.vendor];
    if (!vendor) { const error = new Error('Unknown integration'); error.status = 404; throw error; }
    const db = await store.read();
    const key = db.integrations?.[req.params.vendor]?.[vendor.field];
    if (!key) throw new ValidationError('key', 'Save a key first');
    const result = await sendTo(req.params.vendor, key, { name: 'jobsmatchnow_test_event', dim: 'admin-test', side: '' });
    await recordIntegrationResult(req.params.vendor, result);
    res.json(result);
  } catch (error) { next(error); }
});

async function recordIntegrationResult(vendor, result) {
  try {
    await store.transaction((db) => {
      if (!db.integrations?.[vendor]) return;
      db.integrations[vendor] = { ...db.integrations[vendor], ...(result.ok ? { lastSentAt: Date.now(), lastError: null } : { lastError: result.error }) };
    });
  } catch { /* status only */ }
}
{
  const db = await store.read();
  setIntegrationConfig(db.integrations || {});
  onTrack((name, opts) => forwardEvent(name, opts, (vendor, result) => { if (!result.ok) void recordIntegrationResult(vendor, result); }));
  // Editable plans + payment methods (founder, 2026-11-24): apply what the admin saved.
  applyPlanCatalog(db.siteSettings?.planCatalog);
  applyPaymentSettings(db.paymentSettings);
}

// ---------------------------------------------------------------------------------------------------------------
// Editable pricing plans (founder, 2026-11-24). Defaults live in server/billing/plans.js; the admin's edits are saved in
// db.siteSettings.planCatalog and applied on top. Existing paying customers keep their price (charge.js price lock).
function publicPlan(p) {
  return { key: p.key, display: p.display, order: p.order ?? 99, seats: p.seats, liveJobSlots: p.liveJobSlots, monthlyMatchCap: p.monthlyMatchCap,
    usd: p.prices?.USD?.monthly ?? 0, vnd: p.prices?.VND?.monthly ?? null, eur: p.prices?.EUR?.monthly ?? null,
    tagline: p.tagline || '', perks: p.perks || [], hireFeePercent: p.hireFeePercent ?? null };
}
function planInUse(db, key) {
  const subs = (db.subscriptions || []).filter((s) => [s.selectedPlanKey, s.paidPlanKey, s.planCode, s.priceLock?.planKey].includes(key)).length;
  const pays = (db.payments || []).filter((p) => p.planKey === key).length;
  return { subscriptions: subs, payments: pays, inUse: subs + pays > 0 };
}
function adminCatalog(db) {
  return {
    plans: Object.values(PLANS).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map((p) => ({
      ...publicPlan(p), sellable: isSellable(p), legacy: Boolean(p.legacy), paypalPlanId: p.paypalPlanId || '',
      builtIn: BUILT_IN_PLANS.includes(p.key), custom: !DEFAULT_PLANS[p.key],
      analytics: Boolean(p.analytics), atsExport: Boolean(p.atsExport), aiAssistant: Boolean(p.aiAssistant), outboundMessaging: Boolean(p.outboundMessaging), priorityPlacement: Boolean(p.priorityPlacement),
      ...planInUse(db, p.key),
      lockedCustomers: (db.subscriptions || []).filter((s) => s.priceLock?.planKey === p.key).length,
      lockedList: (db.subscriptions || []).filter((s) => s.priceLock?.planKey === p.key).slice(0, 50).map((s) => {
        const u = db.users.find((x) => x.id === s.recruiterUserId);
        return { subscriptionId: s.id, name: u?.company || u?.name || s.recruiterUserId, prices: s.priceLock.prices };
      }),
    })),
    ladder: [...SEAT_LADDER],
    warnings: ladderWarnings('USD'),
  };
}

// Public price list: the pricing pages read the live catalogue (defaults until the admin edits a plan).
app.get('/api/plans', (_req, res) => {
  res.json({ plans: Object.values(PLANS).filter(isSellable).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map(publicPlan), headline: [...SEAT_LADDER] });
});

app.get('/api/admin/billing/catalog', async (req, res, next) => {
  try { requireAdminRole(authSession(req)); res.json(adminCatalog(await store.read())); } catch (error) { next(error); }
});

// Add or edit a plan. A price change first locks every paying customer of that plan at what they pay today.
app.put('/api/admin/billing/catalog/:key', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const key = String(req.params.key || '').toLowerCase();
    const existing = PLANS[key];
    const { plan, errors } = buildPlanFromInput(key, req.body || {}, existing);
    if (errors.length) { const error = new ValidationError('plan', errors.join(' · ')); throw error; }
    if (key === 'starter' && plan.prices.USD.monthly !== 0) throw new ValidationError('usd', 'Starter is the free plan: its price stays 0');
    const payload = await store.transaction((db) => {
      const priceChanged = existing && ['USD', 'VND', 'EUR'].some((c) => (existing.prices?.[c]?.monthly ?? null) !== (plan.prices?.[c]?.monthly ?? null));
      const locked = priceChanged ? lockCurrentPricesForPlan(db, key) : 0;
      const catalog = { plans: { ...(db.siteSettings?.planCatalog?.plans || {}) }, deleted: (db.siteSettings?.planCatalog?.deleted || []).filter((k) => k !== key) };
      catalog.plans[key] = plan;
      db.siteSettings = { ...(db.siteSettings || {}), planCatalog: catalog };
      applyPlanCatalog(catalog);
      logBillingEvent(db, session.sub, existing ? 'plan_updated' : 'plan_added', 'plan', key, {
        before: existing ? { display: existing.display, usd: existing.prices?.USD?.monthly, vnd: existing.prices?.VND?.monthly, eur: existing.prices?.EUR?.monthly, seats: existing.seats, liveJobSlots: existing.liveJobSlots, sellable: isSellable(existing) } : null,
        after: { display: plan.display, usd: plan.prices.USD.monthly, vnd: plan.prices.VND?.monthly, eur: plan.prices.EUR?.monthly, seats: plan.seats, liveJobSlots: plan.liveJobSlots, sellable: plan.sellable },
        customersKeptTheirPrice: locked,
      });
      return { ...adminCatalog(db), customersKeptTheirPrice: locked };
    });
    res.json(payload);
  } catch (error) { next(error); }
});

// Remove a plan: only a plan nobody ever used can be deleted; otherwise stop selling it (sellable: false).
app.delete('/api/admin/billing/catalog/:key', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const key = String(req.params.key || '').toLowerCase();
    if (!PLANS[key]) { const error = new Error('Plan not found'); error.status = 404; throw error; }
    if (BUILT_IN_PLANS.includes(key)) { const error = new Error('This plan is built in: stop selling it instead'); error.status = 409; throw error; }
    const payload = await store.transaction((db) => {
      const use = planInUse(db, key);
      if (use.inUse) { const error = new Error(`In use by ${use.subscriptions} subscription(s) and ${use.payments} payment(s): stop selling it instead, so those customers keep it`); error.status = 409; throw error; }
      const catalog = { plans: { ...(db.siteSettings?.planCatalog?.plans || {}) }, deleted: [...(db.siteSettings?.planCatalog?.deleted || [])] };
      delete catalog.plans[key];
      if (DEFAULT_PLANS[key] && !catalog.deleted.includes(key)) catalog.deleted.push(key);
      db.siteSettings = { ...(db.siteSettings || {}), planCatalog: catalog };
      applyPlanCatalog(catalog);
      logBillingEvent(db, session.sub, 'plan_deleted', 'plan', key, {});
      return adminCatalog(db);
    });
    res.json(payload);
  } catch (error) { next(error); }
});

// Move one customer to the current price (after telling them: EU rules require notice of a price change).
app.post('/api/admin/billing/subscriptions/:id/reprice', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const subscription = await store.transaction((db) => {
      const item = (db.subscriptions || []).find((s) => s.id === req.params.id);
      if (!item) { const error = new Error('Subscription not found'); error.status = 404; throw error; }
      const before = item.priceLock || null;
      delete item.priceLock;
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'subscription_repriced', 'subscription', item.id, { before });
      return item;
    });
    res.json({ subscription });
  } catch (error) { next(error); }
});

// ---------------------------------------------------------------------------------------------------------------
// Payment methods: keys, on/off switches, and where each method is shown (founder, 2026-11-24).
function methodConfigured(db, method) {
  if (method.provider === 'googleplay') return isGooglePlayConfigured();
  if (method.provider === 'payos') return isPayosConfigured();
  if (method.provider === 'stripe') {
    if (!isStripeConfigured()) return false;
    return method.needsEur ? Object.values(PLANS).some((p) => isSellable(p) && p.prices?.EUR?.monthly > 0) : true;
  }
  if (method.provider === 'paypal') return isPaypalConfigured();
  const info = paymentInstructions(db);
  return (method.needs || []).every((need) => need.split('|').some((field) => (field === 'usdtTrc20Address' ? isTrc20Address(info[field]) : Boolean(info[field]))));
}
/** The method ids a recruiter can use: switched on, configured, and shown for their company's country. */
function allowedMethods(db, recruiter) {
  const settings = db.paymentSettings;
  // Recruiters: the company's country. Candidates (Premium): their citizenship (founder, 2026-11-24).
  // Recruiters: the company's country, then their own citizenship. Candidates (Premium): their citizenship.
  const place = recruiter?.role === 'candidate'
    ? (recruiter.nationality || recruiter.citizenship?.[0] || recruiter.country || '')
    : (companyCountry(recruiter) || recruiter?.nationality || recruiter?.citizenship?.[0] || '');
  return METHODS.filter((m) => isEnabled(settings, m.id) && methodConfigured(db, m) && shownIn(settings, m.id, place)).map((m) => m.id);
}
function adminPaymentMethods(db) {
  const settings = db.paymentSettings;
  const grid = gridOf(settings);
  return {
    methods: METHODS.map((m) => ({ ...m, enabled: isEnabled(settings, m.id), configured: methodConfigured(db, m), grid: grid[m.id] })),
    zones: { regions: REGIONS, countries: COUNTRIES, labels: ZONE_LABEL },
    providers: Object.fromEntries(Object.keys(PROVIDER_FIELDS).map((p) => [p, publicKeys(p)])),
    webhookBase: process.env.WEB_APP_URL || 'https://jobsmatchnow.com',
    eurPricesSet: Object.values(PLANS).filter((p) => isSellable(p) && p.prices?.EUR?.monthly > 0).map((p) => p.key),
  };
}

app.get('/api/admin/billing/payment-methods', async (req, res, next) => {
  try { requireAdminRole(authSession(req)); res.json(adminPaymentMethods(await store.read())); } catch (error) { next(error); }
});

app.put('/api/admin/billing/payment-methods/keys/:provider', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const provider = String(req.params.provider);
    const payload = await store.transaction((db) => {
      db.paymentSettings = saveKeys(db.paymentSettings, provider, req.body || {});
      applyPaymentSettings(db.paymentSettings);
      logBillingEvent(db, session.sub, 'payment_keys_updated', 'payment_settings', provider, { fields: Object.keys(req.body || {}) }); // names only, never values
      return adminPaymentMethods(db);
    });
    res.json(payload);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/payment-methods/test/:provider', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const provider = String(req.params.provider);
    const result = provider === 'stripe' ? await testStripeConnection() : provider === 'paypal' ? await testPaypalConnection() : provider === 'payos' ? await testPayosConnection() : { ok: false, message: 'Unknown provider' };
    res.json(result);
  } catch (error) { next(error); }
});

app.put('/api/admin/billing/payment-methods/:id', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const id = String(req.params.id);
    if (!METHOD_IDS.includes(id)) { const error = new Error('Unknown payment method'); error.status = 404; throw error; }
    const zones = new Set([...REGIONS, ...COUNTRIES]);
    const payload = await store.transaction((db) => {
      const settings = { ...(db.paymentSettings || {}) };
      if (req.body?.enabled !== undefined) settings.enabled = { ...(settings.enabled || {}), [id]: Boolean(req.body.enabled) };
      if (req.body?.grid && typeof req.body.grid === 'object') {
        const g = { ...(settings.grid?.[id] || {}) };
        for (const [zone, value] of Object.entries(req.body.grid)) {
          if (!zones.has(zone)) continue;
          if (id === 'usdt' && zone === 'VN') continue; // locked off
          if (value === null) delete g[zone]; else g[zone] = Boolean(value);
        }
        settings.grid = { ...(settings.grid || {}), [id]: g };
      }
      db.paymentSettings = settings;
      logBillingEvent(db, session.sub, 'payment_method_updated', 'payment_settings', id, { enabled: req.body?.enabled, grid: req.body?.grid });
      return adminPaymentMethods(db);
    });
    res.json(payload);
  } catch (error) { next(error); }
});

// --- Admin: candidate/recruiter account management -------------------------
// Search/suspend/reactivate only — no silent edits to a user's own profile
// data (skills, CV, salary, feedback), matching the "no silent changes"
// principle: every state change here is an explicit suspend/reactivate action
// with a required reason, audit-logged, never a data edit.

function adminUserSummary(user) {
  return {
    id: user.id, role: user.role, kind: user.kind, name: user.name, email: user.email, company: user.company,
    photo: user.photo, completeness: user.completeness, emailVerified: user.emailVerified !== false,
    createdAt: user.createdAt, suspendedAt: user.suspendedAt || null, suspendReason: user.suspendReason || null,
    flaggedForJobReview: user.flaggedForJobReview === true,
  };
}

app.get('/api/admin/users', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const role = optString(req.query, 'role', { max: 20 });
    const q = optString(req.query, 'q', { max: 200 })?.toLowerCase();
    let users = db.users.filter((user) => !user.demo && (user.role === 'candidate' || user.role === 'employer'));
    if (role) users = users.filter((user) => user.role === role);
    if (q) users = users.filter((user) => [user.name, user.email, user.company].some((field) => field && field.toLowerCase().includes(q)));
    res.json({ users: users.sort((a, b) => b.createdAt - a.createdAt).map(adminUserSummary) });
  } catch (error) { next(error); }
});

app.get('/api/admin/users/:id', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const user = db.users.find((entry) => entry.id === req.params.id && !entry.demo);
    if (!user) { const error = new Error('User not found'); error.status = 404; throw error; }
    const matches = db.matches.filter((match) => match.candidateId === user.id || match.employerId === user.id);
    res.json({
      user: adminUserSummary(user),
      jobsPosted: user.role === 'employer' ? db.jobs.filter((job) => job.employerId === user.id).length : undefined,
      matchCount: matches.length,
      messageCount: db.messages.filter((message) => matches.some((match) => match.id === message.matchId)).length,
      reportsSubmitted: db.reports.filter((report) => report.reporterUserId === user.id).length,
      reportsReceived: db.reports.filter((report) => report.targetUserId === user.id).length,
    });
  } catch (error) { next(error); }
});

app.post('/api/admin/users/:id/suspend', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = reqString(req.body, 'reason', { max: 500 });
    const user = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id && !entry.demo);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      if (item.role === 'admin') { const error = new Error('Cannot suspend an admin account'); error.status = 400; throw error; }
      item.suspendedAt = Date.now();
      item.suspendReason = reason;
      logBillingEvent(db, session.sub, 'user_suspended', 'user', item.id, { reason });
      return item;
    });
    res.json(adminUserSummary(user));
  } catch (error) { next(error); }
});

app.post('/api/admin/users/:id/reactivate', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const user = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === req.params.id && !entry.demo);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      item.suspendedAt = null;
      item.suspendReason = null;
      logBillingEvent(db, session.sub, 'user_reactivated', 'user', item.id, {});
      return item;
    });
    res.json(adminUserSummary(user));
  } catch (error) { next(error); }
});

// --- Admin: job moderation ---------------------------------------------------
// Suspend/restore only — a status flip, never a delete, so a wrongly-flagged
// job can always be put back exactly as it was.

app.get('/api/admin/jobs', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const status = optString(req.query, 'status', { max: 20 });
    const q = optString(req.query, 'q', { max: 200 })?.toLowerCase();
    let jobs = db.jobs.filter((job) => !job.demo);
    if (status) jobs = jobs.filter((job) => String(job.status).toLowerCase() === status);
    if (q) jobs = jobs.filter((job) => [job.title, job.company].some((field) => field && field.toLowerCase().includes(q)));
    const withEmployer = jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((job) => {
      const employer = db.users.find((user) => user.id === job.employerId);
      return {
        id: job.id, title: job.title, company: job.company, status: job.status, createdAt: job.createdAt, applicants: job.applicants,
        employer: employer ? { id: employer.id, name: employer.name, email: employer.email, flaggedForJobReview: employer.flaggedForJobReview === true } : null,
      };
    });
    res.json({ jobs: withEmployer });
  } catch (error) { next(error); }
});

app.post('/api/admin/jobs/:id/suspend', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = reqString(req.body, 'reason', { max: 500 });
    const job = await store.transaction((db) => {
      const item = db.jobs.find((entry) => entry.id === req.params.id && !entry.demo);
      if (!item) { const error = new Error('Job not found'); error.status = 404; throw error; }
      item.previousStatus = item.status;
      item.status = 'suspended';
      item.suspendReason = reason;
      logBillingEvent(db, session.sub, 'job_suspended', 'job', item.id, { reason });
      return item;
    });
    res.json(job);
  } catch (error) { next(error); }
});

app.post('/api/admin/jobs/:id/restore', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const job = await store.transaction((db) => {
      const item = db.jobs.find((entry) => entry.id === req.params.id && !entry.demo);
      if (!item) { const error = new Error('Job not found'); error.status = 404; throw error; }
      item.status = item.previousStatus || 'active';
      item.previousStatus = null;
      item.suspendReason = null;
      logBillingEvent(db, session.sub, 'job_restored', 'job', item.id, {});
      return item;
    });
    res.json(job);
  } catch (error) { next(error); }
});

app.post('/api/admin/site-settings', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const activeLandingBanner = oneOf(req.body, 'activeLandingBanner', ['default', 'alt', 'image']);
    await store.transaction((db) => {
      db.siteSettings = { ...db.siteSettings, activeLandingBanner };
      logBillingEvent(db, session.sub, 'site_settings_updated', 'site_settings', 'landing_banner', { activeLandingBanner });
    });
    res.json({ activeLandingBanner });
  } catch (error) { next(error); }
});

app.get('/api/admin/bank-instructions', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    res.json(paymentInstructions(db));
  } catch (error) { next(error); }
});

app.post('/api/admin/bank-instructions', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const bankInstructions = {};
    for (const field of BANK_INSTRUCTION_FIELDS) bankInstructions[field] = optString(req.body, field, { max: 500 }) || '';
    // A mistyped wallet loses customers' money: only a valid TRON address (or empty = USDT off) is saved.
    if (bankInstructions.usdtTrc20Address && !isTrc20Address(bankInstructions.usdtTrc20Address)) throw new ValidationError('usdtTrc20Address', 'Enter a valid TRON (TRC-20) address: T followed by 33 characters');
    if (bankInstructions.sarlIban && !isIban(bankInstructions.sarlIban)) throw new ValidationError('sarlIban', 'This IBAN is not valid (check the letters and digits)');
    if (bankInstructions.sarlBic && !/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bankInstructions.sarlBic.toUpperCase())) throw new ValidationError('sarlBic', 'A BIC/SWIFT code has 8 or 11 letters and digits');
    await store.transaction((db) => {
      db.siteSettings = { ...db.siteSettings, bankInstructions };
      logBillingEvent(db, session.sub, 'bank_instructions_updated', 'site_settings', 'bank_instructions', {});
    });
    res.json(bankInstructions);
  } catch (error) { next(error); }
});

const SITE_IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Admin uploads a full hero-banner image (shown as-is on the landing page
// when activeLandingBanner is 'image') — one current file, overwritten in place.
app.post('/api/admin/site-settings/banner-image', uploadLimiter, express.raw({ type: () => true, limit: '8mb' }), async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const ext = SITE_IMAGE_TYPES[req.headers['content-type']];
    if (!ext) { const error = new Error('Only PNG, JPEG, or WEBP images are accepted'); error.status = 415; throw error; }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ValidationError('file', 'Empty upload');
    for (const otherExt of new Set(Object.values(SITE_IMAGE_TYPES))) {
      if (otherExt !== ext) await fs.promises.unlink(path.join(SITE_DIR, `banner.${otherExt}`)).catch(() => {});
    }
    await fs.promises.writeFile(path.join(SITE_DIR, `banner.${ext}`), req.body);
    await mirror(path.join(SITE_DIR, `banner.${ext}`));
    const updatedAt = Date.now();
    await store.transaction((db) => {
      db.siteSettings = { ...db.siteSettings, bannerImageExt: ext, bannerImageUpdatedAt: updatedAt };
      logBillingEvent(db, session.sub, 'site_banner_image_uploaded', 'site_settings', 'landing_banner_image', { ext });
    });
    res.status(201).json({ bannerImage: { url: `/api/site-settings/banner-image?v=${updatedAt}`, updatedAt } });
  } catch (error) { next(error); }
});

// --- Admin: unified action queue --------------------------------------------
// A single triage list combining everything that genuinely needs an admin's
// attention right now — open reports, open support requests, payments
// awaiting confirmation, trials ending soon, and fair-use flags — so there's
// one place to scan instead of four separate tabs. Read-only summary view;
// the actual resolve/confirm/etc. actions still live on their own tabs.

app.get('/api/admin/action-queue', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const now = Date.now();
    const URGENT_CATEGORIES = new Set(['scam_or_fraud', 'harassment', 'discrimination', 'payment_request']);
    const items = [];

    for (const report of db.reports || []) {
      if (report.status !== 'open') continue;
      const reporter = db.users.find((user) => user.id === report.reporterUserId);
      items.push({
        id: `report-${report.id}`, type: 'report', priority: URGENT_CATEGORIES.has(report.category) ? 'urgent' : 'high',
        summary: `${report.category.replace(/_/g, ' ')} report on ${report.targetType} (${report.targetId})`,
        detail: report.description, submittedBy: reporter?.name || report.reporterUserId, createdAt: report.createdAt,
      });
    }
    for (const request of db.supportRequests || []) {
      if (request.status !== 'open') continue;
      items.push({
        id: `support-${request.id}`, type: 'support', priority: 'high',
        summary: `Support request from ${request.name}`, detail: request.message, submittedBy: request.email, createdAt: request.createdAt,
      });
    }
    for (const payment of db.payments) {
      if (!['submitted', 'pending'].includes(payment.status)) continue;
      const recruiter = db.users.find((user) => user.id === payment.recruiterUserId);
      items.push({
        id: `payment-${payment.id}`, type: 'payment', priority: 'high',
        summary: `Payment awaiting confirmation — ${payment.currency} ${payment.amount} (${payment.invoiceNumber})`,
        detail: payment.paymentMethod, submittedBy: recruiter?.name || payment.recruiterUserId, createdAt: payment.createdAt,
      });
    }
    for (const user of db.users) {
      if (user.demo || user.role !== 'employer' || !user.flaggedForJobReview) continue;
      items.push({
        id: `fair-use-${user.id}`, type: 'fair_use_flag', priority: 'medium',
        summary: `${user.name} flagged for high job-posting volume`, detail: null, submittedBy: user.name, createdAt: now,
      });
    }
    const subsByRecruiter = new Map(db.subscriptions.map((entry) => [entry.recruiterUserId, entry]));
    for (const user of db.users) {
      if (user.demo || user.role !== 'employer') continue;
      const subscription = subsByRecruiter.get(user.id);
      if (!subscription || computeEffectiveStatus(subscription, now) !== 'trialing') continue;
      if (!subscription.trialEndsAt || subscription.trialEndsAt - now > 7 * DAY_MS) continue;
      items.push({
        id: `trial-${user.id}`, type: 'trial_ending', priority: 'medium',
        summary: `${user.name}'s trial ends ${new Date(subscription.trialEndsAt).toDateString()}`, detail: null, submittedBy: user.name, createdAt: now,
      });
    }

    const priorityRank = { urgent: 0, high: 1, medium: 2 };
    items.sort((a, b) => (priorityRank[a.priority] - priorityRank[b.priority]) || (a.createdAt - b.createdAt));
    res.json({ items });
  } catch (error) { next(error); }
});

// --- Fraud / scam / safety reports ------------------------------------------
// Minimal by design: one flat queue (open -> resolved), no severity levels,
// incident state machine, or appeals workflow — see PLAN discussion on
// keeping this scoped for a single-admin operation rather than the full
// moderation-platform spec.

const REPORT_CATEGORIES = ['fake_job', 'scam_or_fraud', 'harassment', 'discrimination', 'spam', 'payment_request', 'impersonation', 'other'];

// Block user (founder, 2026-11-23; Apple guideline 1.2 for apps with chat/profiles). A block hides both people
// from each other everywhere (see blockedBetween in matching-pool.js) and stops messages. Demo accounts are shared
// by every visitor, so they can't block (one visitor's block would hide people for all the others).
function blockerFor(req, db) {
  const session = authSession(req);
  if (!session) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
  const me = db.users.find((user) => user.id === session.sub);
  if (!me) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
  if (me.demo === true) { const error = new Error('Blocking is turned off in demo accounts, which every visitor shares. Sign up to use Block.'); error.status = 403; throw error; }
  return me;
}
app.get('/api/blocks', async (req, res, next) => {
  try {
    const db = await store.read();
    const me = blockerFor(req, db);
    const blocked = (db.blocks || []).filter((b) => b.blockerId === me.id).map((b) => {
      const user = db.users.find((u) => u.id === b.blockedId);
      return { userId: b.blockedId, name: user?.name || 'Member', title: user?.title || '', photo: user?.photo || '', createdAt: b.createdAt };
    });
    res.json({ blocked });
  } catch (error) { next(error); }
});
app.post('/api/blocks', rateLimit({ windowMs: 3600000, max: 60, bucket: 'blocks' }), async (req, res, next) => {
  try {
    const userId = reqString(req.body, 'userId', { max: 128 });
    await store.transaction((db) => {
      const me = blockerFor(req, db);
      if (userId === me.id) { const error = new Error('You can’t block yourself'); error.status = 400; throw error; }
      if (!db.users.some((u) => u.id === userId)) { const error = new Error('Member not found'); error.status = 404; throw error; }
      if (!Array.isArray(db.blocks)) db.blocks = [];
      if (!db.blocks.some((b) => b.blockerId === me.id && b.blockedId === userId)) db.blocks.push({ id: crypto.randomUUID(), blockerId: me.id, blockedId: userId, createdAt: Date.now() });
    });
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});
app.delete('/api/blocks/:userId', async (req, res, next) => {
  try {
    await store.transaction((db) => {
      const me = blockerFor(req, db);
      db.blocks = (db.blocks || []).filter((b) => !(b.blockerId === me.id && b.blockedId === req.params.userId));
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/reports', rateLimit({ windowMs: 3600000, max: 20, bucket: 'reports' }), async (req, res, next) => {
  try {
    const reporterUserId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const targetType = oneOf(req.body, 'targetType', ['user', 'job', 'conversation']);
    const targetId = reqString(req.body, 'targetId', { max: 128 });
    const category = oneOf(req.body, 'category', REPORT_CATEGORIES);
    const description = optString(req.body, 'description', { max: 2000 });
    const report = await store.transaction((db) => {
      assertDemoActor(req, db, reporterUserId);
      const now = Date.now();
      const created = {
        id: crypto.randomUUID(), reporterUserId, targetType, targetId, category, description: description || null,
        status: 'open', resolution: null, resolvedByAdminId: null, resolvedAt: null, createdAt: now, updatedAt: now,
      };
      if (!Array.isArray(db.reports)) db.reports = [];
      db.reports.push(created);
      return created;
    });
    res.status(201).json(report);
  } catch (error) { next(error); }
});

app.get('/api/admin/reports', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const status = optString(req.query, 'status', { max: 20 });
    let reports = [...(db.reports || [])];
    if (status) reports = reports.filter((report) => report.status === status);
    const withReporter = reports.sort((a, b) => b.createdAt - a.createdAt).map((report) => {
      const reporter = db.users.find((user) => user.id === report.reporterUserId);
      return { ...report, reporterName: reporter?.name || report.reporterUserId };
    });
    res.json({ reports: withReporter });
  } catch (error) { next(error); }
});

app.post('/api/admin/reports/:id/resolve', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const resolution = reqString(req.body, 'resolution', { max: 1000 });
    const report = await store.transaction((db) => {
      const item = (db.reports || []).find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Report not found'); error.status = 404; throw error; }
      item.status = 'resolved';
      item.resolution = resolution;
      item.resolvedByAdminId = session.sub;
      item.resolvedAt = Date.now();
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'report_resolved', 'report', item.id, { resolution });
      return item;
    });
    res.json(report);
  } catch (error) { next(error); }
});

app.post('/api/admin/reports/:id/dismiss', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const report = await store.transaction((db) => {
      const item = (db.reports || []).find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Report not found'); error.status = 404; throw error; }
      item.status = 'dismissed';
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'report_dismissed', 'report', item.id, {});
      return item;
    });
    res.json(report);
  } catch (error) { next(error); }
});

// --- Customer support requests ----------------------------------------------
// A basic contact-form ticket queue — open/resolved only, no assignment or
// SLA-timer workflow.

app.post('/api/support/requests', rateLimit({ windowMs: 3600000, max: 10, bucket: 'support' }), async (req, res, next) => {
  try {
    const name = reqString(req.body, 'name', { max: 160 });
    const email = reqString(req.body, 'email', { max: 200 });
    const message = reqString(req.body, 'message', { max: 4000 });
    const userId = optString(req.body, 'userId', { max: 128 });
    const request = await store.transaction((db) => {
      const now = Date.now();
      const created = {
        id: crypto.randomUUID(), userId: userId || null, name, email: email.toLowerCase(), message,
        status: 'open', resolvedByAdminId: null, resolvedAt: null, createdAt: now, updatedAt: now,
      };
      if (!Array.isArray(db.supportRequests)) db.supportRequests = [];
      db.supportRequests.push(created);
      return created;
    });
    await sendMail({ to: process.env.BILLING_SUPPORT_EMAIL, subject: `Support request from ${name}`, text: `${email}\n\n${message}` }).catch(() => undefined);
    res.status(201).json(request);
  } catch (error) { next(error); }
});

app.get('/api/admin/support/requests', async (req, res, next) => {
  try {
    requireAdminRole(authSession(req));
    const db = await store.read();
    const status = optString(req.query, 'status', { max: 20 });
    let requests = [...(db.supportRequests || [])];
    if (status) requests = requests.filter((entry) => entry.status === status);
    res.json({ requests: requests.sort((a, b) => b.createdAt - a.createdAt) });
  } catch (error) { next(error); }
});

app.post('/api/admin/support/requests/:id/resolve', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const request = await store.transaction((db) => {
      const item = (db.supportRequests || []).find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Support request not found'); error.status = 404; throw error; }
      item.status = 'resolved';
      item.resolvedByAdminId = session.sub;
      item.resolvedAt = Date.now();
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'support_request_resolved', 'supportRequest', item.id, {});
      return item;
    });
    res.json(request);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/payments/:id/confirm', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const result = await store.transaction((db) => {
      const payment = db.payments.find((entry) => entry.id === req.params.id);
      if (!payment) { const error = new Error('Payment not found'); error.status = 404; throw error; }
      return confirmPayment(db, payment, { adminId: session.sub, source: 'admin' });
    });
    if (!result.alreadyConfirmed) {
      if (result.recruiterEmail) await sendMail({ to: result.recruiterEmail, subject: 'Payment confirmed — JobsMatchNow', text: `Hi ${result.recruiterName || ''},\n\nYour payment of ${result.payment.currency} ${result.payment.amount} has been confirmed. Your recruiter access is active through ${new Date(result.subscription.currentPeriodEndsAt).toDateString()}.\n\n— JobsMatchNow` }).catch(() => undefined);
      if (result.qualification && result.referrerEmail) await sendMail({ to: result.referrerEmail, subject: 'You earned a free month — JobsMatchNow', text: 'A recruiter you referred just completed their first paid month. You\'ve earned one free 30-day month, applied automatically the next time your subscription needs it.\n\n— JobsMatchNow' }).catch(() => undefined);
    }
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/payments/:id/reject', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = reqString(req.body, 'reason', { max: 500 });
    const payment = await store.transaction((db) => {
      const item = db.payments.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Payment not found'); error.status = 404; throw error; }
      if (item.status === 'confirmed') { const error = new Error('Cannot reject an already-confirmed payment'); error.status = 409; throw error; }
      item.status = 'rejected';
      item.adminNote = reason;
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'payment_rejected', 'payment', item.id, { reason });
      return item;
    });
    res.json(payment);
  } catch (error) { next(error); }
});

// Never deletes the confirmed record — reverses it via a status change, and
// revokes the referral credit it granted only while that credit is unused.
app.post('/api/admin/billing/payments/:id/refund', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = optString(req.body, 'reason', { max: 500 });
    const payment = await store.transaction((db) => {
      const item = db.payments.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Payment not found'); error.status = 404; throw error; }
      if (item.status !== 'confirmed') { const error = new Error('Only a confirmed payment can be refunded'); error.status = 409; throw error; }
      item.status = 'refunded';
      item.adminNote = reason || item.adminNote || null;
      item.updatedAt = Date.now();
      revokeReferralCreditForPayment(db, item);
      logBillingEvent(db, session.sub, 'payment_refunded', 'payment', item.id, { reason });
      return item;
    });
    res.json(payment);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/credits', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const recruiterUserId = reqString(req.body, 'recruiterUserId', { max: 128 });
    const reason = reqString(req.body, 'reason', { max: 500 });
    const durationDays = Number(req.body.durationDays) || 30;
    const credit = await store.transaction((db) => {
      const recruiter = db.users.find((entry) => entry.id === recruiterUserId);
      if (!recruiter) { const error = new Error('Recruiter not found'); error.status = 404; throw error; }
      const now = Date.now();
      const created = {
        id: crypto.randomUUID(), recruiterUserId, sourceType: 'admin_credit', sourceReferenceId: session.sub,
        durationDays, status: 'available', grantedAt: now, consumedAt: null, revokedAt: null, createdAt: now, updatedAt: now,
      };
      if (!Array.isArray(db.subscriptionCredits)) db.subscriptionCredits = [];
      db.subscriptionCredits.push(created);
      logBillingEvent(db, session.sub, 'credit_granted', 'subscriptionCredit', created.id, { recruiterUserId, reason, durationDays });
      return created;
    });
    res.status(201).json(credit);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/credits/:id/revoke', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = reqString(req.body, 'reason', { max: 500 });
    const credit = await store.transaction((db) => {
      const item = db.subscriptionCredits.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Credit not found'); error.status = 404; throw error; }
      if (item.status !== 'available') { const error = new Error('Only an unused credit can be revoked'); error.status = 409; throw error; }
      item.status = 'revoked';
      item.revokedAt = Date.now();
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'credit_revoked', 'subscriptionCredit', item.id, { reason });
      return item;
    });
    res.json(credit);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/subscriptions/:id/suspend', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = optString(req.body, 'reason', { max: 500 });
    const subscription = await store.transaction((db) => {
      const item = db.subscriptions.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Subscription not found'); error.status = 404; throw error; }
      item.suspendedAt = Date.now();
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'subscription_suspended', 'subscription', item.id, { reason });
      return item;
    });
    res.json(subscription);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/subscriptions/:id/reactivate', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const subscription = await store.transaction((db) => {
      const item = db.subscriptions.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Subscription not found'); error.status = 404; throw error; }
      item.suspendedAt = null;
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'subscription_reactivated', 'subscription', item.id, {});
      return item;
    });
    res.json(subscription);
  } catch (error) { next(error); }
});

app.post('/api/admin/billing/subscriptions/:id/extend-trial', async (req, res, next) => {
  try {
    const session = requireAdminRole(authSession(req));
    const reason = reqString(req.body, 'reason', { max: 500 });
    const days = Number(req.body.days) || 7;
    const subscription = await store.transaction((db) => {
      const item = db.subscriptions.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Subscription not found'); error.status = 404; throw error; }
      item.trialEndsAt = (item.trialEndsAt || Date.now()) + days * DAY_MS;
      item.updatedAt = Date.now();
      logBillingEvent(db, session.sub, 'trial_extended', 'subscription', item.id, { days, reason });
      return item;
    });
    res.json(subscription);
  } catch (error) { next(error); }
});

// One-time bootstrap: promote an existing user to the admin role, or create
// the placeholder account if they haven't signed in yet. Gated by a
// standalone shared secret (never the regular session), meant to be run once
// per admin hire, not exposed anywhere in the UI. Admin accounts never get a
// passwordHash here — they authenticate via Google SSO only (see the
// admin-must-use-Google guard on /api/auth/login), so the first time this
// person clicks "Continue with Google" the OAuth callback's email-match
// logic links their Google identity to this same admin-role record.
app.post('/api/admin/bootstrap-admin', authLimiter, async (req, res, next) => {
  try {
    const secret = process.env.ADMIN_PROMOTE_SECRET;
    if (!secret || req.headers['x-admin-promote-secret'] !== secret) { const error = new Error('Not authorized'); error.status = 403; throw error; }
    const email = reqString(req.body, 'email', { max: 200 }).toLowerCase();
    const name = optString(req.body, 'name', { max: 120 }) || 'Admin';
    const { user, created } = await store.transaction((db) => {
      let item = db.users.find((entry) => entry.email && entry.email.toLowerCase() === email);
      if (item) {
        item.role = 'admin';
        logBillingEvent(db, item.id, 'admin_promoted', 'user', item.id, {});
        return { user: item, created: false };
      }
      item = {
        id: `u-${crypto.randomUUID().slice(0, 8)}`, role: 'admin', name, email,
        title: 'Admin', photo: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
        skills: [], languages: [], experienceLevel: 'mid', completeness: 100, onboarding: false, emailVerified: true, createdAt: Date.now(),
      };
      db.users.push(item);
      logBillingEvent(db, item.id, 'admin_created', 'user', item.id, {});
      return { user: item, created: true };
    });
    res.json({ ok: true, userId: user.id, created });
  } catch (error) { next(error); }
});

// Admin password setup. Step 1 (server access only, same secret as bootstrap-admin):
// create a one-time 30-minute link. Step 2 (the admin, in the browser): choose a password.
const ADMIN_PASSWORD_MIN = 12;
app.post('/api/admin/password-link', authLimiter, async (req, res, next) => {
  try {
    const secret = process.env.ADMIN_PROMOTE_SECRET;
    if (!secret || req.headers['x-admin-promote-secret'] !== secret) { const error = new Error('Not authorized'); error.status = 403; throw error; }
    const email = reqString(req.body, 'email', { max: 200 }).toLowerCase();
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 30 * 60 * 1000;
    await store.transaction((db) => {
      const user = db.users.find((u) => u.role === 'admin' && u.email && u.email.toLowerCase() === email);
      if (!user) { const error = new Error('No admin account with that email'); error.status = 404; throw error; }
      user.adminPasswordReset = { sha256: crypto.createHash('sha256').update(token).digest('hex'), expiresAt };
      logBillingEvent(db, user.id, 'admin_password_link_created', 'user', user.id, {});
    });
    const base = (process.env.WEB_APP_URL || 'https://jobsmatchnow.com').replace(/\/$/, '');
    res.json({ link: `${base}${APP_PATH}?admin-reset=${token}`, expiresAt });
  } catch (error) { next(error); }
});
app.post('/api/admin/password-reset', authLimiter, async (req, res, next) => {
  try {
    const token = reqString(req.body, 'token', { max: 200 });
    const password = reqString(req.body, 'password', { max: 200 });
    if (password.length < ADMIN_PASSWORD_MIN) throw new ValidationError('password', `Use at least ${ADMIN_PASSWORD_MIN} characters for an admin password`);
    const sha = crypto.createHash('sha256').update(token).digest('hex');
    const email = await store.transaction((db) => {
      const user = db.users.find((u) => u.role === 'admin' && u.adminPasswordReset?.sha256 === sha && u.adminPasswordReset.expiresAt > Date.now());
      if (!user) { const error = new Error('This setup link is invalid or has expired — ask for a new one'); error.status = 400; throw error; }
      user.passwordHash = hashPassword(password);
      delete user.adminPasswordReset;
      logBillingEvent(db, user.id, 'admin_password_set', 'user', user.id, {});
      return user.email;
    });
    res.json({ ok: true, email });
  } catch (error) { next(error); }
});

// Cron-triggered daily processing (trial/grace/expiry transitions, credit
// application, reminders, job expiry) — see server/jobs/billing-daily.js and
// the /etc/cron.daily entry that calls this once a day.
app.post('/api/internal/billing/run-daily', async (req, res, next) => {
  try {
    const secret = process.env.BILLING_CRON_SECRET;
    if (!secret || req.headers['x-cron-secret'] !== secret) { const error = new Error('Not authorized'); error.status = 403; throw error; }
    const summary = await store.transaction((db) => runDailyBilling(db));
    res.json(summary);
  } catch (error) { next(error); }
});

app.post('/api/messages', async (req, res, next) => {
  try {
    const matchId = reqString(req.body, 'matchId', { max: 128 });
    const senderId = resolveActor(req, reqString(req.body, 'senderId', { max: 128 }));
    const text = reqString(req.body, 'text', { max: 2000 });
    const message = await store.transaction((db) => {
      const match = db.matches.find((item) => item.id === matchId);
      if (!match) { const error = new Error('Match not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, senderId);
      if (authSession(req) && senderId !== match.candidateId && senderId !== match.employerId) {
        const error = new Error('Only the matched parties can message this thread'); error.status = 403; throw error;
      }
      const otherId = senderId === match.candidateId ? match.employerId : match.candidateId;
      if (blockedBetween(db, senderId).has(otherId)) { const error = new Error('You can’t message this person.'); error.status = 403; throw error; }
      const item = { id: crypto.randomUUID(), matchId, senderId, text, createdAt: Date.now() };
      const isFirst = !match.firstMessageTracked && !db.messages.some((message) => message.matchId === matchId);
      db.messages.push(item);
      if (isFirst) {
        const sender = db.users.find((user) => user.id === senderId);
        const parties = [db.users.find((user) => user.id === match.candidateId), db.users.find((user) => user.id === match.employerId), db.jobs.find((job) => job.id === match.jobId)];
        // Once per match (stamp on the match). Never the message text — only which side opened.
        match.firstMessageTracked = track(db, 'first_message', { demo: involvesDemo(sender, ...parties), dim: actorSide(sender), at: item.createdAt });
      }
      // Demo conversations answer back (founder, 2026-11-24): only when BOTH people are demo accounts.
      const senderUser = db.users.find((user) => user.id === senderId);
      const otherUser = db.users.find((user) => user.id === otherId);
      if (senderUser?.demo === true && otherUser?.demo === true) {
        const reply = { id: crypto.randomUUID(), matchId, senderId: otherId, text: demoAnswer(text, otherUser.role, String(senderUser.name || '').split(' ')[0]), createdAt: item.createdAt + 1500 };
        db.messages.push(reply);
        return { ...item, reply };
      }
      return item;
    });
    res.status(201).json(message);
  } catch (error) { next(error); }
});

// Either side of a match can propose a specific call time.
app.post('/api/calls', async (req, res, next) => {
  try {
    const matchId = reqString(req.body, 'matchId', { max: 128 });
    const createdBy = resolveActor(req, reqString(req.body, 'createdBy', { max: 128 }));
    const title = reqString(req.body, 'title', { max: 160 });
    const startAt = Number(req.body.startAt);
    if (!Number.isFinite(startAt)) throw new ValidationError('startAt', 'startAt must be a timestamp (ms)');
    const durationMinutes = Number.isFinite(Number(req.body.durationMinutes)) ? Math.min(240, Math.max(15, Number(req.body.durationMinutes))) : 30;
    const notes = typeof req.body.notes === 'string' ? req.body.notes.slice(0, 1000).trim() || undefined : undefined;
    const call = await store.transaction((db) => {
      const match = db.matches.find((item) => item.id === matchId);
      if (!match) { const error = new Error('Match not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, createdBy);
      if (createdBy !== match.employerId && createdBy !== match.candidateId) { const error = new Error('Only someone on this match can schedule a call'); error.status = 403; throw error; }
      const item = { id: crypto.randomUUID(), matchId, createdBy, title, startAt, durationMinutes, notes, createdAt: Date.now() };
      db.calls.push(item);
      return item;
    });
    res.status(201).json(call);
  } catch (error) { next(error); }
});

// Private calendar feed (Google / Apple / Outlook "subscribe from URL"), see calendar-feed.js.
// POST creates the member's secret feed URL, or a new one with { reset: true } (the old URL stops working).
app.post('/api/users/:id/calendar-feed', authLimiter, async (req, res, next) => {
  try {
    requireSelf(req, req.params.id);
    const token = await store.transaction((db) => {
      const user = db.users.find((u) => u.id === req.params.id);
      if (!user) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, user.id);
      if (!validFeedToken(user.calendarFeedToken) || req.body?.reset === true) user.calendarFeedToken = newFeedToken();
      return user.calendarFeedToken;
    });
    const base = (process.env.WEB_APP_URL || 'https://jobsmatchnow.com').replace(/\/$/, '');
    res.json({ url: `${base}/api/calendar/${token}.ics`, webcal: `${base.replace(/^https?:/, 'webcal:')}/api/calendar/${token}.ics`, reminders: REMINDER_MINUTES });
  } catch (error) { next(error); }
});
app.get('/api/calendar/:file', async (req, res, next) => {
  try {
    const token = String(req.params.file || '').replace(/\.ics$/, '');
    if (!validFeedToken(token)) return res.status(404).type('text/plain').send('Not found');
    const db = await store.read();
    const user = db.users.find((u) => u.calendarFeedToken === token && !u.suspendedAt);
    if (!user) return res.status(404).type('text/plain').send('Not found');
    const appUrl = `${(process.env.WEB_APP_URL || 'https://jobsmatchnow.com').replace(/\/$/, '')}/app/`;
    res.set('Cache-Control', 'private, max-age=900').type('text/calendar; charset=utf-8')
      .send(buildIcs(meetingsFor(db, user.id), { appUrl }));
  } catch (error) { next(error); }
});

// Save-for-later toggle on a job/candidate card. Idempotent-ish: posting again un-saves it.
app.post('/api/bookmarks/toggle', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const targetId = reqString(req.body, 'targetId', { max: 128 });
    const targetType = oneOf(req.body, 'targetType', ['job', 'candidate']);
    const bookmarked = await store.transaction((db) => {
      assertDemoActor(req, db, userId);
      const existing = db.bookmarks.find((b) => b.userId === userId && b.targetId === targetId && b.targetType === targetType);
      if (existing) { db.bookmarks = db.bookmarks.filter((b) => b !== existing); return false; }
      db.bookmarks.push({ id: crypto.randomUUID(), userId, targetId, targetType, createdAt: Date.now() });
      return true;
    });
    res.json({ bookmarked });
  } catch (error) { next(error); }
});

// Private notes: a viewer's own scratchpad on a specific job or candidate —
// before/after a conversation or interview. Visible only to their author.
app.post('/api/notes', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const targetId = reqString(req.body, 'targetId', { max: 128 });
    const targetType = oneOf(req.body, 'targetType', ['job', 'candidate']);
    const text = optString(req.body, 'text', { max: 4000 }) || '';
    const note = await store.transaction((db) => {
      assertDemoActor(req, db, userId);
      if (!Array.isArray(db.notes)) db.notes = [];
      const existing = db.notes.find((n) => n.userId === userId && n.targetId === targetId && n.targetType === targetType);
      if (existing) { existing.text = text; existing.updatedAt = Date.now(); return existing; }
      const item = { id: crypto.randomUUID(), userId, targetId, targetType, text, updatedAt: Date.now() };
      db.notes.push(item);
      return item;
    });
    res.json(note);
  } catch (error) { next(error); }
});

// Named profile-variant presets: a candidate can snapshot their current
// title/skills/desired-roles as a named preset (e.g. "Frontend Engineer"
// vs "Product Manager") and switch which one is live later, instead of
// hand-editing the same fields back and forth for every application type.
app.post('/api/profile-variants', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const name = reqString(req.body, 'name', { max: 80 });
    // Title/skills default to the live profile, but the candidate can set a
    // different persona right here instead of round-tripping through the
    // full edit wizard first — otherwise every variant looks identical.
    const title = optString(req.body, 'title', { max: 120 });
    const skills = optStringArray(req.body, 'skills', { maxItems: 20, maxLen: 60 });
    const variant = await store.transaction((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, userId);
      if (!Array.isArray(user.profileVariants)) user.profileVariants = [];
      const item = {
        id: crypto.randomUUID(), name,
        title: title || user.title || '', skills: skills || [...(user.skills || [])],
        desiredRoles: [...(user.preferences?.desiredRoles || [])],
        updatedAt: Date.now(),
      };
      user.profileVariants.push(item);
      user.activeVariantId = item.id;
      return item;
    });
    res.json(variant);
  } catch (error) { next(error); }
});

app.post('/api/profile-variants/:id/activate', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const user = await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === userId);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, userId);
      const variant = (item.profileVariants || []).find((v) => v.id === req.params.id);
      if (!variant) { const error = new Error('Profile variant not found'); error.status = 404; throw error; }
      item.title = variant.title;
      item.skills = [...variant.skills];
      item.preferences = { ...(item.preferences || {}), desiredRoles: [...(variant.desiredRoles || [])] };
      item.activeVariantId = variant.id;
      if (item.role === 'candidate') item.completeness = candidateCompleteness(item);
      return item;
    });
    res.json({ user: selfView(user) });
  } catch (error) { next(error); }
});

app.delete('/api/profile-variants/:id', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    await store.transaction((db) => {
      const item = db.users.find((entry) => entry.id === userId);
      if (!item) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, userId);
      item.profileVariants = (item.profileVariants || []).filter((v) => v.id !== req.params.id);
      if (item.activeVariantId === req.params.id) item.activeVariantId = undefined;
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Invite a former manager/recruiter to recommend you — by professional email
// (a real request goes out if a mailer is configured) or a LinkedIn profile
// URL (no message API available there, so we just record who was asked).
app.post('/api/recommendation-requests', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.body, 'userId', { max: 128 }));
    const contact = reqString(req.body, 'contact', { max: 300 });
    const isEmail = /.+@.+\..+/.test(contact);
    const isLinkedIn = /linkedin\.com/i.test(contact);
    if (!isEmail && !isLinkedIn) throw new ValidationError('contact', 'Enter a professional email address or a LinkedIn profile URL');
    const { request, name } = await store.transaction((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, userId);
      if (!Array.isArray(user.recommendationRequests)) user.recommendationRequests = [];
      const item = { id: crypto.randomUUID(), contact, method: isEmail ? 'email' : 'linkedin', sentAt: Date.now() };
      user.recommendationRequests.push(item);
      return { request: item, name: user.name };
    });
    if (request.method === 'email' && mailerConfigured()) {
      await sendMail({
        to: contact,
        subject: `${name || 'A colleague'} would like your recommendation on JobsMatchNow`,
        text: `Hi,\n\n${name || 'A colleague'} has asked you to write a short recommendation for their JobsMatchNow profile. Reply directly to this email with a few sentences about working together, and they'll be able to add it to their profile.\n\n— JobsMatchNow`,
      }).catch(() => undefined);
    }
    res.status(201).json({ request, mailer: mailerConfigured() });
  } catch (error) { next(error); }
});

// A recruiter's personal note to a candidate who didn't move forward for a
// specific role -- sent to the candidate's own email, not stored as a chat
// message, so it reads as a considered decision rather than an in-app ping.
app.post('/api/matches/:id/feedback-email', async (req, res, next) => {
  try {
    const message = reqString(req.body, 'message', { min: 3, max: 4000 });
    const session = authSession(req);
    if (!session && !demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    const { candidate, employer, job } = await store.transaction((db) => {
      const item = db.matches.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Match not found'); error.status = 404; throw error; }
      if (session && item.employerId !== session.sub) { const error = new Error('Only the hiring recruiter can send this feedback'); error.status = 403; throw error; }
      assertDemoActor(req, db, item.employerId);
      // Kept on the match too, so the candidate sees it in Reports (not only by email).
      item.feedback = [...(item.feedback || []), { text: message, at: Date.now(), from: item.employerId }].slice(-10);
      return {
        candidate: db.users.find((user) => user.id === item.candidateId),
        employer: db.users.find((user) => user.id === item.employerId),
        job: db.jobs.find((entry) => entry.id === item.jobId),
      };
    });
    if (!candidate?.email) return res.json({ ok: true, mailer: false, saved: true });
    const sent = mailerConfigured();
    if (sent) {
      await sendMail({
        to: candidate.email,
        subject: `Feedback on your application${job ? ` for ${job.title}` : ''}`,
        text: `Hi ${candidate.name || ''},\n\n${message}\n\n— ${employer?.name || 'The hiring team'}${employer?.company ? ` at ${employer.company}` : ''}`,
      }).catch(() => undefined);
    }
    res.json({ ok: true, mailer: sent });
  } catch (error) { next(error); }
});

// A recruiter passing a candidate along to a peer recruiter for a different
// role -- an outbound referral email, not a JobsMatchNow account action.
app.post('/api/matches/:id/recommend-email', async (req, res, next) => {
  try {
    const recruiterEmail = reqString(req.body, 'recruiterEmail', { max: 300 });
    if (!/.+@.+\..+/.test(recruiterEmail)) throw new ValidationError('recruiterEmail', 'Enter a valid email address');
    const message = optString(req.body, 'message', { max: 2000 }) || '';
    const session = authSession(req);
    if (!session && !demoAuth) { const error = new Error('Sign in to continue'); error.status = 401; throw error; }
    const { candidate, employer } = await store.transaction((db) => {
      const item = db.matches.find((entry) => entry.id === req.params.id);
      if (!item) { const error = new Error('Match not found'); error.status = 404; throw error; }
      if (session && item.employerId !== session.sub) { const error = new Error('Only the hiring recruiter can send this recommendation'); error.status = 403; throw error; }
      assertDemoActor(req, db, item.employerId);
      return {
        candidate: db.users.find((user) => user.id === item.candidateId),
        employer: db.users.find((user) => user.id === item.employerId),
      };
    });
    const sent = mailerConfigured();
    if (sent) {
      await sendMail({
        to: recruiterEmail,
        subject: `${employer?.name || 'A colleague'} recommends ${candidate?.name || 'a candidate'} for your open roles`,
        text: `Hi,\n\n${employer?.name || 'A colleague'}${employer?.company ? ` at ${employer.company}` : ''} thinks ${candidate?.name || 'this candidate'} could be a great fit for one of your open roles.\n\n${message ? `${message}\n\n` : ''}${candidate?.title ? `Current role: ${candidate.title}\n` : ''}\n— Sent via JobsMatchNow`,
      }).catch(() => undefined);
    }
    res.json({ ok: true, mailer: sent });
  } catch (error) { next(error); }
});

app.delete('/api/recommendation-requests/:id', async (req, res, next) => {
  try {
    const userId = resolveActor(req, reqString(req.query, 'userId', { max: 128 }));
    await store.transaction((db) => {
      const user = db.users.find((item) => item.id === userId);
      if (!user) { const error = new Error('User not found'); error.status = 404; throw error; }
      assertDemoActor(req, db, userId);
      user.recommendationRequests = (user.recommendationRequests || []).filter((r) => r.id !== req.params.id);
    });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// JobFinder (2026-11-25): external listings, public job pages, consent-based recruiter emails, claims.
const jobFinderCtx = {
  store, authSession, track, audit: logBillingEvent, sendMail, mailerConfigured, origin: publicOrigin, secret: sessionSecret,
  limiter: rateLimit({ windowMs: 60000, max: 30, bucket: 'jobfinder' }),
  // Recruiter email/phone found in imported jobs → the private per-role contact (My Jobs list email column).
  setJobContact: (db, jobId, changes) => setJobContact(db, jobId, changes),
};
mountJobFinder(app, jobFinderCtx);
// Interest emails to the recruiters of the JobFinder account's roles (2026-11-25): anonymised, replies to the relay
// address, one per candidate per role, weekly cap, signed unsubscribe shared with JobFinder's opt-out list.
const roleInterestCtx = { store, origin: publicOrigin, contactOf: jobContactRec, scoreCandidateForJob, send: (mail) => sendMail(mail), ...mountRoleInterest(app, { store, secret: () => sessionSecret }),
  // "See your candidates / claim this role" link in the email: only when ROLE_CLAIM_LINKS=on (Stage 1, 2026-11-26).
  claimLink: (jobId, email) => (claimLinksOn() ? claimUrl(publicOrigin, sessionSecret, jobId, email) : null) };
// Follow-up 24 h after a cold email with no claim (founder, 2026-11-26): checked every hour (not in tests).
if (process.env.NODE_ENV !== 'test') {
  const runFollowupsNow = () => runFollowups(roleInterestCtx).then((r) => { if (r.due) console.log(`role follow-ups: ${r.due} due, ${r.sent} sent`); }).catch(() => {});
  setInterval(runFollowupsNow, 3600000).unref?.();
  setTimeout(runFollowupsNow, 120000).unref?.();
}
// Test roles: point their recruiter email at an address (e.g. the tester's own inbox) and send the cold emails again for
// the tester's applications (founder, 2026-11-26). Import key only; touches the tester's test roles and nothing else.
app.post('/api/jobfinder/test-roles/resend', async (req, res, next) => {
  try {
    if (!process.env.JOBFINDER_IMPORT_KEY || !importKeyOk(req.headers.authorization)) { const error = new Error('Missing or invalid import key'); error.status = 401; throw error; }
    const testerEmail = String(req.body?.testerEmail || '').trim().toLowerCase();
    const recruiterEmail = String(req.body?.recruiterEmail || '').trim();
    if (!EMAIL_RE.test(recruiterEmail)) throw new ValidationError('recruiterEmail', 'Enter a valid email');
    const prep = await store.transaction((db) => {
      const tester = db.users.find((u) => String(u.email || '').toLowerCase() === testerEmail && u.tester === true);
      if (!tester) { const error = new Error('No tester account with that email'); error.status = 404; throw error; }
      const ids = db.jobs.filter((j) => Array.isArray(j.visibleTo) && j.visibleTo.includes(tester.id)).map((j) => j.id);
      for (const id of ids) setJobContact(db, id, { email: recruiterEmail });
      db.roleInterestMails = (db.roleInterestMails || []).filter((m) => !(m.candidateId === tester.id && ids.includes(m.jobId)));
      db.roleFollowups = (db.roleFollowups || []).filter((f) => !ids.includes(f.jobId));
      const liked = db.swipes.filter((s) => s.actorId === tester.id && s.targetType === 'job' && s.direction === 'like' && ids.includes(s.targetId)).map((s) => s.targetId);
      return { testerId: tester.id, roles: ids.length, liked: [...new Set(liked)] };
    });
    const results = [];
    for (const jobId of prep.liked) results.push({ jobId, status: (await afterRoleInterest(roleInterestCtx, { candidateId: prep.testerId, jobId }).catch(() => null))?.status || 'none' });
    res.json({ roles: prep.roles, resent: results });
  } catch (error) { next(error); }
});
// Sample of the recruiter cold email, for checking the template (founder, 2026-11-26): built for one of the tester's
// test roles and sent ONLY to the tester's own inbox. Import key only; records nothing.
app.post('/api/jobfinder/test-roles/sample-email', async (req, res, next) => {
  try {
    if (!process.env.JOBFINDER_IMPORT_KEY || !importKeyOk(req.headers.authorization)) { const error = new Error('Missing or invalid import key'); error.status = 401; throw error; }
    const testerEmail = String(req.body?.testerEmail || '').trim().toLowerCase();
    const prep = await store.transaction((db) => {
      const tester = db.users.find((u) => String(u.email || '').toLowerCase() === testerEmail && u.tester === true);
      if (!tester) { const error = new Error('No tester account with that email'); error.status = 404; throw error; }
      const job = db.jobs.find((j) => Array.isArray(j.visibleTo) && j.visibleTo.includes(tester.id));
      if (!job) { const error = new Error('The tester has no test roles'); error.status = 404; throw error; }
      return { tester: { email: tester.email, name: tester.name }, slug: assignProfileSlug(db, tester), job: { ...job } };
    });
    const origin = publicOrigin;
    const msg = interestEmail({ job: prep.job, candidate: prep.tester, origin, unsubscribeUrl: roleInterestCtx.unsubscribeUrl(origin, prep.tester.email),
      profileUrl: `${origin}/${prep.slug}`, roleUrl: `${origin}${rolePath(prep.job)}`, claimLink: roleInterestCtx.claimLink(prep.job.id, prep.tester.email) });
    const info = mailerConfigured() ? await sendMail({ to: prep.tester.email, replyTo: RELAY_EMAIL, fromName: FROM_NAME, subject: `[Sample] ${msg.subject}`, text: msg.text, html: msg.html, channel: 'outreach', unsubscribeUrl: roleInterestCtx.unsubscribeUrl(origin, prep.tester.email) }) : null;
    res.json({ role: prep.job.title, delivered: Boolean(info?.delivered), mailer: mailerConfigured() });
  } catch (error) { next(error); }
});
// Outreach dashboard + recruiter contact book for the JobFinder account (founder, 2026-11-26).
app.get('/api/jobfinder/outreach', async (req, res, next) => {
  try {
    const db = await store.read();
    if (!isJobFinderManager(db, authSession(req))) { const error = new Error('Only JobFinder can see outreach'); error.status = 403; throw error; }
    res.json(outreachReport(db, { contactOf: jobContactRec }));
  } catch (error) { next(error); }
});
// Stage 1 (2026-11-26): the recruiter's claim page /claim/<jobId>/<sig>, and the weekly funnel for the admin dashboard.
mountClaims(app, { store, authSession, secret: () => sessionSecret, contactOf: jobContactRec, track, scoreCandidateForJob });
app.get('/api/admin/stage1', async (req, res, next) => {
  try { requireAdminRole(authSession(req)); res.json(stage1Funnel(await store.read())); } catch (error) { next(error); }
});

// Public addresses (founder, 2026-11-25): jobsmatchnow.com/firstname.lastname (candidates) and
// jobsmatchnow.com/role/<category>/<code>-<id> (roles). Existing candidates get their address once, at startup.
await store.transaction((db) => { ensureProfileSlugs(db); }).catch((e) => console.warn(`profile slugs: ${e.message}`));
app.get('/api/public/profile/:slug', async (req, res, next) => {
  try {
    const db = await store.read();
    const user = db.users.find((u) => u.profileSlug && u.profileSlug === String(req.params.slug).toLowerCase());
    const full = publicProfileView(user, user?.photo);
    if (!full) { const error = new Error('This profile is not public'); error.status = 404; throw error; }
    // Blurred until the visitor registers (founder, 2026-11-26): only signed-in recruiters, admins and the candidate get
    // the full profile; everyone else gets a teaser (title, place, years, 3 skills) and NO name, photo, about,
    // languages or resume (never sent, so the blur can't be peeled off in the browser).
    const s = authSession(req);
    const viewer = s && db.users.find((u) => u.id === s.sub);
    const unlocked = Boolean(viewer) && (viewer.role === 'employer' || viewer.role === 'admin' || s.role === 'admin' || viewer.id === user.id);
    // The name is blurred too (founder): not sent at all until the visitor registers.
    const profile = unlocked ? full : {
      slug: full.slug, name: '', title: full.title, yearsExperience: full.yearsExperience,
      city: full.city, country: full.country, skills: full.skills.slice(0, 3), moreSkills: Math.max(0, full.skills.length - 3), languages: [],
      workModes: full.workModes, availability: full.availability, hasResume: full.hasResume, demo: full.demo, locked: true,
    };
    // Opened from a recruiter email (?v=<mail row id>): the candidate's application shows "Application viewed".
    const v = String(req.query.v || '');
    if (/^[0-9a-f-]{36}$/.test(v)) await store.transaction((d) => markViewedByRow(d, v, user.id)).catch(() => {});
    res.json({ profile, appUrl: `${publicOrigin}/app/` });
  } catch (error) { next(error); }
});
// The recruiter's email link carries ?claim=<sig> (signed with the role's private recruiter email): it opens that role's
// page even when the role is restricted (test roles), so the recruiter view + "View resume" work (2026-11-26).
function roleClaimOk(db, job, sig) {
  const email = job ? jobContactRec(db, job.id)?.email : '';
  return Boolean(email && /^[0-9a-f]{32}$/.test(String(sig || '')) && claimSig(sessionSecret, job.id, email) === sig);
}
app.get('/api/public/role/:slug', async (req, res, next) => {
  try {
    const db = await store.read();
    const job = findRoleBySlug(db, req.params.slug);
    const viewerId = authSession(req)?.sub;
    const byClaim = roleClaimOk(db, job, String(req.query.claim || ''));
    if (!job || HIDDEN_FROM_CANDIDATES.includes(String(job.status).toLowerCase()) || (isRestricted(job) && !byClaim && !job.visibleTo.includes(viewerId) && viewerId !== job.employerId)) { const error = new Error('This role is not available'); error.status = 404; throw error; }
    res.json({ jobId: job.id, path: rolePath(job) });
  } catch (error) { next(error); }
});
// Import a job from a link (2026-11-25): URL kept as the source; LinkedIn never fetched; review before save/publish.
mountJobLinkImport(app, { store, authSession, audit: logBillingEvent, assertRecruiterAccess, limiter: rateLimit({ windowMs: 60000, max: Number(process.env.JOB_LINK_RATE_MAX || 20), bucket: 'job-link' }) });

// Full job view for a signed-in member (same rules as the deck: no contacts; members' salaries after a match).
function jobFullView(db, job, viewer) {
  return hideExternalCompany(db, jobFullViewRaw(db, job, viewer), viewer?.id, viewer?.role); // external roles: company hidden
}
function jobFullViewRaw(db, job, viewer) {
  const base = jobPublicView(viewer && job.employerId === viewer.id ? job : maskJobContacts(job));
  if (isJobFinderJob(job) && job.jobFinder.listingStatus !== 'claimed') return { ...base, jobFinder: { ...memberJobFinder(job.jobFinder), reachability: reachabilityOf(db, job) } };
  const employer = db.users.find((user) => user.id === job.employerId);
  const out = {
    ...base, companyLogo: employer?.companyLogo,
    recruiter: job.recruiterName ? { name: job.recruiterName, title: job.recruiterTitle, company: job.company }
      : employer ? { name: employer.name, title: employer.title, photo: employer.photo, company: employer.company } : undefined,
    companyProfile: employer ? { about: employer.about, industry: employer.industry, companySize: employer.companySize, headquarters: employer.headquarters, website: employer.website, foundedYear: employer.foundedYear, officeLocations: employer.officeLocations, techStack: employer.techStack, benefits: employer.benefits } : undefined,
    ...(viewer.role === 'candidate' ? { match: scoreCandidateForJob(viewer, job) } : {}),
  };
  const matched = db.matches.some((m) => m.jobId === job.id && (m.candidateId === viewer.id || m.employerId === viewer.id));
  if (!matched && job.employerId !== viewer.id) { delete out.salary; delete out.salaryRange; out.salaryHidden = true; }
  return out;
}
// Job groups (2026-11-25): admin-managed public lists at /app/{slug}, card-only public views, sign-in for details.
mountGroups(app, { store, authSession, track, origin: publicOrigin, limiter: rateLimit({ windowMs: 60000, max: 60, bucket: 'groups' }), jobFullView, claimOk: roleClaimOk });

app.use('/assets', express.static(path.join(root, 'dist', 'assets'), { immutable: true, maxAge: '1y' }));
app.use(express.static(path.join(root, 'dist')));
app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(root, 'dist', 'index.html')));
app.use((error, _req, res, _next) => {
  const status = error.status || (error instanceof ValidationError ? 400 : 500);
  if (status >= 500) console.error(error);
  // Only the true fallback (no explicit status — an actually unhandled
  // exception) gets its message redacted. A deliberately-thrown 503 (e.g.
  // "VNPay/Stripe/PayPal is not configured yet") always ships with an
  // authored, safe-to-show message, so redacting anything >= 500 was
  // swallowing those into a useless generic string.
  // `code`/`details` carry the structured entitlement verdict (e.g.
  // FREE_JOB_ALREADY_USED + nextFreeJobAvailableAt) so the client can render a
  // specific, actionable message instead of parsing prose. Both are omitted
  // unless the thrower set them.
  res.status(status).json({
    error: status === 500 ? 'Unexpected server error' : error.message,
    field: error.field,
    ...(error.code ? { code: error.code } : {}),
    ...(error.details ? { details: error.details } : {}),
  });
});

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`JobMatch API listening on http://localhost:${port}`));
}
