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
import { LAUNCH_CITIES } from "@/lib/launchCities";
import { getOrderSettings } from "@/lib/orderSettings";
import { getShopSettings } from "@/lib/shopSettings";
import { getVerificationSettings } from "@/lib/verificationSettings";

export async function GET() {
	let enabledAuthProviders: string[] = [];
	let localAuthEnabled = true;
	let shopsEnabled = false;
	let verificationEnabled = false;
	let ordersEnabled = false;
	let launchCities: Array<{ key: string; label: string; fee: number }> = [];
	let withdrawalDays = 15;

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
	} catch {
		enabledAuthProviders = listConfiguredOAuthProviders();
		// A settings outage must hide ordering, not advertise it.
		ordersEnabled = false;
		launchCities = [];
		withdrawalDays = 15;
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
	});
}
