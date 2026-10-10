"use client";

import { createContext, useContext } from "react";
import { type AppConfig, EMPTY_APP_CONFIG } from "~/lib/app-config";

export type { AppConfig, BoostPrice } from "~/lib/app-config";

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
