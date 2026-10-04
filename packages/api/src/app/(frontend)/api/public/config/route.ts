/**
 * Public runtime configuration served to web and mobile clients.
 * Only genuinely publishable values go here — no secrets.
 * Clients fetch this once at startup to avoid baking keys into builds.
 */
import config from "@payload-config";
import { getPayload } from "payload";
import { resolveEnabledOAuthProviders } from "@/auth/oauth/enabledProviders";
import { listConfiguredOAuthProviders } from "@/auth/oauth/providers";
import { BOOST_PRICING } from "@/lib/boostPricing";
import { getDisputeSettings, isDisputesOpen } from "@/lib/caseSettings";
import { LAUNCH_CITIES } from "@/lib/launchCities";
import { getOrderSettings } from "@/lib/orderSettings";
import {
	getPaymentSettings,
	isProtectedPaymentOpen,
	PAYMENT_DEFAULTS,
} from "@/lib/paymentSettings";
import { getShopSettings } from "@/lib/shopSettings";
import { getVerificationSettings } from "@/lib/verificationSettings";

/**
 * The caller's market is `?country=` when given, else the first market row —
 * the launch market — so a client that does not send one yet still learns
 * the flag for the market it ships in.
 */
export async function GET(request?: Request) {
	let enabledAuthProviders: string[] = [];
	let localAuthEnabled = true;
	let shopsEnabled = false;
	let verificationEnabled = false;
	let ordersEnabled = false;
	let launchCities: Array<{ key: string; label: string; fee: number }> = [];
	let withdrawalDays = 15;
	let protectedPaymentEnabled = false;
	let buyerProtection = PAYMENT_DEFAULTS.buyerProtection;
	let checkoutExpiryMinutes = PAYMENT_DEFAULTS.checkoutExpiryMinutes;
	let disputesEnabled = false;

	try {
		const payload = await getPayload({ config });
		const settings = await payload.findGlobal({ slug: "app-settings" });
		const authSettings = (
			settings as unknown as {
				auth?: { enabledProviders?: string[]; enableLocalAuth?: boolean };
			}
		)?.auth;

		const configured = listConfiguredOAuthProviders();
		const enabledInAdmin = authSettings?.enabledProviders ?? [
			"google",
			"apple",
			"facebook",
		];
		enabledAuthProviders = resolveEnabledOAuthProviders(
			configured,
			enabledInAdmin,
		);
		localAuthEnabled = authSettings?.enableLocalAuth ?? true;
		shopsEnabled = (await getShopSettings(payload)).enabled;
		verificationEnabled = (await getVerificationSettings(payload)).enabled;
		const orderSettings = await getOrderSettings(payload);
		ordersEnabled = orderSettings.enabled;
		launchCities = orderSettings.launchCities.map(({ key, deliveryFee }) => ({
			key,
			label: LAUNCH_CITIES[key].label,
			fee: deliveryFee,
		}));
		withdrawalDays = orderSettings.withdrawalDays;
		const paymentSettings = await getPaymentSettings(payload);
		const country =
			(request && new URL(request.url).searchParams.get("country")) ||
			paymentSettings.markets[0]?.countryCode;
		protectedPaymentEnabled =
			country !== undefined && isProtectedPaymentOpen(paymentSettings, country);
		buyerProtection = paymentSettings.buyerProtection;
		checkoutExpiryMinutes = paymentSettings.checkoutExpiryMinutes;
		disputesEnabled = isDisputesOpen(await getDisputeSettings(payload));
	} catch {
		enabledAuthProviders = listConfiguredOAuthProviders();
		// A settings outage must hide ordering, not advertise it.
		ordersEnabled = false;
		launchCities = [];
		withdrawalDays = 15;
		protectedPaymentEnabled = false;
		disputesEnabled = false;
	}

	return Response.json({
		stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
		chatUrl: process.env.CHAT_PUBLIC_URL ?? null,
		novuAppId: process.env.NOVU_APPLICATION_IDENTIFIER ?? null,
		webUrl: process.env.PUBLIC_WEB_URL ?? null,
		enabledAuthProviders,
		localAuthEnabled,
		shopsEnabled,
		verificationEnabled,
		ordersEnabled,
		launchCities,
		withdrawalDays,
		boostPricing: BOOST_PRICING,
		protectedPaymentEnabled,
		buyerProtection,
		checkoutExpiryMinutes,
		disputesEnabled,
	});
}
