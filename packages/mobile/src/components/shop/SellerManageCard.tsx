import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
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

/** "Manage my shop" card: catalogue, stock and settings entry points. */
export function SellerManageCard({ tiles }: { tiles: ManageTile[] }) {
	const c = useShopTheme();
	const { t } = useTranslation();

	return (
		<>
			<Text style={[styles.sectionLabel, { color: c.muted }]}>
				{t("seller.manage")}
			</Text>
			<View style={styles.grid}>
				{tiles.map(({ key, ...tile }, index) => (
					<Tile
						key={key}
						{...tile}
						// An odd last tile takes the whole row instead of leaving a hole.
						wide={tiles.length % 2 === 1 && index === tiles.length - 1}
					/>
				))}
			</View>
		</>
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
			accessibilityLabel={badge ? `${title} (${badge})` : title}
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
						color={alert ? c.warningText : c.primary}
					/>
				</View>
				{badge ? (
					<View style={[styles.badge, { backgroundColor: c.sell }]}>
						<Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
					</View>
				) : null}
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
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
	tile: {
		// Two per row: a basis under half that grows to fill the row.
		width: "45%",
		flexGrow: 1,
		gap: 4,
		padding: 14,
		borderRadius: 18,
		borderWidth: 1,
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
	tileTitle: { fontSize: 15, fontFamily: Fonts.displayBold },
	tileBody: { fontSize: 12, fontFamily: Fonts.body, lineHeight: 16 },
	badge: {
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 5,
	},
	badgeText: { color: "#fff", fontSize: 11, fontFamily: Fonts.displayBold },
});
