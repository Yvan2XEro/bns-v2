import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api } from "@/src/lib/api";
import type { LaunchCityOption } from "@/src/types/order";

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
}

const DEFAULT: AppConfig = {
	chatUrl: null,
	novuAppId: null,
	webUrl: null,
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
		queryFn: async () => ({
			...DEFAULT,
			...(await api.get<Partial<AppConfig>>("/api/public/config")),
		}),
		staleTime: Number.POSITIVE_INFINITY,
		retry: 3,
	});

	return (
		<AppConfigContext.Provider value={config}>
			{children}
		</AppConfigContext.Provider>
	);
}

export function useAppConfig(): AppConfig {
	return useContext(AppConfigContext);
}
