import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { CategorySheet } from "@/src/components/CategorySheet";
import { useTranslation } from "@/src/lib/i18n";
import type { Category } from "@/src/types/api";
import { useShopTheme } from "./theme";

export interface ChipCategory {
	id: string;
	name: string;
}

export function CategoryChips({
	categories,
	value,
	onChange,
	max = 5,
}: {
	categories: Category[];
	value: ChipCategory[];
	onChange: (next: ChipCategory[]) => void;
	max?: number;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<View style={styles.wrap}>
			{value.map((cat) => (
				<Pressable
					key={cat.id}
					onPress={() => onChange(value.filter((v) => v.id !== cat.id))}
					accessibilityRole="button"
					accessibilityLabel={t("shop.removeCategoryLabel", { name: cat.name })}
					hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
					style={({ pressed }) => [
						styles.chip,
						{ backgroundColor: c.primarySoft },
						pressed && styles.pressed,
					]}
				>
					<Text style={[styles.chipText, { color: c.link }]} numberOfLines={1}>
						{cat.name}
					</Text>
					<Ionicons name="close-circle" size={16} color={c.link} />
				</Pressable>
			))}
			{value.length < max ? (
				<Pressable
					onPress={() => setOpen(true)}
					accessibilityRole="button"
					accessibilityLabel={t("shop.addCategory")}
					hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
					style={({ pressed }) => [
						styles.chip,
						styles.add,
						{ borderColor: c.link },
						pressed && styles.pressed,
					]}
				>
					<Ionicons name="add" size={16} color={c.link} />
					<Text style={[styles.chipText, { color: c.link }]}>
						{t("shop.addCategory")}
					</Text>
				</Pressable>
			) : null}
			<CategorySheet
				visible={open}
				categories={categories}
				onClose={() => setOpen(false)}
				onSelect={(cat: Category) => {
					setOpen(false);
					if (!value.some((v) => v.id === cat.id)) {
						onChange([
							...value,
							{ id: String(cat.id), name: String(cat.name) },
						]);
					}
				}}
				colors={{
					cardBg: c.card,
					textColor: c.text,
					mutedColor: c.muted,
					primary: c.primary,
					fill: c.fill,
					link: c.link,
					border: c.border,
					isDark: c.isDark,
					inputBg: c.input,
				}}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		paddingLeft: 14,
		paddingRight: 10,
		minHeight: 40,
		maxWidth: "100%",
	},
	add: {
		borderWidth: 1,
		borderStyle: "dashed",
		paddingLeft: 10,
		paddingRight: 14,
	},
	pressed: { opacity: 0.7 },
	chipText: { fontSize: 14, fontFamily: Fonts.bodySemibold, flexShrink: 1 },
});
