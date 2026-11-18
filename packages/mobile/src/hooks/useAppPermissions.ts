import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import {
	APP_PERMISSIONS,
	type AppPermission,
	type PermissionSnapshot,
	type PermissionState,
	permissionAction,
	permissionState,
} from "@/src/lib/appPermissions";
import { useAuth } from "@/src/lib/auth";
import { syncPushToken } from "@/src/lib/notifications";

/** How each permission is read and asked, through the module that uses it. */
const MODULES: Record<
	AppPermission,
	{
		get: () => Promise<PermissionSnapshot>;
		request: () => Promise<PermissionSnapshot>;
	}
> = {
	notifications: {
		get: () => Notifications.getPermissionsAsync(),
		request: () => Notifications.requestPermissionsAsync(),
	},
	location: {
		get: () => Location.getForegroundPermissionsAsync(),
		request: () => Location.requestForegroundPermissionsAsync(),
	},
	camera: {
		get: () => ImagePicker.getCameraPermissionsAsync(),
		request: () => ImagePicker.requestCameraPermissionsAsync(),
	},
	photos: {
		get: () => ImagePicker.getMediaLibraryPermissionsAsync(),
		request: () => ImagePicker.requestMediaLibraryPermissionsAsync(),
	},
};

async function read(permission: AppPermission): Promise<PermissionState> {
	try {
		return permissionState(await MODULES[permission].get());
	} catch {
		return permissionState(null);
	}
}

async function readAll(): Promise<Record<AppPermission, PermissionState>> {
	const states = await Promise.all(APP_PERMISSIONS.map(read));
	return Object.fromEntries(
		APP_PERMISSIONS.map((permission, index) => [permission, states[index]]),
	) as Record<AppPermission, PermissionState>;
}

/**
 * The app's device permissions as they stand now — re-read whenever the app
 * comes back to the foreground, since they change in the system settings —
 * and the one action each offers.
 */
export function useAppPermissions() {
	const { user } = useAuth();
	const [states, setStates] = useState<Record<
		AppPermission,
		PermissionState
	> | null>(null);

	const refresh = useCallback(() => {
		void readAll().then(setStates);
	}, []);

	useEffect(() => {
		refresh();
		const subscription = AppState.addEventListener("change", (next) => {
			if (next === "active") refresh();
		});
		return () => subscription.remove();
	}, [refresh]);

	const act = useCallback(
		async (permission: AppPermission) => {
			const state = states?.[permission] ?? "unavailable";
			const action = permissionAction(state);
			if (action === "openSettings") {
				await Linking.openSettings();
				return;
			}
			if (action !== "request") return;
			let next: PermissionState;
			try {
				next = permissionState(await MODULES[permission].request());
			} catch {
				next = "unavailable";
			}
			setStates((current) =>
				current ? { ...current, [permission]: next } : current,
			);
			// Notifications just allowed: this device can now receive them.
			if (permission === "notifications" && next === "granted" && user) {
				await syncPushToken(user.id);
			}
		},
		[states, user],
	);

	return { states, act };
}
