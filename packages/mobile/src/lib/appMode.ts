import type { ShopOrderPage } from "../types/order";

export type AppMode = "buyer" | "seller";

/** AsyncStorage key holding which tab bar the app opens into. */
export const APP_MODE_STORAGE_KEY = "bns.appMode";

export function parseStoredMode(value: string | null): AppMode {
	return value === "seller" ? "seller" : "buyer";
}

/**
 * The tab bar to show. Seller mode needs a signed-in member of at least one
 * shop; `pending` while the memberships are still loading, so a seller is not
 * bounced to the buyer tabs on a cold start.
 */
export function resolveAppMode(
	stored: AppMode,
	membership: { signedIn: boolean; loading: boolean; shopCount: number },
): AppMode | "pending" {
	if (stored === "buyer") return "buyer";
	if (!membership.signedIn) return "buyer";
	if (membership.loading) return "pending";
	return membership.shopCount > 0 ? "seller" : "buyer";
}

/** The orders tab badge: everything still waiting on the shop to act. */
export function ordersToHandle(
	counts: Pick<ShopOrderPage["counts"], "to_accept" | "to_ship"> | undefined,
): number {
	if (!counts) return 0;
	return counts.to_accept + counts.to_ship;
}

export type DashboardTaskKey =
	| "toAccept"
	| "toShip"
	| "unread"
	| "lowStock"
	| "paymentsHolds";

/** The dashboard's "to handle" list, most urgent first, empty rows dropped. */
export function dashboardTasks(
	counts: Record<DashboardTaskKey, number>,
): { key: DashboardTaskKey; count: number }[] {
	const order: DashboardTaskKey[] = [
		"toAccept",
		"toShip",
		"unread",
		"paymentsHolds",
		"lowStock",
	];
	return order
		.map((key) => ({ key, count: counts[key] }))
		.filter((task) => task.count > 0);
}
