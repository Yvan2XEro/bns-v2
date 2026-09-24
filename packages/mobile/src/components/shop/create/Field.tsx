import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "../theme";

export function Field({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	const c = useShopTheme();
	return (
		<View style={{ gap: 6 }}>
			<Text style={[styles.label, { color: c.body }]}>{label}</Text>
			{children}
		</View>
	);
}

const styles = StyleSheet.create({
	label: { fontSize: 13, fontFamily: Fonts.bodySemibold },
});
