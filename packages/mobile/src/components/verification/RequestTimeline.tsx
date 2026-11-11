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

const DOT = 12;
const RAIL = 2;
const GUTTER = 24;
/** Where the dot's top sits, so its centre lines up with the label's first line. */
const STEP_TOP = 4;

/**
 * One request's history, newest first, exactly as `buildTimeline` built it,
 * drawn as one ruled line: a dot per status, a rail joining them, and no box
 * around each step. The current step gets a ringed dot and the heavier label.
 *
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
			{entries.map((entry, index) => {
				const tone = statusToneKey(entry.status);
				const dotColor = c[DOT_COLOR_KEY[tone]];
				const last = index === entries.length - 1;
				const label = t(`verification.timeline.status.${entry.status}`);
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
						style={styles.row}
						accessible
						accessibilityLabel={date ? `${label}, ${date}` : label}
					>
						<View style={styles.gutter}>
							{index > 0 ? (
								<View
									style={[
										styles.rail,
										styles.railTop,
										{ backgroundColor: c.border },
									]}
								/>
							) : null}
							{!last ? (
								<View
									style={[
										styles.rail,
										styles.railBottom,
										{ backgroundColor: c.border },
									]}
								/>
							) : null}
							<View
								style={[
									styles.dot,
									{ backgroundColor: dotColor },
									entry.current && {
										borderColor: c.primarySoft,
										borderWidth: 3,
										width: DOT + 6,
										height: DOT + 6,
										borderRadius: (DOT + 6) / 2,
										marginTop: STEP_TOP - 3,
									},
								]}
							/>
						</View>
						<View style={[styles.body, !last && styles.bodySpaced]}>
							<Text
								style={[
									entry.current ? styles.statusCurrent : styles.status,
									{ color: entry.current ? c.text : c.body },
								]}
							>
								{label}
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
	list: { paddingTop: 2 },
	row: { flexDirection: "row", alignItems: "stretch" },
	gutter: { width: GUTTER, alignItems: "center" },
	rail: {
		position: "absolute",
		width: RAIL,
		left: (GUTTER - RAIL) / 2,
	},
	railTop: { top: 0, height: STEP_TOP + DOT / 2 },
	railBottom: { top: STEP_TOP + DOT / 2, bottom: 0 },
	dot: {
		width: DOT,
		height: DOT,
		borderRadius: DOT / 2,
		marginTop: STEP_TOP,
	},
	body: { flex: 1, gap: 2, paddingLeft: 8 },
	bodySpaced: { paddingBottom: 16 },
	status: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	statusCurrent: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodyBold },
	date: { fontSize: 12, lineHeight: 16, fontFamily: Fonts.body },
});
