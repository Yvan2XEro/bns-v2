import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { formatDate } from "@/src/lib/formatDate";
import type { ModerationShopSheet } from "@/src/types/api";
import type { ModerationPalette, Translate } from "./theme";

interface ShopIdentityCardProps {
	shop: ModerationShopSheet["shop"];
	owner: ModerationShopSheet["owner"];
	counts: ModerationShopSheet["counts"];
	c: ModerationPalette;
	t: Translate;
}

/** Top card: avatar, name, level/handle/status, the owner link, and the count row. */
export function ShopIdentityCard({
	shop,
	owner,
	counts,
	c,
	t,
}: ShopIdentityCardProps) {
	const statusColor = shop.status === "active" ? c.success : c.danger;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.identity}>
				<ShopAvatar
					name={shop.name}
					logo={shop.logo?.url ?? null}
					size={48}
					radius={12}
				/>
				<View style={{ flex: 1, gap: 4 }}>
					<Text style={[styles.name, { color: c.text }]}>{shop.name}</Text>
					<View style={styles.row}>
						<LevelBadge level={shop.level} size="sm" />
						<Text style={[styles.meta, { color: c.muted }]}>
							@{shop.handle}
						</Text>
						<View
							style={[
								styles.pill,
								{
									backgroundColor:
										shop.status === "active" ? c.successSoft : c.dangerSoft,
								},
							]}
						>
							<Text style={[styles.pillText, { color: statusColor }]}>
								{t(`moderation.shopStatus_${shop.status}`)}
							</Text>
						</View>
					</View>
				</View>
			</View>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("moderation.account")}
				onPress={() => router.push(`/moderation/user/${owner.id}` as never)}
				style={[styles.ownerRow, { borderTopColor: c.border }]}
			>
				<Ionicons name="person-circle-outline" size={22} color={c.muted} />
				<View style={{ flex: 1 }}>
					<Text style={[styles.ownerName, { color: c.text }]}>
						{owner.name || owner.email}
					</Text>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.ownerSince", {
							date: formatDate(shop.createdAt, {
								month: "long",
								year: "numeric",
							}),
						})}
					</Text>
				</View>
				<Text style={[styles.link, { color: c.primary }]}>
					{t("moderation.account")}
				</Text>
			</Pressable>

			<View style={[styles.stats, { borderTopColor: c.border }]}>
				<Stat
					label={t("moderation.statProducts")}
					value={counts.activeProducts}
					c={c}
				/>
				<Stat
					label={t("moderation.statDrafts")}
					value={counts.draftProducts}
					c={c}
				/>
				<Stat
					label={t("moderation.statReports")}
					value={counts.reportsAgainst}
					c={c}
				/>
			</View>
		</View>
	);
}

function Stat({
	label,
	value,
	c,
}: {
	label: string;
	value: number;
	c: ModerationPalette;
}) {
	return (
		<View style={styles.stat}>
			<Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
			<Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		gap: 10,
	},
	identity: { flexDirection: "row", alignItems: "center", gap: 12 },
	row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
	name: { fontSize: 16, fontFamily: Fonts.displayBold },
	meta: { fontSize: 12, fontFamily: Fonts.body, marginTop: 1 },
	pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	ownerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 10,
		minHeight: 44,
	},
	ownerName: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	link: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	stats: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 12,
	},
	stat: { flex: 1, alignItems: "center", gap: 2 },
	statValue: { fontSize: 18, fontFamily: Fonts.displayBold },
	statLabel: { fontSize: 11, fontFamily: Fonts.body, textAlign: "center" },
});
