import { focusManager } from "@tanstack/react-query";
import { AppState, type AppStateStatus, Platform } from "react-native";

/** The app counts as focused while it is in the foreground. */
export function isAppFocused(status: AppStateStatus): boolean {
	return status === "active";
}

// React Native has no window focus event: without this, a seller who comes
// back to the app reads orders and messages cached minutes ago. On the web
// build TanStack's own visibility listener already does the job.
if (Platform.OS !== "web") {
	focusManager.setEventListener((setFocused) => {
		const subscription = AppState.addEventListener("change", (status) =>
			setFocused(isAppFocused(status)),
		);
		return () => subscription.remove();
	});
}
