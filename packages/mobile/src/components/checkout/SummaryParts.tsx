import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";

/** A value a re-quote moved, marked so the buyer sees what they re-accept. */
export function Changed({ on, children }: { on: boolean; children: string }) {
	const c = useShopTheme();
	const { t } = useTranslation();
	if (!on) return <>{children}</>;
	return (
		<Text
			style={{
				color: c.warningText,
				backgroundColor: c.warningSoft,
				fontFamily: Fonts.bodySemibold,
			}}
		>
			{children} ({t("checkout.changed")})
		</Text>
	);
}

export function LinkButton({
	label,
	onPress,
}: {
	label: string;
	onPress: () => void;
}) {
	const c = useShopTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={styles.link}
		>
			<Text style={[styles.linkText, { color: c.primary }]}>{label}</Text>
		</Pressable>
	);
}

export function Row({
	label,
	children,
	strong,
}: {
	label: string;
	children: ReactNode;
	strong?: boolean;
}) {
	const c = useShopTheme();
	const style = [
		strong ? styles.strong : styles.meta,
		{ color: strong ? c.text : c.body },
	];
	return (
		<View style={styles.row}>
			<Text style={style}>{label}</Text>
			<Text style={style}>{children}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	meta: { fontSize: 13, fontFamily: Fonts.body },
	strong: { fontSize: 16, fontFamily: Fonts.displayBold },
	link: { minHeight: 44, justifyContent: "center" },
	linkText: {
		fontSize: 13,
		fontFamily: Fonts.bodySemibold,
		textDecorationLine: "underline",
	},
});
