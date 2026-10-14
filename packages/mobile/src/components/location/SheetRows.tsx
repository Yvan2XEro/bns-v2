import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import {
	type Place,
	type PlacePickerSection,
	placeContext,
} from "@/src/lib/places";

type SectionKey = PlacePickerSection["key"];
type IconName = ComponentProps<typeof Ionicons>["name"];

export type SheetRow =
	| { type: "nearby"; key: string }
	| { type: "all"; key: string }
	| { type: "header"; key: string; section: SectionKey }
	| { type: "place"; key: string; section: SectionKey; place: Place }
	| { type: "typed"; key: string; text: string };

const SECTION_LABEL: Record<SectionKey, string> = {
	recent: "locationSheet.recent",
	popular: "locationSheet.popular",
	results: "locationSheet.results",
};

export function SectionHeader({ section }: { section: SectionKey }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	return (
		<Text
			style={[styles.header, { color: c.muted }]}
			accessibilityRole="header"
		>
			{t(SECTION_LABEL[section])}
		</Text>
	);
}

export function ActionRow({
	icon,
	label,
	hint,
	busy,
	selected,
	tone = "primary",
	onPress,
}: {
	icon: IconName;
	label: string;
	hint?: string;
	busy?: boolean;
	selected?: boolean;
	tone?: "primary" | "neutral" | "warning";
	onPress: () => void;
}) {
	const c = useShopTheme();
	const color =
		tone === "primary"
			? c.primary
			: tone === "warning"
				? c.warningText
				: c.text;
	const soft =
		tone === "primary"
			? c.primarySoft
			: tone === "warning"
				? c.warningSoft
				: c.neutralSoft;
	return (
		<Pressable
			onPress={onPress}
			disabled={busy}
			style={({ pressed }) => [
				styles.row,
				pressed && { backgroundColor: c.neutralSoft },
			]}
			accessibilityRole="button"
			accessibilityLabel={label}
			accessibilityHint={hint}
			accessibilityState={{ busy, selected }}
		>
			<View style={[styles.icon, { backgroundColor: soft }]}>
				{busy ? (
					<ActivityIndicator size="small" color={color} />
				) : (
					<Ionicons name={icon} size={18} color={color} />
				)}
			</View>
			<View style={styles.text}>
				<Text style={[styles.title, { color }]} numberOfLines={1}>
					{label}
				</Text>
				{hint ? (
					<Text style={[styles.subtitle, { color: c.muted }]} numberOfLines={2}>
						{hint}
					</Text>
				) : null}
			</View>
			{selected ? (
				<Ionicons name="checkmark-circle" size={22} color={c.primary} />
			) : null}
		</Pressable>
	);
}

const SECTION_ICON: Record<SectionKey, IconName> = {
	recent: "time-outline",
	popular: "trending-up",
	results: "location-outline",
};

export function PlaceRow({
	place,
	section,
	selected,
	onPress,
}: {
	place: Place & { listings?: number };
	section: SectionKey;
	selected: boolean;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const title = place.district ?? place.name;
	const context =
		typeof place.listings === "number"
			? t("locationSheet.listingsCount", { count: place.listings })
			: placeContext(place);
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				pressed && { backgroundColor: c.neutralSoft },
			]}
			accessibilityRole="button"
			accessibilityLabel={context ? `${title}, ${context}` : title}
			accessibilityState={{ selected }}
		>
			<View style={[styles.icon, { backgroundColor: c.neutralSoft }]}>
				<Ionicons name={SECTION_ICON[section]} size={18} color={c.muted} />
			</View>
			<View style={styles.text}>
				<Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
					{title}
				</Text>
				{context ? (
					<Text style={[styles.subtitle, { color: c.muted }]} numberOfLines={1}>
						{context}
					</Text>
				) : null}
			</View>
			{selected ? (
				<Ionicons name="checkmark-circle" size={22} color={c.primary} />
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	header: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
		textTransform: "uppercase",
		letterSpacing: 0.6,
		paddingHorizontal: 8,
		paddingTop: 18,
		paddingBottom: 6,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 56,
		paddingHorizontal: 8,
		paddingVertical: 8,
		borderRadius: 14,
	},
	icon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	text: { flex: 1, gap: 2 },
	title: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	subtitle: { fontSize: 13, fontFamily: Fonts.body },
});
