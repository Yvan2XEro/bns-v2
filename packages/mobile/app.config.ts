/// <reference types="node" />
// Read by the Expo CLI under Node, not bundled into the app.
import { existsSync } from "node:fs";
import type { ConfigContext, ExpoConfig } from "expo/config";

/** Where a local build finds Android's Firebase config (git-ignored). */
const LOCAL_GOOGLE_SERVICES = "./google-services.json";

/**
 * app.json, plus what stays out of git: Android's Firebase config
 * (`google-services.json`), without which the device never gets an FCM token
 * and so never an Expo push token. EAS hands it to the build as the
 * `GOOGLE_SERVICES_JSON` file variable; locally, a git-ignored
 * `google-services.json` next to this file does the same. Without either,
 * the app still builds — with no push on Android.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
	const { name, slug } = config;
	if (!name || !slug) throw new Error("app.json must name the app");
	const googleServicesFile =
		process.env.GOOGLE_SERVICES_JSON ??
		(existsSync(LOCAL_GOOGLE_SERVICES) ? LOCAL_GOOGLE_SERVICES : undefined);
	return {
		...config,
		name,
		slug,
		android: { ...config.android, googleServicesFile },
	};
};
