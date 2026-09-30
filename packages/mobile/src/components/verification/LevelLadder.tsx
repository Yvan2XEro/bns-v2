import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { LevelBadge } from "@/src/components/shop/LevelBadge";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { badgeForLevel, levelLadder } from "@/src/lib/verification";
import type { ShopCapabilities } from "@/src/types/api";

/**
 * The three-rung ladder every seller sees, whatever `enabled` says: this is
 * a read of the shop's own capabilities, never an action, so it renders the
 * same whether or not the flag allows starting something new.
 */
export function LevelLadder({
	capabilities,
}: {
	capabilities: ShopCapabilities;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const rungs = levelLadder(capabilities);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("verification.ladder.title")}
			</Text>
			<View style={styles.rungs}>
				{rungs.map((rung) => {
					const tone =
						rung.state === "locked"
							? { bg: c.neutralSoft, fg: c.muted }
							: { bg: c.primarySoft, fg: c.primary };
					return (
						<View
							key={rung.level}
							style={[
								styles.rung,
								{
									backgroundColor:
										rung.state === "current" ? c.primarySoft : c.bg,
									borderColor: rung.state === "current" ? c.primary : c.border,
								},
							]}
						>
							<View style={[styles.marker, { backgroundColor: tone.bg }]}>
								<Ionicons
									name={rung.state === "locked" ? "lock-closed" : "checkmark"}
									size={13}
									color={tone.fg}
								/>
							</View>
							<View style={styles.rungBody}>
								<LevelBadge badge={badgeForLevel(rung.level)} size="sm" />
								<Text style={[styles.state, { color: c.muted }]}>
									{t(`verification.ladder.state.${rung.state}`)}
								</Text>
							</View>
						</View>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 16,
	},
	title: { fontSize: 16, fontFamily: Fonts.displayBold },
	rungs: { marginTop: 12, gap: 10 },
	rung: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 12,
	},
	marker: {
		width: 26,
		height: 26,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	rungBody: { flex: 1, gap: 4 },
	state: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
