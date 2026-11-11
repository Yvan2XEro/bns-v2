import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useTranslation } from "@/src/lib/i18n";
import { inkOf } from "./fill";

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
			hitSlop={{ left: 8, right: 8 }}
			style={styles.link}
		>
			<Text style={[styles.linkText, { color: inkOf(c) }]}>{label}</Text>
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
	return (
		<View style={styles.row}>
			<Text
				style={[
					strong ? styles.strong : styles.meta,
					{ color: strong ? c.text : c.body },
				]}
			>
				{label}
			</Text>
			<Text style={[strong ? styles.strong : styles.value, { color: c.text }]}>
				{children}
			</Text>
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
	meta: { fontSize: 14, fontFamily: Fonts.body },
	value: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		fontVariant: ["tabular-nums"],
	},
	strong: { fontSize: 16, fontFamily: Fonts.displayBold },
	link: { minHeight: 44, justifyContent: "center" },
	linkText: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
		textDecorationLine: "underline",
	},
});
