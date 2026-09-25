"use client";

import { createContext, useContext } from "react";

export interface BoostPrice {
	days: number;
	amount: number;
	currency: string;
}

export interface AppConfig {
	stripePublishableKey: string | null;
	chatUrl: string | null;
	novuAppId: string | null;
	boostPricing: BoostPrice[];
}

export const EMPTY_APP_CONFIG: AppConfig = {
	stripePublishableKey: null,
	chatUrl: null,
	novuAppId: null,
	boostPricing: [],
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
