import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { orderProgress } from "@/src/lib/orderProgress";
import type { OrderStatusName } from "@/src/lib/orderStatus";
import type { OrderTimestamps } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";

function stepTime(at: string, lang: "fr" | "en"): string {
	const date = new Date(at);
	const today = new Date();
	const sameDay = date.toDateString() === today.toDateString();
	return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
		...(sameDay
			? { hour: "2-digit", minute: "2-digit" }
			: { day: "numeric", month: "short" }),
	}).format(date);
}

/** Placed → confirmed → accepted → shipped → delivered, with each step's time. */
export function OrderProgress({
	status,
	timestamps,
}: {
	status: OrderStatusName;
	timestamps: OrderTimestamps;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const steps = orderProgress(status, timestamps);
	if (!steps) return null;

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
			accessibilityRole="progressbar"
		>
			{steps.map((step, index) => {
				const reached = step.state !== "todo";
				return (
					<View key={step.key} style={styles.step}>
						<View style={styles.track}>
							<View
								style={[
									styles.line,
									{
										backgroundColor:
											index === 0
												? "transparent"
												: reached
													? c.primary
													: c.border,
									},
								]}
							/>
							<View
								style={[
									styles.node,
									step.state === "done" && { backgroundColor: c.primary },
									step.state === "current" && [
										styles.nodeCurrent,
										{ borderColor: c.primary, backgroundColor: c.card },
									],
									step.state === "todo" && {
										borderColor: c.border,
										backgroundColor: c.card,
										borderWidth: 2,
									},
								]}
							>
								{step.state === "done" ? (
									<Ionicons name="checkmark" size={14} color="#ffffff" />
								) : step.state === "current" ? (
									<View style={[styles.core, { backgroundColor: c.primary }]} />
								) : null}
							</View>
							<View
								style={[
									styles.line,
									{
										backgroundColor:
											index === steps.length - 1
												? "transparent"
												: steps[index + 1]?.state !== "todo"
													? c.primary
													: c.border,
									},
								]}
							/>
						</View>
						<Text
							style={[
								styles.label,
								{
									color:
										step.state === "current"
											? c.primary
											: reached
												? c.text
												: c.muted,
								},
							]}
							numberOfLines={1}
						>
							{t(`purchases.progress_${step.key}`)}
						</Text>
						<Text style={[styles.time, { color: c.muted }]}>
							{step.at ? stepTime(step.at, lang) : "—"}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		borderRadius: 18,
		borderWidth: 1,
		paddingVertical: 14,
		paddingHorizontal: 6,
	},
	step: { flex: 1, alignItems: "center", gap: 4 },
	track: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
	line: { flex: 1, height: 2 },
	node: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	nodeCurrent: { borderWidth: 2 },
	core: { width: 10, height: 10, borderRadius: 5 },
	label: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	time: { fontSize: 10, fontFamily: Fonts.body },
});
