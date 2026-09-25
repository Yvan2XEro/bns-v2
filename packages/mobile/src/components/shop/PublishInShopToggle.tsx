import { StyleSheet, Switch, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "./theme";

export function PublishInShopToggle({
	shopName,
	value,
	onChange,
	hint,
}: {
	shopName: string;
	value: boolean;
	onChange: (value: boolean) => void;
	/** Overrides the default hint — used on the edit form to warn that unchecking detaches the listing. */
	hint?: string;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const label = t("shop.publishIn", { shop: shopName });
	return (
		<View
			style={[styles.row, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<View style={{ flex: 1 }}>
				<Text style={[styles.title, { color: c.text }]}>{label}</Text>
				<Text style={[styles.hint, { color: c.muted }]}>
					{hint ?? t("shop.publishInHint")}
				</Text>
			</View>
			<Switch
				value={value}
				onValueChange={onChange}
				trackColor={{ true: c.primary, false: c.border }}
				accessibilityRole="switch"
				accessibilityLabel={label}
				accessibilityState={{ checked: value }}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
		marginBottom: 12,
		minHeight: 44,
	},
	title: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	hint: { fontSize: 12, fontFamily: Fonts.body },
});
