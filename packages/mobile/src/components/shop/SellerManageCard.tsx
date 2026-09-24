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
			<View
				style={[
					styles.card,
					{ backgroundColor: c.card, borderColor: c.border },
				]}
			>
				{tiles.map(({ key, ...tile }, index) => (
					<Tile key={key} {...tile} last={index === tiles.length - 1} />
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
	last,
}: ManageTile & { last: boolean }) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.tile,
				!last && {
					borderBottomWidth: StyleSheet.hairlineWidth,
					borderBottomColor: c.border,
				},
			]}
			accessibilityRole="button"
			accessibilityLabel={title}
		>
			<View
				style={[
					styles.tileIcon,
					{ backgroundColor: alert ? c.warningSoft : c.primarySoft },
				]}
			>
				<Ionicons
					name={icon}
					size={18}
					color={alert ? c.warningText : c.primary}
				/>
			</View>
			<View style={{ flex: 1 }}>
				<Text style={[styles.tileTitle, { color: c.text }]}>{title}</Text>
				<Text
					style={[styles.tileBody, { color: alert ? c.warningText : c.muted }]}
				>
					{body}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={16} color={c.muted} />
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
	card: {
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 0,
	},
	tile: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
	tileIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	tileTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	tileBody: { fontSize: 12, fontFamily: Fonts.body },
});
