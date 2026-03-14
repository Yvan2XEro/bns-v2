import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface Category {
	id: string;
	name: string;
	emoji?: string;
	icon?: { url: string };
}

interface CategoryIconProps {
	category: Category;
	onPress: (id: string) => void;
	size?: number;
}

export function CategoryIcon({
	category,
	onPress,
	size = 56,
}: CategoryIconProps) {
	const isDark = useColorScheme() === "dark";

	return (
		<Pressable
			onPress={() => onPress(category.id)}
			style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
		>
			<View
				style={[
					styles.circle,
					{
						width: size,
						height: size,
						borderRadius: size / 2,
						backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
						borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
					},
				]}
			>
				{category.icon?.url ? (
					<Image
						source={{ uri: category.icon.url }}
						style={{ width: size * 0.55, height: size * 0.55 }}
						contentFit="contain"
					/>
				) : (
					<Text style={{ fontSize: size * 0.4 }}>{category.emoji ?? "📦"}</Text>
				)}
			</View>
			<Text
				style={[styles.label, { color: isDark ? "#e2e8f0" : "#0f172a" }]}
				numberOfLines={2}
			>
				{category.name}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: { alignItems: "center", width: 72, marginRight: 8 },
	circle: {
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		marginBottom: 6,
	},
	label: { fontSize: 11, textAlign: "center", fontWeight: "500" },
});
