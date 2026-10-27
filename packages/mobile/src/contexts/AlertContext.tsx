import i18next from "i18next";
import { createContext, type ReactNode, useContext } from "react";
import { AlertSheet } from "@/src/components/AlertSheet";
import { type Alerts, createAlerts } from "@/src/lib/alerts";

/**
 * The app's alerts, usable outside a component too (a hook's callback, a
 * service): they all go through the one `AlertSheet` the provider mounts.
 */
export const alerts: Alerts = createAlerts(
	(request) => AlertSheet.call(request),
	() => AlertSheet.end(null),
	(key) => i18next.t(key),
);

const AlertContext = createContext<Alerts | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
	return (
		<AlertContext.Provider value={alerts}>
			{children}
			<AlertSheet />
		</AlertContext.Provider>
	);
}

export function useAlert() {
	const ctx = useContext(AlertContext);
	if (!ctx) throw new Error("useAlert must be used within AlertProvider");
	return ctx;
}
