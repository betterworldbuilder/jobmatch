import { Capacitor, registerPlugin } from '@capacitor/core';

/** Thin wrappers around the two native plugins (android/app/.../
 * PlayBillingPlugin.java, ios/App/App/AppleIAPPlugin.swift). Only usable
 * inside the compiled native app on the matching platform — on web these
 * plugins don't exist, so every call here is gated behind isAndroidNative()/
 * isIosNative() first. Purchasing here only starts the flow; the actual
 * entitlement only ever comes from the server verifying the resulting
 * token/transaction (see api.verifyGooglePlayPurchase / api.verifyApplePurchase). */

interface PlayBillingPlugin {
  initialize(): Promise<void>;
  queryProductDetails(options: { productId: string }): Promise<{ productId: string; title: string; offerToken?: string; formattedPrice?: string; offers?: { basePlanId: string; offerId?: string | null; offerToken: string; formattedPrice?: string }[] }>;
  purchase(options: { productId: string; offerToken: string }): Promise<{ purchases: { purchaseToken: string; products: string[] }[] }>;
}

interface AppleIAPPlugin {
  queryProduct(options: { productId: string }): Promise<{ productId: string; displayName: string; displayPrice: string }>;
  purchase(options: { productId: string }): Promise<{ transactionId?: string; originalTransactionId?: string; pending?: boolean }>;
}

const PlayBilling = registerPlugin<PlayBillingPlugin>('PlayBilling');
const AppleIAP = registerPlugin<AppleIAPPlugin>('AppleIAP');

export function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
export function isIosNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

/** Runs the full Google Play purchase flow and returns the purchase token
 * to send to api.verifyGooglePlayPurchase() — the token itself proves
 * nothing until our server verifies it against the Android Publisher API. */
/** Play base plan id for a catalogue plan key (Team's key is "trio"; base plan ids use "-" not "_"). */
export const basePlanIdFor = (planKey?: string) => (planKey === 'trio' ? 'team' : String(planKey || 'solo').replace(/_/g, '-'));

export async function purchaseGooglePlaySubscription(productId: string, planKey?: string): Promise<string> {
  await PlayBilling.initialize();
  const details = await PlayBilling.queryProductDetails({ productId });
  // Buy the base plan of the plan the recruiter picked (solo / duo / team); the plain base-plan offer, not a promo one.
  const wanted = basePlanIdFor(planKey);
  const offer = details.offers?.find((o) => o.basePlanId === wanted && !o.offerId) || details.offers?.find((o) => o.basePlanId === wanted);
  const offerToken = offer?.offerToken || (planKey ? undefined : details.offerToken);
  if (!offerToken) throw new Error(`This plan (${wanted}) is not available on Google Play yet`);
  const result = await PlayBilling.purchase({ productId, offerToken });
  const purchase = result.purchases.find((entry) => entry.products.includes(productId));
  if (!purchase) throw new Error('Purchase did not complete');
  return purchase.purchaseToken;
}

/** Runs the StoreKit 2 purchase flow and returns the transaction id to send
 * to api.verifyApplePurchase(). */
export async function purchaseAppleSubscription(productId: string): Promise<string> {
  const result = await AppleIAP.purchase({ productId });
  if (result.pending) throw new Error('Purchase is pending approval (e.g. Ask to Buy) — check back once approved');
  if (!result.transactionId) throw new Error('Purchase did not complete');
  return result.transactionId;
}
