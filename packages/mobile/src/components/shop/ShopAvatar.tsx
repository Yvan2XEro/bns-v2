import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import { useShopTheme } from "./theme";

function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	return (
		(words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")
	).toUpperCase();
}

export function ShopAvatar({
	name,
	logo,
	size = 48,
	radius = 14,
}: {
	name: string;
	logo?: string | null;
	size?: number;
	radius?: number;
}) {
	const c = useShopTheme();
	const uri = resolveImageUrl(logo ?? null);
	const box = { width: size, height: size, borderRadius: radius };

	if (uri) {
		return <Image source={{ uri }} style={box} contentFit="cover" />;
	}
	return (
		<View style={[styles.fallback, box, { backgroundColor: c.primary }]}>
			<Text style={[styles.text, { fontSize: size * 0.36 }]}>
				{initials(name)}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	fallback: { alignItems: "center", justifyContent: "center" },
	text: { color: "#ffffff", fontFamily: Fonts.displayBold },
});
