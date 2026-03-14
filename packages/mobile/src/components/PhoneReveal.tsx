import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface PhoneRevealProps {
	phone: string;
}

export function PhoneReveal({ phone }: PhoneRevealProps) {
	const [revealed, setRevealed] = useState(false);
	const isDark = useColorScheme() === "dark";
	const masked = phone.slice(0, -4).replace(/\d/g, "•") + phone.slice(-4);

	if (revealed) {
		return (
			<Pressable
				onPress={() => Linking.openURL(`tel:${phone}`)}
				style={[
					styles.btn,
					{
						backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
						borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
					},
				]}
			>
				<Text style={[styles.text, { color: isDark ? "#3b82f6" : "#1e40af" }]}>
					📞 {phone}
				</Text>
			</Pressable>
		);
	}

	return (
		<Pressable
			onPress={() => setRevealed(true)}
			style={[
				styles.btn,
				{
					backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
					borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
				},
			]}
		>
			<Text style={[styles.text, { color: isDark ? "#94a3b8" : "#64748b" }]}>
				📞 {masked}
			</Text>
			<Text style={[styles.reveal, { color: isDark ? "#3b82f6" : "#1e40af" }]}>
				{" "}
				· Afficher
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	btn: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 8,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	text: { fontSize: 14, fontWeight: "500" },
	reveal: { fontSize: 14, fontWeight: "600" },
});
