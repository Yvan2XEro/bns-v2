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
					hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
					style={[styles.chip, { backgroundColor: c.primarySoft }]}
				>
					<Text style={[styles.chipText, { color: c.primary }]}>
						{cat.name}
					</Text>
					<Ionicons name="close" size={13} color={c.primary} />
				</Pressable>
			))}
			{value.length < max ? (
				<Pressable
					onPress={() => setOpen(true)}
					accessibilityRole="button"
					accessibilityLabel={t("shop.addCategory")}
					hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
					style={[styles.chip, styles.add, { borderColor: c.border }]}
				>
					<Ionicons name="add" size={14} color={c.muted} />
					<Text style={[styles.chipText, { color: c.muted }]}>
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
		gap: 4,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 7,
	},
	add: { borderWidth: 1, borderStyle: "dashed" },
	chipText: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
