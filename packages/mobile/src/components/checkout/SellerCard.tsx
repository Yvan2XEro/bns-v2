import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { CartView, QuoteResponse } from "@/src/types/order";
import { LevelBadge } from "../shop/LevelBadge";
import { ShopAvatar } from "../shop/ShopAvatar";
import { useShopTheme } from "../shop/theme";

/** The review's seller card: logo, name, badge, opening year and the shop's public street address. */
export function SellerCard({
	shop,
	seller,
	phone,
}: {
	shop: NonNullable<CartView["shop"]>;
	seller: QuoteResponse["seller"];
	phone: string | null;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const address = seller?.address ?? shop.address ?? null;
	const sinceYear = seller?.sinceYear ?? shop.sinceYear ?? null;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.label, { color: c.muted }]}>
				{t("checkout.sellerLabel")}
			</Text>
			<View style={styles.row}>
				<ShopAvatar
					name={shop.name}
					logo={shop.logoUrl}
					size={40}
					radius={12}
				/>
				<View style={styles.main}>
					<View style={styles.nameRow}>
						<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
							{shop.name}
						</Text>
						<LevelBadge badge={shop.badge} size="sm" />
					</View>
					{sinceYear ? (
						<Text style={[styles.meta, { color: c.muted }]}>
							{t("checkout.sellerSince", { year: String(sinceYear) })}
						</Text>
					) : null}
				</View>
			</View>
			{address ? (
				<View style={styles.line}>
					<Ionicons name="location-outline" size={15} color={c.muted} />
					<Text style={[styles.meta, styles.flex, { color: c.text }]}>
						{address}
					</Text>
				</View>
			) : null}
			{phone ? (
				<View style={styles.line}>
					<Ionicons name="call-outline" size={15} color={c.muted} />
					<Text style={[styles.meta, styles.flex, { color: c.text }]}>
						{phone}
					</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 16,
		padding: 14,
		gap: 8,
	},
	label: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
	},
	row: { flexDirection: "row", alignItems: "center", gap: 10 },
	main: { flex: 1, minWidth: 0, gap: 2 },
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		flexWrap: "wrap",
	},
	name: { fontSize: 15, fontFamily: Fonts.displayBold, flexShrink: 1 },
	meta: { fontSize: 13, fontFamily: Fonts.body },
	line: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
	flex: { flex: 1 },
});
