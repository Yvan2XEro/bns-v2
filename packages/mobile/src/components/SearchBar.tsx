import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface SearchBarProps {
	value: string;
	onChangeText: (text: string) => void;
	onPress?: () => void;
	placeholder?: string;
	autoFocus?: boolean;
	onCancel?: () => void;
	editable?: boolean;
}

export function SearchBar({
	value,
	onChangeText,
	onPress,
	placeholder,
	autoFocus,
	onCancel,
	editable = true,
}: SearchBarProps) {
	const isDark = useColorScheme() === "dark";

	return (
		<View style={styles.wrapper}>
			<Pressable
				onPress={onPress}
				style={[
					styles.container,
					{
						backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
						borderColor: isDark ? "#1e3a5f" : "#e2e8f0",
					},
				]}
			>
				<Ionicons
					name="search"
					size={18}
					color={isDark ? "#94a3b8" : "#64748b"}
					style={styles.icon}
				/>
				{editable ? (
					<TextInput
						value={value}
						onChangeText={onChangeText}
						placeholder={placeholder ?? "Rechercher..."}
						placeholderTextColor="#94a3b8"
						style={[styles.input, { color: isDark ? "#e2e8f0" : "#0f172a" }]}
						autoFocus={autoFocus}
						returnKeyType="search"
					/>
				) : (
					<Text style={[styles.placeholderText, { color: "#94a3b8" }]}>
						{value || placeholder}
					</Text>
				)}
				{value.length > 0 && editable && (
					<Pressable onPress={() => onChangeText("")} hitSlop={8}>
						<Ionicons
							name="close-circle"
							size={18}
							color={isDark ? "#94a3b8" : "#64748b"}
						/>
					</Pressable>
				)}
			</Pressable>
			{onCancel && (
				<Pressable onPress={onCancel} style={styles.cancelBtn}>
					<Text
						style={{
							color: isDark ? "#3b82f6" : "#1e40af",
							fontWeight: "600",
							fontSize: 14,
						}}
					>
						Annuler
					</Text>
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 8,
	},
	container: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		paddingHorizontal: 12,
		paddingVertical: 10,
	},
	icon: { marginRight: 8 },
	input: { flex: 1, fontSize: 15 },
	placeholderText: { flex: 1, fontSize: 15 },
	cancelBtn: { marginLeft: 12 },
});
