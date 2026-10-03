"use client";

import { createContext, useContext } from "react";
import type { LaunchCityOption } from "~/types/order";

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
	boostPricing: BoostPrice[];
	/** Gates shop creation only. Fails closed: "unavailable" reads as "off". */
	shopsEnabled: boolean;
	/** Gates the cart, checkout and order screens. Fails closed the same way. */
	ordersEnabled: boolean;
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
}

export const EMPTY_APP_CONFIG: AppConfig = {
	stripePublishableKey: null,
	chatUrl: null,
	novuAppId: null,
	boostPricing: [],
	shopsEnabled: false,
	// The three values `GET /api/public/config` itself falls back to on a
	// settings outage: a client that cannot read the flag hides ordering
	// rather than advertising it.
	ordersEnabled: false,
	launchCities: [],
	withdrawalDays: 15,
	protectedPaymentEnabled: false,
	buyerProtection: { bps: 300, min: 100, max: 15_000 },
};

const AppConfigContext = createContext<AppConfig>(EMPTY_APP_CONFIG);

interface Props {
	initialConfig: AppConfig;
	children: React.ReactNode;
}

/**
 * Provides runtime config fetched server-side by the root layout.
 * Avoids any client-side waterfall — config is available on first render.
 */
export function AppConfigProvider({ initialConfig, children }: Props) {
	return (
		<AppConfigContext.Provider value={initialConfig}>
			{children}
		</AppConfigContext.Provider>
	);
}

export const useAppConfig = () => useContext(AppConfigContext);
