import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { ShopBrandingCard } from "@/src/components/shop/manage/ShopBrandingCard";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import { useMyShop } from "@/src/hooks/useShops";
import { useTranslation } from "@/src/lib/i18n";
import {
	type RowValue,
	type SettingsRow,
	shopSettingsGroups,
} from "@/src/lib/shopSettingsRows";
import { isShopOwner } from "@/src/lib/variants";

export default function ShopSettingsScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { data, isLoading } = useMyShop();
	const { webUrl } = useAppConfig();
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
	const groups = shopSettingsGroups(shop, isShopOwner(data?.role), webUrl);

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("shop.settingsTitle")} subtitle={shop.name} />
			<ScreenColumn width="wide">
				<ScrollView contentContainerStyle={styles.content}>
					<ShopBrandingCard shop={shop} readOnly={readOnly} />

					{groups.map((group) => (
						<View key={group.titleKey} style={styles.group}>
							<Text style={[styles.groupTitle, { color: c.muted }]}>
								{t(group.titleKey)}
							</Text>
							<View
								style={[
									styles.panel,
									{ backgroundColor: c.card, borderColor: c.border },
								]}
							>
								{group.rows.map((row, index) => (
									<SettingsRowButton
										key={row.id}
										row={row}
										first={index === 0}
										onPress={() =>
											router.push({
												pathname: "/shop/settings/[section]",
												params: { section: row.section },
											})
										}
									/>
								))}
								{group.titleKey === "shop.settingsRows.pageTitle" ? (
									<Pressable
										onPress={() => router.push("/shop/move-listings")}
										disabled={readOnly}
										accessibilityRole="button"
										accessibilityLabel={t("seller.stepMove")}
										accessibilityState={{ disabled: readOnly }}
										style={[
											styles.row,
											styles.rowDivider,
											{ borderTopColor: c.border, opacity: readOnly ? 0.5 : 1 },
										]}
									>
										<Text style={[styles.rowLabel, { color: c.text }]}>
											{t("seller.stepMove")}
										</Text>
										<Ionicons
											name="chevron-forward"
											size={16}
											color={c.muted}
										/>
									</Pressable>
								) : null}
							</View>
						</View>
					))}
				</ScrollView>
			</ScreenColumn>
		</SafeAreaView>
	);
}

function useRowValue(value: RowValue): string {
	const { t } = useTranslation();
	if (!value) return t("shop.settingsRows.empty");
	if ("text" in value) return value.text;
	return t(value.key, value.values);
}

function SettingsRowButton({
	row,
	first,
	onPress,
}: {
	row: SettingsRow;
	first: boolean;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const label = t(row.labelKey);
	const value = useRowValue(row.value);
	const danger = row.tone === "danger";

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${label}, ${value}`}
			style={[
				styles.row,
				!first && [styles.rowDivider, { borderTopColor: c.border }],
			]}
		>
			{danger ? (
				<View style={styles.dangerText}>
					<Text style={[styles.rowLabel, { color: c.danger }]}>{label}</Text>
					<Text style={[styles.rowHint, { color: c.muted }]} numberOfLines={2}>
						{value}
					</Text>
				</View>
			) : (
				<>
					<Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
					<Text
						style={[styles.rowValue, { color: row.value ? c.muted : c.border }]}
						numberOfLines={1}
					>
						{value}
					</Text>
				</>
			)}
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	content: { padding: 16, gap: 18, paddingBottom: 40 },
	group: { gap: 8 },
	groupTitle: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		letterSpacing: 0.6,
		textTransform: "uppercase",
		paddingHorizontal: 4,
	},
	panel: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 50,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
	rowLabel: { fontSize: 15, fontFamily: Fonts.bodyMedium },
	rowValue: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
		textAlign: "right",
	},
	dangerText: { flex: 1, gap: 2 },
	rowHint: { fontSize: 12, fontFamily: Fonts.body },
});
