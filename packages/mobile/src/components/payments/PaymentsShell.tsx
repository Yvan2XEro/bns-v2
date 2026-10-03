import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { can } from "@/src/lib/shopRoles";
import type { ShopRole } from "@/src/types/api";

/**
 * Shell shared by the payments hub, payout detail and setup screens.
 * `payments.view` gates all three, same as billing's own shell — a role
 * without it lands on an explanation instead of a failed request.
 */
export function PaymentsShell({
	title,
	children,
}: {
	title: string;
	children: (shop: { shopId: string; role: ShopRole | null }) => ReactNode;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const mine = useMyShop();
	const shopId = mine.data?.shop?.id;
	const role = mine.data?.role ?? null;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={title} />
			{mine.isLoading ? (
				<View style={styles.center}>
					<ActivityIndicator color={c.primary} />
				</View>
			) : !shopId || !can(role, "payments.view") ? (
				<EmptyState
					illustration="auth"
					title={t("payments.seller_title")}
					subtitle={t("payments.seller_noAccess")}
				/>
			) : (
				children({ shopId, role })
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
