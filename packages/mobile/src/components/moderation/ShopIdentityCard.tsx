import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { ShopAvatar } from "@/src/components/shop/ShopAvatar";
import { formatDate } from "@/src/lib/formatDate";
import { badgeForLevel } from "@/src/lib/verification";
import type { ModerationShopSheet } from "@/src/types/api";
import { ModerationCard, TonePill } from "./ModerationKit";
import type { ModerationPalette, Translate } from "./theme";
import { tonesOf } from "./tones";

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
	const k = tonesOf(c);
	const ownerName = owner.name || owner.email;

	return (
		<ModerationCard>
			<View style={styles.identity}>
				<ShopAvatar
					name={shop.name}
					logo={shop.logo?.url ?? null}
					size={52}
					radius={12}
				/>
				<View style={styles.identityText}>
					<Text
						accessibilityRole="header"
						style={[styles.name, { color: c.text }]}
					>
						{shop.name}
					</Text>
					<View style={styles.row}>
						<LevelBadge badge={badgeForLevel(shop.level)} size="sm" />
						<Text style={[styles.meta, { color: c.muted }]}>
							@{shop.handle}
						</Text>
						<TonePill
							tone={shop.status === "active" ? "positive" : "negative"}
							label={t(`moderation.shopStatus_${shop.status}`)}
						/>
					</View>
				</View>
			</View>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`${ownerName}, ${t("moderation.account")}`}
				onPress={() => router.push(`/moderation/user/${owner.id}` as never)}
				style={({ pressed }) => [
					styles.ownerRow,
					{ borderTopColor: c.border, opacity: pressed ? 0.7 : 1 },
				]}
			>
				<Ionicons name="person-circle-outline" size={24} color={c.muted} />
				<View style={styles.flex}>
					<Text style={[styles.ownerName, { color: c.text }]}>{ownerName}</Text>
					<Text style={[styles.meta, { color: c.muted }]}>
						{t("moderation.ownerSince", {
							date: formatDate(shop.createdAt, {
								month: "long",
								year: "numeric",
							}),
						})}
					</Text>
				</View>
				<Text style={[styles.link, { color: k.linkText }]}>
					{t("moderation.account")}
				</Text>
				<Ionicons name="chevron-forward" size={16} color={k.linkText} />
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
					alert={counts.reportsAgainst > 0}
				/>
			</View>
		</ModerationCard>
	);
}

function Stat({
	label,
	value,
	c,
	alert,
}: {
	label: string;
	value: number;
	c: ModerationPalette;
	alert?: boolean;
}) {
	const k = tonesOf(c);
	return (
		<View
			style={styles.stat}
			accessible
			accessibilityLabel={`${label}: ${value}`}
		>
			<Text
				style={[styles.statValue, { color: alert ? k.dangerText : c.text }]}
			>
				{value}
			</Text>
			<Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	identity: { flexDirection: "row", alignItems: "center", gap: 12 },
	identityText: { flex: 1, gap: 6 },
	row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
	name: {
		fontSize: 20,
		lineHeight: 28,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	meta: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	ownerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		// Same step above the owner row as above the counts: two equal bands.
		paddingTop: 12,
		minHeight: 56,
	},
	ownerName: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	link: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	stats: {
		flexDirection: "row",
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingTop: 12,
	},
	stat: { flex: 1, alignItems: "center", gap: 2 },
	statValue: { fontSize: 24, lineHeight: 32, fontFamily: Fonts.displayBold },
	statLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.body,
		textAlign: "center",
	},
});
