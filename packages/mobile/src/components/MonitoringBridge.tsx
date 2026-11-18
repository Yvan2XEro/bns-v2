import { usePathname } from "expo-router";
import { useEffect } from "react";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useAuth } from "@/src/lib/auth";
import {
	identifyUser,
	startMonitoring,
	trackScreen,
} from "@/src/lib/monitoring";

/** Starts error reporting and analytics once the API's config is in, and follows the account and the screen. */
export function MonitoringBridge() {
	const { monitoring } = useAppConfig();
	const { user } = useAuth();
	const pathname = usePathname();
	const userId = user?.id ?? null;

	useEffect(() => {
		if (monitoring.mobileDsn || monitoring.analyticsKey) {
			startMonitoring(monitoring);
		}
	}, [monitoring]);

	useEffect(() => identifyUser(userId), [userId]);

	useEffect(() => trackScreen(pathname), [pathname]);

	return null;
}
