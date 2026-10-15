import { useQuery } from "@tanstack/react-query";
import { createContext, Fragment, useContext } from "react";
import { api } from "@/src/lib/api";
import { setMarket } from "@/src/lib/market";
import type { LaunchCityOption } from "@/src/types/order";
import type { MarketConfig } from "../../../api/src/contracts/marketConfig";

/** `AppSettings.payments.buyerProtection`, mirrored from web's own `useAppConfig`. */
export interface BuyerProtectionConfig {
	bps: number;
	min: number;
	max: number;
}

export interface AppConfig {
	chatUrl: string | null;
	novuAppId: string | null;
	webUrl: string | null;
	/** Photon geocoder behind every place picker; `null` until config loads. */
	photonUrl: string | null;
	enabledAuthProviders: string[];
	localAuthEnabled: boolean;
	shopsEnabled: boolean;
	ordersEnabled: boolean;
	disputesEnabled: boolean;
	/** The cities ordering is open in, with each one's default delivery fee. */
	launchCities: LaunchCityOption[];
	withdrawalDays: number;
	/**
	 * Server-decided (`isProtectedPaymentOpen`), fails closed like
	 * `ordersEnabled`: a client that cannot read the flag shows "coming soon",
	 * never a guess that it is on.
	 */
	protectedPaymentEnabled: boolean;
	deliveryZonesEnabled: boolean;
	couriersEnabled: boolean;
	intercityEnabled: boolean;
	insightsEnabled: boolean;
	resaleEnabled: boolean;
	resalePrepaidEnabled: boolean;
	/** Rate, minimum and maximum for the buyer protection fee. */
	buyerProtection: BuyerProtectionConfig;
	/** Absent from an API that predates markets; money and phone then use the M9 fallbacks. */
	market?: MarketConfig;
}

const DEFAULT: AppConfig = {
	chatUrl: null,
	novuAppId: null,
	webUrl: null,
	photonUrl: null,
	enabledAuthProviders: ["google", "apple", "facebook"],
	localAuthEnabled: true,
	shopsEnabled: false,
	// The same three values the config route falls back to on a settings
	// outage: a client that cannot read the flag must hide ordering, not
	// advertise it.
	ordersEnabled: false,
	disputesEnabled: false,
	launchCities: [],
	withdrawalDays: 15,
	protectedPaymentEnabled: false,
	deliveryZonesEnabled: false,
	couriersEnabled: false,
	intercityEnabled: false,
	insightsEnabled: false,
	resaleEnabled: false,
	resalePrepaidEnabled: false,
	buyerProtection: { bps: 300, min: 100, max: 15_000 },
};

const AppConfigContext = createContext<AppConfig>(DEFAULT);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
	const { data: config = DEFAULT } = useQuery<AppConfig>({
		queryKey: ["app-config"],
		// A released API that predates a config key keeps that feature off by
		// merging over the default rather than leaving the key undefined.
		queryFn: async () => {
			const raw = await api.get<Partial<AppConfig>>("/api/public/config");
			setMarket(raw.market);
			return { ...DEFAULT, ...raw };
		},
		staleTime: Number.POSITIVE_INFINITY,
		retry: 3,
	});

	// formatPrice call sites read a module store and never re-render on their
	// own; remounting once when the market arrives replaces the M9 fallback.
	return (
		<AppConfigContext.Provider value={config}>
			<Fragment key={config.market?.countryCode ?? "none"}>{children}</Fragment>
		</AppConfigContext.Provider>
	);
}

export function useAppConfig(): AppConfig {
	return useContext(AppConfigContext);
}
