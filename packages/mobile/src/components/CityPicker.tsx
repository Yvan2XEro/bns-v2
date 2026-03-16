import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
	FlatList,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { CAMEROON_CITIES, type CameroonCity } from "@/src/lib/cameroon-cities";

interface CityPickerProps {
	value: string;
	onSelect: (city: CameroonCity) => void;
	onClear?: () => void;
	placeholder?: string;
	inputBg: string;
	borderColor: string;
	textColor: string;
	mutedColor: string;
	primaryColor: string;
}

export function CityPicker({
	value,
	onSelect,
	onClear,
	placeholder = "Choisir une ville",
	inputBg,
	borderColor,
	textColor,
	mutedColor,
	primaryColor,
}: CityPickerProps) {
	const isDark = useColorScheme() === "dark";
	const [visible, setVisible] = useState(false);
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		if (!search.trim()) return CAMEROON_CITIES;
		const q = search.toLowerCase();
		return CAMEROON_CITIES.filter(
			(c) =>
				c.name.toLowerCase().includes(q) || c.region.toLowerCase().includes(q),
		);
	}, [search]);

	const handleSelect = (city: CameroonCity) => {
		onSelect(city);
		setSearch("");
		setVisible(false);
	};

	const modalBg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const separatorColor = isDark ? "#1e3a5f" : "#e2e8f0";

	return (
		<>
			<Pressable
				onPress={() => setVisible(true)}
				style={[styles.trigger, { backgroundColor: inputBg, borderColor }]}
			>
				<Ionicons name="location-outline" size={16} color={mutedColor} />
				<Text
					style={[
						styles.triggerText,
						{ color: value ? textColor : mutedColor },
					]}
					numberOfLines={1}
				>
					{value || placeholder}
				</Text>
				{value && onClear ? (
					<Pressable
						onPress={onClear}
						hitSlop={8}
						onStartShouldSetResponder={() => true}
					>
						<Ionicons name="close-circle" size={16} color={mutedColor} />
					</Pressable>
				) : (
					<Ionicons name="chevron-down" size={16} color={mutedColor} />
				)}
			</Pressable>

			<Modal
				visible={visible}
				animationType="slide"
				onRequestClose={() => setVisible(false)}
			>
				<SafeAreaView
					style={[styles.modalSafe, { backgroundColor: modalBg }]}
					edges={["top"]}
				>
					{/* Header */}
					<View
						style={[styles.modalHeader, { borderBottomColor: separatorColor }]}
					>
						<Text style={[styles.modalTitle, { color: textColor }]}>
							Choisir une ville
						</Text>
						<Pressable onPress={() => setVisible(false)} hitSlop={8}>
							<Ionicons name="close" size={24} color={textColor} />
						</Pressable>
					</View>

					{/* Search */}
					<View
						style={[
							styles.searchBar,
							{
								backgroundColor: cardBg,
								borderColor: separatorColor,
							},
						]}
					>
						<Ionicons name="search-outline" size={16} color={mutedColor} />
						<TextInput
							value={search}
							onChangeText={setSearch}
							placeholder="Rechercher une ville ou région..."
							placeholderTextColor={mutedColor}
							style={[styles.searchInput, { color: textColor }]}
							autoFocus
							autoCorrect={false}
							autoCapitalize="none"
						/>
						{search.length > 0 && (
							<Pressable onPress={() => setSearch("")} hitSlop={8}>
								<Ionicons name="close-circle" size={16} color={mutedColor} />
							</Pressable>
						)}
					</View>

					{/* List */}
					<FlatList
						data={filtered}
						keyExtractor={(item) => item.name}
						renderItem={({ item }) => (
							<Pressable
								onPress={() => handleSelect(item)}
								style={[styles.cityRow, { borderBottomColor: separatorColor }]}
							>
								<View style={styles.cityInfo}>
									<Text style={[styles.cityName, { color: textColor }]}>
										{item.name}
									</Text>
									<Text style={[styles.cityRegion, { color: mutedColor }]}>
										{item.region}
									</Text>
								</View>
								{value === item.name && (
									<Ionicons
										name="checkmark-circle"
										size={20}
										color={primaryColor}
									/>
								)}
							</Pressable>
						)}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ paddingBottom: 40 }}
						ListEmptyComponent={
							<View style={styles.emptyState}>
								<Text style={[styles.emptyText, { color: mutedColor }]}>
									Aucune ville trouvée
								</Text>
							</View>
						}
					/>
				</SafeAreaView>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 13,
	},
	triggerText: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	modalSafe: { flex: 1 },
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 16,
		borderBottomWidth: 1,
	},
	modalTitle: {
		fontSize: 18,
		fontFamily: Fonts.displayBold,
	},
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginHorizontal: 16,
		marginVertical: 12,
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 12,
		borderWidth: 1,
	},
	searchInput: {
		flex: 1,
		fontSize: 15,
		fontFamily: Fonts.body,
		paddingVertical: 0,
	},
	cityRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	cityInfo: { flex: 1 },
	cityName: {
		fontSize: 15,
		fontFamily: Fonts.bodySemibold,
	},
	cityRegion: {
		fontSize: 12,
		fontFamily: Fonts.body,
		marginTop: 2,
	},
	emptyState: {
		padding: 40,
		alignItems: "center",
	},
	emptyText: {
		fontSize: 14,
		fontFamily: Fonts.body,
	},
});
