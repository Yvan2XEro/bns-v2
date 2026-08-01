import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api } from "@/src/lib/api";

export interface AppConfig {
	chatUrl: string | null;
	novuAppId: string | null;
	webUrl: string | null;
	enabledAuthProviders: string[];
	localAuthEnabled: boolean;
}

const DEFAULT: AppConfig = {
	chatUrl: null,
	novuAppId: null,
	webUrl: null,
	enabledAuthProviders: ["google", "apple", "facebook"],
	localAuthEnabled: true,
};

const AppConfigContext = createContext<AppConfig>(DEFAULT);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
	const { data: config = DEFAULT } = useQuery<AppConfig>({
		queryKey: ["app-config"],
		queryFn: () => api.get<AppConfig>("/api/public/config"),
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
