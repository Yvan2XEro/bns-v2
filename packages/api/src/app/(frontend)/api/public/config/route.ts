/**
 * Public runtime configuration served to web and mobile clients.
 * Only genuinely publishable values go here — no secrets.
 * Clients fetch this once at startup to avoid baking keys into builds.
 */
import config from "@payload-config";
import { getPayload, type Payload } from "payload";
import { resolveEnabledOAuthProviders } from "@/auth/oauth/enabledProviders";
import { listConfiguredOAuthProviders } from "@/auth/oauth/providers";
import type { MarketConfig } from "@/contracts/marketConfig";
import { novuEndpoints } from "@/contracts/novuEndpoints";
import { normalizePhotoLimit, PHOTO_LIMIT } from "@/contracts/photoLimit";
import { BOOST_PRICING } from "@/lib/boostPricing";
import { getDisputeSettings, isDisputesOpen } from "@/lib/caseSettings";
import { getDeliverySettings } from "@/lib/deliverySettings";
import { LAUNCH_CITIES } from "@/lib/launchCities";
import { getMarketCities } from "@/lib/marketCities";
import { getMarkets, marketIsOpen } from "@/lib/markets";
import { monitoringConfig } from "@/lib/monitoring";
import { getOrderSettings } from "@/lib/orderSettings";
import {
	getPaymentSettings,
	isProtectedPaymentOpen,
	PAYMENT_DEFAULTS,
} from "@/lib/paymentSettings";
import { getResaleSettings } from "@/lib/resaleSettings";
import { getShopSettings } from "@/lib/shopSettings";
import { getVerificationSettings } from "@/lib/verificationSettings";

const DEFAULT_PHOTON_URL = "https://photon.overbrand.net";

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
	let legacyMarketCountries: string[] = [];
	let buyerProtection = PAYMENT_DEFAULTS.buyerProtection;
	let checkoutExpiryMinutes = PAYMENT_DEFAULTS.checkoutExpiryMinutes;
	let disputesEnabled = false;
	let insightsEnabled = false;
	let deliveryZonesEnabled = false;
	let couriersEnabled = false;
	let intercityEnabled = false;
	let resaleEnabled = false;
	let resalePrepaidEnabled = false;
	// Generated share images (link previews, Status/story cards): off until
	// an admin turns them on (app-settings › Sharing).
	let shareCardsEnabled = false;
	let photosIncluded: number = PHOTO_LIMIT.default;
	let payloadRef: Payload | undefined;

	try {
		const payload = await getPayload({ config });
		payloadRef = payload;
		const settings = await payload.findGlobal({ slug: "app-settings" });
		insightsEnabled = settings.insights?.enabled ?? false;
		shareCardsEnabled = settings.sharing?.cardsEnabled === true;
		photosIncluded = normalizePhotoLimit(settings.media?.photosIncluded);
		const deliverySettings = await getDeliverySettings(payload);
		const resaleSettings = await getResaleSettings(payload);
		resaleEnabled = resaleSettings.enabled;
		resalePrepaidEnabled = resaleSettings.prepaidEnabled;
		deliveryZonesEnabled = deliverySettings.zonesEnabled;
		couriersEnabled =
			deliverySettings.zonesEnabled && deliverySettings.couriersEnabled;
		intercityEnabled =
			deliverySettings.zonesEnabled && deliverySettings.intercityEnabled;
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
		legacyMarketCountries = paymentSettings.markets.map((m) => m.countryCode);
		const country =
			(request &&
				new URL(request.url).searchParams
					.get("country")
					?.trim()
					.toUpperCase()) ||
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
		insightsEnabled = false;
		deliveryZonesEnabled = false;
		couriersEnabled = false;
		intercityEnabled = false;
		resaleEnabled = false;
		resalePrepaidEnabled = false;
	}

	// Presentation only: the query never reaches a charge, and a country that
	// is not a live market is never replaced by another one.
	const requested = request
		? new URL(request.url).searchParams.get("country")?.trim().toUpperCase()
		: undefined;
	let market: MarketConfig | undefined;
	if (payloadRef) {
		try {
			const registry = await getMarkets(payloadRef);
			const found = requested
				? registry.find((m) => m.countryCode === requested)
				: registry[0];
			if (found?.status === "live") {
				const rows = await getMarketCities(payloadRef, found);
				// Released clients read the flat list; it is the market's rows now.
				launchCities = rows.map((city) => ({
					key: city.key,
					label: city.label,
					fee: city.defaultDeliveryFee,
				}));
				if (requested) {
					const open = (
						feature: Parameters<typeof marketIsOpen>[1],
						on: boolean,
					) => marketIsOpen(found, feature, on);
					market = {
						countryCode: found.countryCode,
						name: found.name,
						currency: {
							code: found.currency.code,
							minorUnit: found.currency.minorUnit,
						},
						formats: found.formats,
						phone: found.phone,
						cities: rows.map((city) => ({
							key: city.key,
							label: city.label,
							districts: city.districts.map(({ slug, label }) => ({
								key: slug,
								label,
							})),
							fee: city.defaultDeliveryFee,
						})),
						features: {
							cod: open("cod", ordersEnabled),
							protectedPayment: open(
								"protectedPayment",
								protectedPaymentEnabled,
							),
							deliveryZones: open("deliveryZones", deliveryZonesEnabled),
							couriers: open("couriers", couriersEnabled),
							disputes: open("disputes", disputesEnabled),
							resale: open("resale", resaleEnabled),
							resalePrepaid: open("resalePrepaid", resalePrepaidEnabled),
							boosts: open("boosts", true),
						},
						languages: found.languages,
					};
				}
			} else if (
				requested &&
				!(registry.length === 0 && legacyMarketCountries.includes(requested))
				// Pre-migration the registry is empty and the legacy settings are
				// the authority: a country they know keeps its answers; the
				// zeroing below is for a country nobody knows (the spoof rule).
			) {
				ordersEnabled = false;
				launchCities = [];
				protectedPaymentEnabled = false;
				disputesEnabled = false;
				deliveryZonesEnabled = false;
				couriersEnabled = false;
				intercityEnabled = false;
				resaleEnabled = false;
				resalePrepaidEnabled = false;
			}
		} catch {
			// An unreadable registry leaves the legacy answer; the block stays absent.
		}
	}

	const novu = novuEndpoints(process.env);
	return Response.json({
		stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
		chatUrl: process.env.CHAT_PUBLIC_URL ?? null,
		novuAppId: novu?.applicationIdentifier ?? null,
		// A self-hosted Novu's API and WebSocket; null keeps Novu Cloud.
		novuApiUrl: novu?.apiUrl ?? null,
		novuSocketUrl: novu?.socketUrl ?? null,
		webUrl: process.env.PUBLIC_WEB_URL ?? null,
		// Geocoder for the place pickers. Defaulted, not optional: without it
		// neither client can search a city.
		photonUrl: process.env.PHOTON_URL || DEFAULT_PHOTON_URL,
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
		insightsEnabled,
		deliveryZonesEnabled,
		couriersEnabled,
		intercityEnabled,
		resaleEnabled,
		resalePrepaidEnabled,
		shareCardsEnabled,
		// Instagram and Facebook stories take a story only from an app that
		// names its Facebook app: a public id, not a secret. Unset, the apps
		// leave those two destinations out.
		facebookAppId: process.env.FACEBOOK_APP_ID?.trim() || null,
		// Photos a listing or a product may carry; the API refuses more.
		photosIncluded,
		// Sentry and PostHog: public send-only keys, set on the API alone.
		monitoring: monitoringConfig(),
		...(market ? { market } : {}),
	});
}
