import { Redirect } from "expo-router";

/**
 * The launch route. It must redirect at once: a delayed redirect from here
 * (e.g. waiting for the stored app mode) fires after a deep link has opened
 * its screen and drags the user off it — the social-login callback was lost
 * that way. Seller mode is applied from the home tab instead.
 */
export default function Index() {
	return <Redirect href="/(tabs)/home" />;
}
