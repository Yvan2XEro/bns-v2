import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	activityChanges,
	activityLabelKey,
	activityTargetHref,
} from "@/src/lib/shopActivity";
import type { ShopActivityView, ShopRole } from "@/src/types/api";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Matches the `time.*` keys already used by `account/notifications.tsx`. */
function relativeTime(iso: string, t: Translate): string {
	const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return t("time.justNow");
	if (minutes < 60) return t("time.minutesAgo", { count: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t("time.hoursAgo", { count: hours });
	const days = Math.floor(hours / 24);
	if (days < 7) return t("time.daysAgo", { count: days });
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return t("time.weeksAgo", { count: weeks });
	return t("time.monthsAgo", { count: Math.floor(days / 30) });
}

/**
 * One row of the append-only shop activity log. `activityChanges` is handed
 * the viewer's role so a `variant.cost_changed` entry renders no before/after
 * at all for a role without `costs.view` — see `shopActivity.ts` for why this
 * does not lean on the API's own write-time guard to stay quiet here too.
 */
export function ActivityRow({
	entry,
	role,
}: {
	entry: ShopActivityView;
	role: ShopRole | null | undefined;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const changes = activityChanges(entry, role);
	const href = activityTargetHref(entry);
	const targetLabel = t(`shopActivity.targets.${entry.targetType}`);
	const roleLabel = t(`shopActivity.roles.${entry.actorRole}`);

	return (
		<View
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={styles.headerLine}>
				<Text
					style={[styles.actor, { color: c.text }]}
					numberOfLines={1}
					accessibilityLabel={`${entry.actor?.name ?? roleLabel} (${roleLabel})`}
				>
					{entry.actor?.name ?? roleLabel}
				</Text>
				{entry.actor ? (
					<Text style={[styles.role, { color: c.muted }]}>{roleLabel}</Text>
				) : null}
				<Text style={[styles.time, { color: c.muted }]}>
					{relativeTime(entry.createdAt, t)}
				</Text>
			</View>

			<Text style={[styles.action, { color: c.body }]}>
				{t(activityLabelKey(entry.action))}
			</Text>

			{changes.length > 0 ? (
				<View style={styles.changes}>
					{changes.map((change) => (
						<Text
							key={change.field}
							style={[styles.changeRow, { color: c.muted }]}
						>
							{change.field}: {change.before} → {change.after}
						</Text>
					))}
				</View>
			) : null}

			{href ? (
				<Pressable
					onPress={() => router.push(href)}
					accessibilityRole="link"
					accessibilityLabel={targetLabel}
					style={styles.target}
					hitSlop={8}
				>
					<Ionicons name="open-outline" size={14} color={c.primary} />
					<Text style={[styles.targetText, { color: c.primary }]}>
						{targetLabel}
					</Text>
				</Pressable>
			) : (
				<Text style={[styles.targetText, styles.target, { color: c.muted }]}>
					{targetLabel}
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
	headerLine: { flexDirection: "row", alignItems: "center", gap: 6 },
	actor: { flex: 1, fontSize: 14, fontFamily: Fonts.bodySemibold },
	role: { fontSize: 11, fontFamily: Fonts.body },
	time: { fontSize: 11, fontFamily: Fonts.body },
	action: { fontSize: 13, fontFamily: Fonts.body },
	changes: { gap: 2 },
	changeRow: { fontSize: 12, fontFamily: Fonts.body },
	target: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		minHeight: 44,
	},
	targetText: { fontSize: 12, fontFamily: Fonts.bodySemibold },
});
