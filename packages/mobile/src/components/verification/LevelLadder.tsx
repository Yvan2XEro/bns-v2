import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	badgeForLevel,
	badgeLabelKey,
	levelLadder,
} from "@/src/lib/verification";
import type { ShopCapabilities } from "@/src/types/api";

/**
 * The three levels on a rail, each with what it unlocks; the next one to
 * reach is framed. A read of the shop's own capabilities, never an action,
 * so it renders the same whether or not the flag allows starting something.
 */
export function LevelLadder({
	capabilities,
}: {
	capabilities: ShopCapabilities;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const rungs = levelLadder(capabilities);
	const next = capabilities.effectiveLevel + 1;

	return (
		<View accessibilityRole="list">
			{rungs.map((rung, index) => {
				const held = rung.state !== "locked";
				const isNext = rung.level === next;
				const labelKey = badgeLabelKey(badgeForLevel(rung.level));
				const title = [
					t("verification.ladder.levelTitle", { level: rung.level }),
					labelKey ? t(`shop.${labelKey}`) : null,
				]
					.filter(Boolean)
					.join(" · ");
				return (
					<View key={rung.level} style={styles.rung}>
						<View style={styles.rail}>
							<View
								style={[
									styles.dot,
									held
										? { backgroundColor: c.primary, borderColor: c.primary }
										: {
												backgroundColor: c.card,
												borderColor: isNext ? c.primary : c.border,
											},
								]}
							>
								{held ? (
									<Ionicons name="checkmark" size={16} color="#fff" />
								) : (
									<Text
										style={[
											styles.dotText,
											{ color: isNext ? c.primary : c.muted },
										]}
									>
										{rung.level}
									</Text>
								)}
							</View>
							{index < rungs.length - 1 ? (
								<View
									style={[
										styles.line,
										{ backgroundColor: held ? c.primary : c.border },
									]}
								/>
							) : null}
						</View>
						<View
							style={[
								styles.body,
								isNext && [
									styles.framed,
									{ backgroundColor: c.card, borderColor: c.border },
								],
							]}
						>
							<Text
								style={[
									styles.title,
									{ color: held || isNext ? c.text : c.muted },
								]}
							>
								{title}
							</Text>
							<Text style={[styles.benefit, { color: c.muted }]}>
								{t(`verification.ladder.benefit.${rung.level}`)}
							</Text>
						</View>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	rung: { flexDirection: "row", gap: 12 },
	rail: { width: 30, alignItems: "center" },
	dot: {
		width: 30,
		height: 30,
		borderRadius: 15,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
	},
	dotText: { fontSize: 14, fontFamily: Fonts.displayBold },
	line: { flex: 1, width: 2, marginVertical: 2 },
	body: { flex: 1, gap: 2, paddingTop: 4, paddingBottom: 18 },
	framed: {
		borderWidth: 1,
		borderRadius: 14,
		padding: 12,
		marginBottom: 14,
		marginTop: -2,
	},
	title: { fontSize: 15, fontFamily: Fonts.displayBold },
	benefit: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
});
