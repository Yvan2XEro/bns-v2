import { Redirect, router } from "expo-router";
import { StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Header } from "@/src/components/shop/create/Header";
import { LoadingShell } from "@/src/components/shop/create/LoadingShell";
import { ShopDetailsForm } from "@/src/components/shop/create/ShopDetailsForm";
import { ShopsUnavailable } from "@/src/components/shop/create/ShopsUnavailable";
import { PhoneGate } from "@/src/components/shop/PhoneGate";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCreateShopGate } from "@/src/hooks/useCreateShopGate";
import { useTranslation } from "@/src/lib/i18n";

function closeRoute() {
	return router.canGoBack() ? router.back() : router.replace("/(tabs)/account");
}

/**
 * Ownership decides everything before the flag or the phone status do: an
 * owner keeps full access with the flag off, and a signed-in non-owner sees
 * creation only with the flag on and their phone verified. See
 * `useCreateShopGate` for the exact order.
 */
export default function CreateShopScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const gate = useCreateShopGate();
	const title = t("shop.createTitle");

	if (gate.phase === "owner") {
		// Renders alongside the redirect so an owner never sees the create
		// form flash before navigation completes.
		return (
			<>
				<LoadingShell onClose={closeRoute} title={title} />
				<Redirect href={"/seller" as never} />
			</>
		);
	}

	if (gate.phase === "loading" || gate.phase === "phone-loading") {
		return <LoadingShell onClose={closeRoute} title={title} />;
	}

	if (gate.phase === "unavailable") {
		return <ShopsUnavailable onClose={closeRoute} title={title} />;
	}

	if (gate.phase === "phone-gate") {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<Header onClose={closeRoute} title={title} />
				<KeyboardAwareScrollView keyboardShouldPersistTaps="handled">
					<PhoneGate onVerified={gate.onVerified} />
				</KeyboardAwareScrollView>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<Header onClose={closeRoute} title={title} />
			<ShopDetailsForm phone={gate.phone} />
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
});
