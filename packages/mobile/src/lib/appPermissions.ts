/**
 * The device permissions the app uses, and what the settings screen shows
 * and offers for each. Pure, so the rules are tested without a device;
 * `useAppPermissions` reads and requests them.
 */

/** Every permission the app asks for, in the order the settings list them. */
export const APP_PERMISSIONS = [
	"notifications",
	"location",
	"camera",
	"photos",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

/** What an Expo permission module answers, reduced to what decides here. */
export interface PermissionSnapshot {
	status: "granted" | "denied" | "undetermined";
	canAskAgain: boolean;
	/** iOS photos: the whole library or a chosen selection. */
	accessPrivileges?: "all" | "limited" | "none";
}

export type PermissionState =
	/** Allowed. */
	| "granted"
	/** Allowed for some photos only (iOS). */
	| "limited"
	/** Never asked: the app may ask. */
	| "undetermined"
	/** Refused, but the app may still ask again (Android). */
	| "denied"
	/** Refused for good: only the system settings can change it. */
	| "blocked"
	/** Not available here (the web build, a failing module). */
	| "unavailable";

export function permissionState(
	snapshot: PermissionSnapshot | null,
): PermissionState {
	if (!snapshot) return "unavailable";
	if (snapshot.status === "granted") {
		return snapshot.accessPrivileges === "limited" ? "limited" : "granted";
	}
	if (snapshot.status === "undetermined") return "undetermined";
	return snapshot.canAskAgain ? "denied" : "blocked";
}

/**
 * What the row's button does: ask the system's question while the app still
 * may, otherwise open the app's page in the system settings — the only place
 * a permission can be withdrawn, or restored once refused for good.
 */
export type PermissionAction = "request" | "openSettings" | null;

export function permissionAction(state: PermissionState): PermissionAction {
	switch (state) {
		case "undetermined":
		case "denied":
			return "request";
		case "granted":
		case "limited":
		case "blocked":
			return "openSettings";
		case "unavailable":
			return null;
	}
}
