import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "@/src/components/EmptyState";
import { ListSkeleton } from "@/src/components/shop/ListSkeleton";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { can } from "@/src/lib/shopRoles";
import type { ShopRole } from "@/src/types/api";

/**
 * Shell for the billing and order-settings screens. `payments.view` gates all
 * three — staff process orders but do not read the shop's commission or caps,
 * and the API refuses them anyway — so a role without it lands on an
 * explanation instead of a failed request.
 */
export function BillingShell({
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
				<ListSkeleton rows={4} />
			) : !shopId || !can(role, "payments.view") ? (
				<EmptyState
					illustration="auth"
					title={t("billing.title")}
					subtitle={t("billing.noAccess")}
				/>
			) : (
				children({ shopId, role })
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
});
