"use client";

import { createContext, useContext } from "react";

export interface AppConfig {
	stripePublishableKey: string | null;
	chatUrl: string | null;
	novuAppId: string | null;
}

const AppConfigContext = createContext<AppConfig>({
	stripePublishableKey: null,
	chatUrl: null,
	novuAppId: null,
});

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
