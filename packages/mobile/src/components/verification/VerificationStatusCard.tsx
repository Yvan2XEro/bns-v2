import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { useShopTheme } from "@/src/components/shop/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import type { ShopVerificationResponse } from "@/src/types/api";

/**
 * The shop's current standing: badge and expiry. Rendered from
 * `view.capabilities` and `view.levelExpiresAt` alone — never gated on
 * `view.enabled`, so a paused flag never hides where the shop already
 * stands.
 */
export function VerificationStatusCard({
	view,
}: {
	view: ShopVerificationResponse;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";

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
				<LevelBadge badge={view.capabilities.badge} />
				{view.capabilities.effectiveLevel === 0 ? (
					<Text style={[styles.noLevel, { color: c.muted }]}>
						{t("verification.statusCard.noLevel")}
					</Text>
				) : null}
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
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
		gap: 8,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
	noLevel: { fontSize: 13, fontFamily: Fonts.body },
	expiry: { fontSize: 12, fontFamily: Fonts.body },
});
