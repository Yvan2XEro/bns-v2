import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api } from "@/src/lib/api";

export interface AppConfig {
	chatUrl: string | null;
	novuAppId: string | null;
	webUrl: string | null;
	enabledAuthProviders: string[];
	localAuthEnabled: boolean;
	shopsEnabled: boolean;
}

const DEFAULT: AppConfig = {
	chatUrl: null,
	novuAppId: null,
	webUrl: null,
	enabledAuthProviders: ["google", "apple", "facebook"],
	localAuthEnabled: true,
	shopsEnabled: false,
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
