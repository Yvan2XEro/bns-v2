import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import { AccountScreen } from "@/src/screens/account/AccountScreen";

/**
 * The account tab, pushed from seller mode. Signing out pops back to the
 * seller tabs, whose layout resets the mode and redirects to buyer home.
 */
export default function AccountOverviewScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { user } = useAuth();

	useEffect(() => {
		if (!user && router.canDismiss()) router.dismissAll();
	}, [user]);

	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<SellerHeader title={t("sellerMode.myAccount")} />
			<View style={{ flex: 1 }}>
				<AccountScreen />
			</View>
		</SafeAreaView>
	);
}
