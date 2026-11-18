"use client";

import { useEffect } from "react";
import { useAppConfig } from "~/hooks/use-app-config";
import { useAuth } from "~/hooks/use-auth";
import { identifyUser, startMonitoring } from "~/lib/monitoring";

/**
 * Starts error reporting and analytics once the page is idle, so neither
 * competes with the first paint, and keeps them on the signed-in account.
 */
export function Monitoring() {
	const { monitoring } = useAppConfig();
	const { user } = useAuth();
	const userId = user?.id ?? null;

	useEffect(() => {
		const start = () => void startMonitoring(monitoring);
		// Safari has no requestIdleCallback.
		if (typeof window.requestIdleCallback === "function") {
			const handle = window.requestIdleCallback(start, { timeout: 4000 });
			return () => window.cancelIdleCallback(handle);
		}
		const handle = window.setTimeout(start, 2000);
		return () => window.clearTimeout(handle);
	}, [monitoring]);

	useEffect(() => identifyUser(userId), [userId]);

	return null;
}
