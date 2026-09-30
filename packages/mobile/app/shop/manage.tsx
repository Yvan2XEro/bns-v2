import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { formStyles as f } from "@/src/components/seller/formStyles";
import { ShopAddressCard } from "@/src/components/shop/manage/ShopAddressCard";
import { ShopBrandingCard } from "@/src/components/shop/manage/ShopBrandingCard";
import { ShopCloseCard } from "@/src/components/shop/manage/ShopCloseCard";
import { ShopLegalCard } from "@/src/components/shop/manage/ShopLegalCard";
import { ShopProfileCard } from "@/src/components/shop/manage/ShopProfileCard";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import { isShopOwner } from "@/src/lib/variants";

export default function ShopSettingsScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { data, isLoading } = useMyShop();
	const shop = data?.shop;

	if (isLoading || !shop) {
		return (
			<SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
				<SellerHeader title={t("shop.settingsTitle")} />
				<ActivityIndicator style={{ marginTop: 40 }} color={c.primary} />
			</SafeAreaView>
		);
	}

	const readOnly = shop.status !== "active";
	const owner = isShopOwner(data?.role);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("shop.settingsTitle")} subtitle={shop.name} />
			<KeyboardAwareScrollView
				contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
				keyboardShouldPersistTaps="handled"
			>
				<ShopBrandingCard shop={shop} readOnly={readOnly} />
				<ShopProfileCard shop={shop} readOnly={readOnly} />
				<ShopAddressCard
					shop={shop}
					role={data?.role ?? null}
					readOnly={readOnly}
				/>
				<ShopLegalCard shop={shop} />

				<Pressable
					onPress={() => router.push("/shop/move-listings" as never)}
					disabled={readOnly}
					accessibilityRole="button"
					accessibilityLabel={t("seller.stepMove")}
					style={[
						f.card,
						styles.linkRow,
						{ backgroundColor: c.card, borderColor: c.border },
					]}
				>
					<Ionicons
						name="swap-horizontal-outline"
						size={18}
						color={c.primary}
					/>
					<Text style={[f.label, { color: c.text, flex: 1 }]}>
						{t("seller.stepMove")}
					</Text>
					<Ionicons name="chevron-forward" size={16} color={c.muted} />
				</Pressable>

				{owner ? <ShopCloseCard shop={shop} /> : null}
			</KeyboardAwareScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	linkRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 44,
	},
});
