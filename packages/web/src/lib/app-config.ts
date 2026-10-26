import type { LaunchCityOption } from "~/types/order";
import type { MarketConfig } from "../../../api/src/contracts/marketConfig";
import {
	type MonitoringConfig,
	NO_MONITORING,
} from "../../../api/src/contracts/monitoring";
import { PHOTO_LIMIT } from "../../../api/src/contracts/photoLimit";

export interface BoostPrice {
	days: number;
	amount: number;
	currency: string;
}

/** `AppSettings.payments.buyerProtection`, mirrored from `PAYMENT_DEFAULTS`. */
export interface BuyerProtectionConfig {
	bps: number;
	min: number;
	max: number;
}

export interface AppConfig {
	stripePublishableKey: string | null;
	chatUrl: string | null;
	novuAppId: string | null;
	/** A self-hosted Novu's API and WebSocket; null keeps Novu Cloud. */
	novuApiUrl: string | null;
	novuSocketUrl: string | null;
	/** Photon geocoder behind every place picker, served by the API. */
	photonUrl: string | null;
	boostPricing: BoostPrice[];
	/** Gates shop creation only. Fails closed: "unavailable" reads as "off". */
	shopsEnabled: boolean;
	/** Gates the cart, checkout and order screens. Fails closed the same way. */
	ordersEnabled: boolean;
	disputesEnabled: boolean;
	/** The cities ordering is open in, with each one's default delivery fee. */
	launchCities: LaunchCityOption[];
	withdrawalDays: number;
	/**
	 * Whether protected payment is open for the caller's market, server-decided
	 * (`isProtectedPaymentOpen`). Fails closed the same way `ordersEnabled`
	 * does: a client that cannot read the flag shows "coming soon", never a
	 * guess that it is on.
	 */
	protectedPaymentEnabled: boolean;
	/** Rate, minimum and maximum for the buyer protection fee. Changing them affects new orders only. */
	buyerProtection: BuyerProtectionConfig;
	checkoutExpiryMinutes: number;
	deliveryZonesEnabled: boolean;
	couriersEnabled: boolean;
	intercityEnabled: boolean;
	insightsEnabled: boolean;
	resaleEnabled: boolean;
	resalePrepaidEnabled: boolean;
	/** Photos a listing or a product may carry; read it through `usePhotoLimit`. */
	photosIncluded: number;
	/** Sentry and PostHog, configured on the API; off until it sends them. */
	monitoring: MonitoringConfig;
	/** Absent before the markets migration, or when the request named no live country. */
	market?: MarketConfig;
}

export const EMPTY_APP_CONFIG: AppConfig = {
	stripePublishableKey: null,
	chatUrl: null,
	novuAppId: null,
	novuApiUrl: null,
	novuSocketUrl: null,
	photonUrl: null,
	boostPricing: [],
	shopsEnabled: false,
	// The three values `GET /api/public/config` itself falls back to on a
	// settings outage: a client that cannot read the flag hides ordering
	// rather than advertising it.
	ordersEnabled: false,
	disputesEnabled: false,
	launchCities: [],
	withdrawalDays: 15,
	protectedPaymentEnabled: false,
	buyerProtection: { bps: 300, min: 100, max: 15_000 },
	checkoutExpiryMinutes: 30,
	deliveryZonesEnabled: false,
	couriersEnabled: false,
	intercityEnabled: false,
	insightsEnabled: false,
	resaleEnabled: false,
	resalePrepaidEnabled: false,
	photosIncluded: PHOTO_LIMIT.default,
	monitoring: NO_MONITORING,
};
