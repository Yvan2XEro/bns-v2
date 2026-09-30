import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	type ChecklistStep,
	type ChecklistStepKey,
	countDoneSteps,
} from "@/src/lib/sellerChecklist";
import type { BadgeLevel } from "@/src/types/api";
import { LevelBadge } from "./LevelBadge";
import { useShopTheme } from "./theme";

export interface ChecklistStepMeta {
	title: string;
	body: string;
	action?: string;
	onPress: () => void;
}

/**
 * First-run "getting started" card. The screen decides *whether* to render
 * it (only while the shop has no products yet) and supplies each step's
 * copy and navigation, since those are screen-specific; this component only
 * lays the checklist out.
 */
export function SellerChecklistCard({
	badge,
	createdToday,
	ownerFirstName,
	shopName,
	steps,
	stepMeta,
}: {
	/**
	 * The server's computed, expiry-aware badge — see `MyShop["badge"]`.
	 * Never `badgeForLevel(level)`, which would still show "business" after
	 * a level-3 approval expires and before the nightly job catches up.
	 */
	badge: BadgeLevel | null;
	createdToday: boolean;
	ownerFirstName: string;
	shopName: string;
	steps: ChecklistStep[];
	stepMeta: Record<ChecklistStepKey, ChecklistStepMeta>;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const doneCount = countDoneSteps(steps);

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.pills}>
				<LevelBadge badge={badge} size="sm" />
				{createdToday ? (
					<View style={[styles.pill, { backgroundColor: c.successSoft }]}>
						<Text style={[styles.pillText, { color: c.successText }]}>
							{t("seller.createdToday")}
						</Text>
					</View>
				) : null}
			</View>
			<Text style={[styles.welcome, { color: c.text }]}>
				{t("seller.welcome", { name: ownerFirstName })}
			</Text>
			<Text style={[styles.body, { color: c.muted }]}>
				{t("seller.welcomeBody", { shop: shopName })}
			</Text>
			<View style={styles.stepsHead}>
				<Text style={[styles.section, { color: c.text }]}>
					{t("seller.getStarted")}
				</Text>
				<Text style={[styles.meta, { color: c.muted }]}>
					{doneCount} / {steps.length}
				</Text>
			</View>
			{steps.map((step, index) => {
				const meta = stepMeta[step.key];
				return (
					<Pressable
						key={step.key}
						onPress={meta.onPress}
						style={[styles.step, { borderTopColor: c.border }]}
						accessibilityRole="button"
						accessibilityLabel={meta.title}
					>
						<View
							style={[
								styles.stepDot,
								{ backgroundColor: step.done ? c.success : c.neutralSoft },
							]}
						>
							{step.done ? (
								<Ionicons name="checkmark" size={14} color="#fff" />
							) : (
								<Text style={[styles.stepNum, { color: c.body }]}>
									{index + 1}
								</Text>
							)}
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.stepTitle, { color: c.text }]}>
								{meta.title}
							</Text>
							<Text style={[styles.meta, { color: c.muted }]}>{meta.body}</Text>
						</View>
						{meta.action ? (
							<View style={[styles.stepAction, { backgroundColor: c.sell }]}>
								<Text style={styles.stepActionText}>{meta.action}</Text>
							</View>
						) : (
							<Ionicons name="chevron-forward" size={16} color={c.muted} />
						)}
					</Pressable>
				);
			})}
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
	pills: { flexDirection: "row", gap: 8 },
	pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	welcome: { fontSize: 20, fontFamily: Fonts.displayExtrabold },
	body: { fontSize: 14, fontFamily: Fonts.body },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	stepsHead: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 6,
	},
	section: { fontSize: 15, fontFamily: Fonts.displayBold },
	step: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	stepDot: {
		width: 26,
		height: 26,
		borderRadius: 13,
		alignItems: "center",
		justifyContent: "center",
	},
	stepNum: { fontSize: 12, fontFamily: Fonts.bodyBold },
	stepTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	stepAction: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
	stepActionText: {
		color: "#fff",
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
	},
});
