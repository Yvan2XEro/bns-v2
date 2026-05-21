import { StripeProvider } from "@stripe/stripe-react-native";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { api } from "@/src/lib/api";

export interface AppConfig {
	stripePublishableKey: string | null;
	chatUrl: string | null;
	novuAppId: string | null;
	webUrl: string | null;
	enabledAuthProviders: string[];
	localAuthEnabled: boolean;
}

const DEFAULT: AppConfig = {
	stripePublishableKey: null,
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
			{/* StripeProvider lives here so children always have Stripe context.
			    With an empty key, Stripe silently degrades — no crash. */}
			<StripeProvider publishableKey={config.stripePublishableKey ?? ""}>
				{children}
			</StripeProvider>
		</AppConfigContext.Provider>
	);
}

export function useAppConfig(): AppConfig {
	return useContext(AppConfigContext);
}
