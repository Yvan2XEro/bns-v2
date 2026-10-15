import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { useShopTheme } from "@/src/components/shop/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { ShopVerificationResponse } from "@/src/types/api";

const TOP_LEVEL = 3;

/**
 * The shop's current standing: badge, "2 / 3" and a bar per level, and the
 * expiry. Rendered from `view.capabilities` and `view.levelExpiresAt` alone —
 * never gated on `view.enabled`, so a paused flag never hides where the shop
 * already stands.
 */
export function VerificationStatusCard({
	view,
}: {
	view: ShopVerificationResponse;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";
	const level = view.capabilities.effectiveLevel;

	const expiresOn = formatDate(
		view.levelExpiresAt,
		{ day: "numeric", month: "long", year: "numeric" },
		locale,
	);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.row}>
				<View style={styles.main}>
					<Text style={[styles.label, { color: c.muted }]}>
						{t("verification.statusCard.current")}
					</Text>
					{level === 0 ? (
						<Text style={[styles.noLevel, { color: c.muted }]}>
							{t("verification.statusCard.noLevel")}
						</Text>
					) : (
						<LevelBadge badge={view.capabilities.badge} />
					)}
				</View>
				<Text style={[styles.level, { color: c.primary }]}>
					{level}
					<Text style={[styles.of, { color: c.muted }]}> / {TOP_LEVEL}</Text>
				</Text>
			</View>
			<View style={styles.bars}>
				{Array.from({ length: TOP_LEVEL }, (_, index) => (
					<View
						key={index}
						style={[
							styles.bar,
							{ backgroundColor: index < level ? c.primary : c.border },
						]}
					/>
				))}
			</View>
			{expiresOn ? (
				<Text style={[styles.expiry, { color: c.muted }]}>
					{t("verification.statusCard.expiresOn", { date: expiresOn })}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
	main: { flex: 1, gap: 6, alignItems: "flex-start" },
	label: { fontSize: 13, fontFamily: Fonts.body },
	noLevel: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	level: { fontSize: 36, fontFamily: Fonts.displayExtrabold },
	of: { fontSize: 18, fontFamily: Fonts.displayBold },
	bars: { flexDirection: "row", gap: 6 },
	bar: { flex: 1, height: 6, borderRadius: 3 },
	expiry: { fontSize: 12, fontFamily: Fonts.body },
});
