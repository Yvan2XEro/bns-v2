import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { BadgeLevel } from "@/src/types/api";
import {
	actionableStep,
	type ChecklistMode,
	checklistProgress,
	type SetupStep,
} from "../../../../api/src/contracts/sellerOnboarding";
import { LevelBadge } from "./LevelBadge";
import { useShopTheme } from "./theme";

type T = (key: string, options?: Record<string, unknown>) => string;

/** The row's second line: what is left, why it matters, or who can do it. */
export function stepBody(t: T, step: SetupStep): string {
	const base = `sellerHome.step.${step.key}`;
	if (step.done) return t(`${base}.done`);
	if (step.locked) return t("sellerHome.locked");
	if (step.pending) return t(`${base}.pending`);
	if (step.key === "profile" && step.missing?.length) {
		return t(`${base}.missing`, {
			parts: step.missing
				.map((part) => t(`sellerHome.part.${part}`))
				.join(", "),
		});
	}
	if (step.key === "product" && (step.drafts ?? 0) > 0) {
		return t(`${base}.drafts`, { count: step.drafts });
	}
	if (step.key === "move") return t(`${base}.body`, { count: step.count });
	return t(`${base}.body`);
}

export interface ChecklistWelcome {
	/** The server's expiry-aware badge (`MyShop["badge"]`), never `badgeForLevel`. */
	badge: BadgeLevel | null;
	createdToday: boolean;
	firstName: string;
	shopName: string;
}

/**
 * The "first steps" card. `mode` comes from the contract's `checklistMode`:
 * full while setting up, a dismissible "ready" card once the required steps
 * are done, a single expandable line for an active shop with loose ends.
 */
