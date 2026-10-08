import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { can } from "@/src/lib/shopRoles";

/** Delivery settings need `settings.edit` and `deliveryZonesEnabled`; anything else lands on an explanation. */
export function SettingsShell({
	title,
	right,
	children,
}: {
	title: string;
	right?: ReactNode;
	children: (shopId: string) => ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { deliveryZonesEnabled } = useAppConfig();
	const mine = useMyShop();
	const shopId = mine.data?.shop?.id;
	const role = mine.data?.role ?? null;
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={title} right={right} />
			{mine.isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : !deliveryZonesEnabled ? (
				<EmptyState
					illustration="notFound"
					title={t("deliverySettings.title")}
					subtitle={t("deliverySettings.disabled")}
				/>
			) : !shopId || !can(role, "settings.edit") ? (
				<EmptyState
					illustration="auth"
					title={t("deliverySettings.title")}
					subtitle={t("deliverySettings.noAccess")}
				/>
			) : (
				children(shopId)
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
