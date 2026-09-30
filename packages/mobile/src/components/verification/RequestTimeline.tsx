import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { statusToneKey, type TimelineEntry } from "@/src/lib/verification";

const DOT_COLOR_KEY = {
	positive: "success",
	negative: "danger",
	warning: "warningText",
	neutral: "muted",
} as const;

/**
 * One request's history, newest first, exactly as `buildTimeline` built it.
 * A plain `.map()` rather than `FlashList`: this is a bounded, in-page list —
 * at most one entry per status transition a single request can go through —
 * so it never grows large enough to need virtualising, and nesting a
 * virtualised list inside the hub's outer `ScrollView` would only trade a
 * real problem (React Native's "VirtualizedLists should never be nested
 * inside plain ScrollViews" warning) for no benefit.
 */
export function RequestTimeline({ entries }: { entries: TimelineEntry[] }) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const locale = i18n.language?.startsWith("en") ? "en-US" : "fr-FR";

	if (entries.length === 0) return null;

	return (
		<View style={styles.list}>
			{entries.map((entry) => {
				const tone = statusToneKey(entry.status);
				const dotColor = c[DOT_COLOR_KEY[tone]];
				const date = formatDate(
					entry.at,
					{
						day: "numeric",
						month: "short",
						year: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					},
					locale,
				);

				return (
					<View
						key={`${entry.status}-${entry.at}`}
						style={[
							styles.row,
							{
								borderColor: entry.current ? c.primary : c.border,
								backgroundColor: entry.current ? c.primarySoft : c.card,
							},
						]}
					>
						<View
							accessibilityElementsHidden
							importantForAccessibility="no"
							style={[styles.dot, { backgroundColor: dotColor }]}
						/>
						<View style={styles.body}>
							<Text style={[styles.status, { color: c.text }]}>
								{t(`verification.timeline.status.${entry.status}`)}
							</Text>
							{date ? (
								<Text style={[styles.date, { color: c.muted }]}>{date}</Text>
							) : null}
						</View>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { gap: 8 },
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 10,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 10,
	},
	dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
	body: { flex: 1, gap: 2 },
	status: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	date: { fontSize: 11, fontFamily: Fonts.body },
});
