import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		// SDK 57 replaced `shouldShowAlert` with the banner/list pair; without
		// these, foreground notifications silently never display.
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: true,
		shouldSetBadge: true,
	}),
});

export async function registerForPushNotificationsAsync(): Promise<
	string | null
> {
	// Everything here runs on a cold-start path; an unhandled rejection from any
	// of these native calls would surface as an app-level crash.
	try {
		if (Platform.OS === "android") {
			await Notifications.setNotificationChannelAsync("default", {
				name: "default",
				importance: Notifications.AndroidImportance.MAX,
				vibrationPattern: [0, 250, 250, 250],
				lightColor: "#1e40af",
			});
		}

		const { status: existingStatus } =
			await Notifications.getPermissionsAsync();
		let finalStatus = existingStatus;

		if (existingStatus !== "granted") {
			const { status } = await Notifications.requestPermissionsAsync();
			finalStatus = status;
		}

		if (finalStatus !== "granted") {
			return null;
		}
	} catch (error) {
		console.warn("[notifications] permission setup failed:", error);
		return null;
	}

	try {
		const projectId =
			Constants.expoConfig?.extra?.eas?.projectId ??
			Constants.easConfig?.projectId;
		const tokenData = await Notifications.getExpoPushTokenAsync(
			projectId ? { projectId } : undefined,
		);
		return tokenData.data;
	} catch {
		return null;
	}
}

export async function syncPushTokenWithBackend(
	pushToken: string,
): Promise<void> {
	try {
		await api.post("/api/public/novu/register-token", { token: pushToken });
	} catch (error) {
		console.warn("[notifications] Failed to sync push token:", error);
	}
}
