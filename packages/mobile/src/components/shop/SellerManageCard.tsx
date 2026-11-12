import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "./theme";

type IconName = keyof typeof Ionicons.glyphMap;

export interface ManageTile {
	key: string;
	icon: IconName;
	title: string;
	body: string;
	alert?: boolean;
	/** An unread/pending count shown as a small pill — omitted rather than shown as "0". */
	badge?: number;
	onPress: () => void;
}

/** The day's work: what a shop opens many times a day. */
const DAILY_KEYS = new Set(["orders", "returns", "inbox", "stock", "payments"]);

/**
 * Orders first, then any tile with something waiting, then the rest in the
 * caller's order (Array#sort is stable).
 */
function dailyOrder(tiles: ManageTile[]): ManageTile[] {
	const weight = (tile: ManageTile) =>
		tile.key === "orders" ? 0 : tile.alert || tile.badge ? 1 : 2;
	return [...tiles].sort((a, b) => weight(a) - weight(b));
}

/**
 * The hub's entry points in two groups: "À traiter" as tiles, sorted so what
 * waits comes first, and the rarely opened settings as compact rows below.
 */
export function SellerManageCard({ tiles }: { tiles: ManageTile[] }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const daily = dailyOrder(tiles.filter((tile) => DAILY_KEYS.has(tile.key)));
	const shopTiles = tiles.filter((tile) => !DAILY_KEYS.has(tile.key));

	return (
		<>
			{daily.length > 0 ? (
				<>
					<Text
						accessibilityRole="header"
						style={[styles.sectionLabel, { color: c.text }]}
					>
						{t("seller.manageToday")}
					</Text>
					<View style={styles.grid}>
						{daily.map(({ key, ...tile }, index) => (
							<Tile
								key={key}
								{...tile}
								// An odd last tile takes the whole row instead of leaving a hole.
								wide={daily.length % 2 === 1 && index === daily.length - 1}
							/>
						))}
					</View>
				</>
			) : null}
			{shopTiles.length > 0 ? (
				<>
					<Text
						accessibilityRole="header"
						style={[styles.sectionLabel, { color: c.text }]}
					>
						{t("seller.manage")}
					</Text>
					<View
						style={[
							styles.rows,
							{ backgroundColor: c.card, borderColor: c.border },
						]}
					>
						{shopTiles.map(({ key, ...tile }, index) => (
							<Row key={key} {...tile} first={index === 0} />
						))}
					</View>
				</>
			) : null}
		</>
	);
}

function CountPill({ badge }: { badge: number }) {
	// DESIGN.md keeps signage yellow for prices, selling and boosts; counts
	// use the unread-badge blue.
	const scheme = useColorScheme() === "dark" ? "dark" : "light";
	return (
		<View style={[styles.badge, { backgroundColor: Colors[scheme].ownBubble }]}>
			<Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
		</View>
	);
}

/** A compact settings row: icon, title, a one-line body and a chevron. */
function Row({
	icon,
	title,
	body,
	onPress,
	alert,
	badge,
	first,
}: Omit<ManageTile, "key"> & { first: boolean }) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			android_ripple={{ color: c.border }}
			style={({ pressed }) => [
				styles.row,
				!first && {
					borderTopWidth: StyleSheet.hairlineWidth,
					borderTopColor: c.border,
				},
				pressed && { backgroundColor: c.primarySoft },
			]}
			accessibilityRole="button"
			accessibilityLabel={`${title}, ${body}`}
		>
			<Ionicons name={icon} size={20} color={alert ? c.warningText : c.link} />
			<View style={styles.rowText}>
				<Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>
					{title}
				</Text>
				<Text
					style={[styles.tileBody, { color: alert ? c.warningText : c.muted }]}
					numberOfLines={1}
				>
					{body}
				</Text>
			</View>
			{badge ? <CountPill badge={badge} /> : null}
			<Ionicons name="chevron-forward" size={18} color={c.muted} />
		</Pressable>
	);
}

function Tile({
	icon,
	title,
	body,
	onPress,
	alert,
	badge,
	wide,
}: ManageTile & { wide: boolean }) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.tile,
				wide && styles.tileWide,
				{ backgroundColor: c.card, borderColor: c.border },
				pressed && styles.pressed,
			]}
			accessibilityRole="button"
			// The body carries the news ("3 commandes à accepter"): read it too.
			accessibilityLabel={`${title}, ${body}`}
		>
			<View style={styles.tileTop}>
				<View
					style={[
						styles.tileIcon,
						{ backgroundColor: alert ? c.warningSoft : c.primarySoft },
					]}
				>
					<Ionicons
						name={icon}
						size={20}
						color={alert ? c.warningText : c.link}
					/>
				</View>
				{badge ? <CountPill badge={badge} /> : null}
			</View>
			<Text style={[styles.tileTitle, { color: c.text }]} numberOfLines={2}>
				{title}
			</Text>
			<Text
				style={[styles.tileBody, { color: alert ? c.warningText : c.muted }]}
				numberOfLines={2}
			>
				{body}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	sectionLabel: {
		fontSize: 18,
		lineHeight: 26,
		fontFamily: Fonts.displayBold,
		letterSpacing: -0.3,
		marginTop: 6,
	},
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	tile: {
		// Two per row: a basis under half that grows to fill the row.
		width: "45%",
		flexGrow: 1,
		gap: 4,
		padding: 14,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
	},
	tileWide: { width: "100%" },
	pressed: { opacity: 0.85 },
	tileTop: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	tileIcon: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	tileTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.displayBold },
	tileBody: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18 },
	badge: {
		minWidth: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 6,
	},
	rows: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 56,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	rowText: { flex: 1, gap: 2 },
	rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: Fonts.bodySemibold },
	badgeText: {
		color: "#fff",
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.displayBold,
		fontVariant: ["tabular-nums"],
	},
});