export function SellerChecklistCard({
	steps,
	mode,
	welcome,
	onStep,
	onDismiss,
}: {
	steps: SetupStep[];
	mode: Exclude<ChecklistMode, "hidden">;
	welcome?: ChecklistWelcome;
	onStep: (step: SetupStep) => void;
	onDismiss?: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const progress = checklistProgress(steps);
	const left = progress.total - progress.done;

	if (mode === "collapsed" && !expanded) {
		return (
			<Pressable
				onPress={() => setExpanded(true)}
				accessibilityRole="button"
				accessibilityState={{ expanded: false }}
				style={[
					styles.collapsed,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				<View style={[styles.icon, { backgroundColor: c.primarySoft }]}>
					<Ionicons name="list-outline" size={18} color={c.primary} />
				</View>
				<Text style={[styles.collapsedText, { color: c.text }]}>
					{t("sellerHome.collapsed", { count: left })}
				</Text>
				<Ionicons name="chevron-down" size={16} color={c.muted} />
			</Pressable>
		);
	}

	const required = steps.filter((s) => s.required);
	const optional = steps.filter((s) => !s.required && (s.done || !s.locked));
	const shown = mode === "complete" ? [] : required;
	const firstOpen = shown.find(actionableStep)?.key;

	const row = (step: SetupStep, index: number | null) => {
		const actionable = actionableStep(step);
		const inline = actionable && step.key === "product" && !(step.drafts ?? 0);
		return (
			<Pressable
				key={step.key}
				onPress={actionable ? () => onStep(step) : undefined}
				disabled={!actionable}
				style={[styles.step, { borderTopColor: c.border }]}
				accessibilityRole={actionable ? "button" : "text"}
				accessibilityState={{ checked: step.done, disabled: !actionable }}
				accessibilityLabel={`${t(`sellerHome.step.${step.key}.title`)}. ${stepBody(t, step)}`}
			>
				<View
					style={[
						styles.dot,
						step.done
							? { backgroundColor: c.success }
							: {
									borderWidth: 2,
									borderStyle: "dashed",
									borderColor: step.key === firstOpen ? c.primary : c.border,
								},
					]}
				>
					{step.done ? (
						<Ionicons name="checkmark" size={14} color="#fff" />
					) : step.pending ? (
						<Ionicons name="time-outline" size={14} color={c.warningText} />
					) : step.locked ? (
						<Ionicons name="lock-closed" size={12} color={c.muted} />
					) : index !== null ? (
						<Text style={[styles.num, { color: c.body }]}>{index}</Text>
					) : (
						<Ionicons name="add" size={14} color={c.muted} />
					)}
				</View>
				<View style={{ flex: 1 }}>
					<Text
						style={[
							styles.stepTitle,
							{ color: step.done ? c.muted : c.text },
							step.done && styles.struck,
						]}
					>
						{t(`sellerHome.step.${step.key}.title`)}
					</Text>
					<Text style={[styles.meta, { color: c.muted }]}>
						{stepBody(t, step)}
					</Text>
				</View>
				{inline ? (
					<View style={[styles.inline, { backgroundColor: c.primary }]}>
						<Ionicons name="add" size={16} color="#fff" />
						<Text style={styles.inlineText}>{t("sellerHome.add")}</Text>
					</View>
				) : actionable ? (
					<Ionicons name="chevron-forward" size={16} color={c.muted} />
				) : null}
			</Pressable>
		);
	};

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			{welcome && mode === "full" ? (
				<View style={styles.welcome}>
					<View style={styles.pills}>
						<LevelBadge badge={welcome.badge} size="sm" />
						{welcome.createdToday ? (
							<View style={[styles.pill, { backgroundColor: c.successSoft }]}>
								<Text style={[styles.pillText, { color: c.successText }]}>
									{t("seller.createdToday")}
								</Text>
							</View>
						) : null}
					</View>
					<Text style={[styles.hello, { color: c.text }]}>
						{t("seller.welcome", { name: welcome.firstName })}
					</Text>
					<Text style={[styles.body, { color: c.body }]}>
						{t("sellerHome.welcomeBody", { shop: welcome.shopName })}
					</Text>
				</View>
			) : null}

			<View style={styles.head}>
				<Text style={[styles.section, { color: c.text }]}>
					{mode === "complete"
						? t("sellerHome.readyTitle")
						: t("sellerHome.checklistTitle")}
				</Text>
				<Text style={[styles.counter, { color: c.primary }]}>
					{progress.done} / {progress.total}
				</Text>
			</View>
			{mode === "complete" ? (
				<Text style={[styles.body, { color: c.body }]}>
					{t("sellerHome.readyBody")}
				</Text>
			) : null}
			<View
				style={[styles.track, { backgroundColor: c.border }]}
				accessibilityRole="progressbar"
				accessibilityValue={{ min: 0, max: progress.total, now: progress.done }}
			>
				<View
					style={[
						styles.fill,
						{
							backgroundColor: c.primary,
							width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
						},
					]}
				/>
			</View>

			{shown.map((step, index) => row(step, index + 1))}

			{optional.length > 0 ? (
				<>
					<Text style={[styles.subhead, { color: c.muted }]}>
						{t("sellerHome.further")}
					</Text>
					{optional.map((step) => row(step, null))}
				</>
			) : null}

			{mode === "complete" && onDismiss ? (
				<Pressable
					onPress={onDismiss}
					accessibilityRole="button"
					style={[styles.dismiss, { borderColor: c.border }]}
				>
					<Text style={[styles.dismissText, { color: c.body }]}>
						{t("sellerHome.hideChecklist")}
					</Text>
				</Pressable>
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
	welcome: { gap: 6, marginBottom: 6 },
	pills: { flexDirection: "row", gap: 8 },
	pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
	pillText: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	hello: { fontSize: 22, fontFamily: Fonts.displayExtrabold },
	body: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	meta: { fontSize: 12, fontFamily: Fonts.body },
	head: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	section: { fontSize: 16, fontFamily: Fonts.displayBold },
	subhead: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		marginTop: 8,
		textTransform: "uppercase",
		letterSpacing: 0.4,
	},
	counter: { fontSize: 15, fontFamily: Fonts.displayBold },
	track: { height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 4 },
	fill: { height: 6, borderRadius: 3 },
	step: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 56,
		paddingVertical: 8,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	dot: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	num: { fontSize: 13, fontFamily: Fonts.bodyBold },
	stepTitle: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	struck: { textDecorationLine: "line-through" },
	inline: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 12,
		paddingHorizontal: 12,
		minHeight: 44,
	},
	inlineText: { color: "#fff", fontSize: 13, fontFamily: Fonts.bodyBold },
	collapsed: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		paddingHorizontal: 14,
		minHeight: 56,
	},
	collapsedText: { flex: 1, fontSize: 14, fontFamily: Fonts.bodySemibold },
	icon: {
		width: 36,
		height: 36,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	dismiss: {
		marginTop: 6,
		minHeight: 44,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	dismissText: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
