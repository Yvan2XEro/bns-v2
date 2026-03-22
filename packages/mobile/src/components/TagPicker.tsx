import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface TagItem {
	id: string;
	name: string;
	slug: string;
	emoji?: string;
}

interface TagPickerProps {
	/** For create/edit: array of tag IDs */
	selectedIds?: string[];
	onChangeIds?: (ids: string[]) => void;
	/** For filters: array of tag slugs */
	selectedSlugs?: string[];
	onChangeSlugs?: (slugs: string[]) => void;
	availableTags: TagItem[];
	inputBg: string;
	borderColor: string;
	textColor: string;
	mutedColor: string;
	primaryColor: string;
}

export function TagPicker({
	selectedIds,
	onChangeIds,
	selectedSlugs,
	onChangeSlugs,
	availableTags,
	inputBg,
	borderColor,
	textColor,
	mutedColor,
	primaryColor,
}: TagPickerProps) {
	const isDark = useColorScheme() === "dark";
	const [visible, setVisible] = useState(false);

	const modalBg = isDark ? "#0b1120" : "#f8fafc";
	const separatorColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const chipBg = isDark ? "#1e293b" : "#f1f5f9";

	// Determine mode: id-based or slug-based
	const useSlugMode =
		selectedSlugs !== undefined && onChangeSlugs !== undefined;

	function isSelected(tag: TagItem): boolean {
		if (useSlugMode) return (selectedSlugs ?? []).includes(tag.slug);
		return (selectedIds ?? []).includes(tag.id);
	}

	function toggle(tag: TagItem) {
		if (useSlugMode) {
			const prev = selectedSlugs ?? [];
			onChangeSlugs?.(
				prev.includes(tag.slug)
					? prev.filter((s) => s !== tag.slug)
					: [...prev, tag.slug],
			);
		} else {
			const prev = selectedIds ?? [];
			onChangeIds?.(
				prev.includes(tag.id)
					? prev.filter((id) => id !== tag.id)
					: [...prev, tag.id],
			);
		}
	}

	const selectedTags = availableTags.filter((t) => isSelected(t));
	const selectedCount = selectedTags.length;

	let triggerLabel = "Ajouter des tags";
	if (selectedCount === 1) triggerLabel = selectedTags[0].name;
	else if (selectedCount > 1)
		triggerLabel = `${selectedCount} tags sélectionnés`;

	return (
		<>
			<Pressable
				onPress={() => setVisible(true)}
				style={[styles.trigger, { backgroundColor: inputBg, borderColor }]}
			>
				<Ionicons name="pricetag-outline" size={16} color={mutedColor} />
				{selectedCount > 0 ? (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						style={styles.badgeScroll}
						contentContainerStyle={styles.badgeContainer}
					>
						{selectedTags.map((tag) => (
							<View
								key={tag.id}
								style={[
									styles.badge,
									{
										backgroundColor: `${primaryColor}20`,
										borderColor: `${primaryColor}50`,
									},
								]}
							>
								{tag.emoji ? (
									<Text style={styles.badgeEmoji}>{tag.emoji}</Text>
								) : null}
								<Text style={[styles.badgeText, { color: primaryColor }]}>
									{tag.name}
								</Text>
							</View>
						))}
					</ScrollView>
				) : (
					<Text style={[styles.triggerText, { color: mutedColor }]}>
						{triggerLabel}
					</Text>
				)}
				<Ionicons name="chevron-down" size={16} color={mutedColor} />
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
							Choisir des tags
						</Text>
						<Pressable onPress={() => setVisible(false)} hitSlop={8}>
							<Ionicons name="close" size={24} color={textColor} />
						</Pressable>
					</View>

					{/* Chips grid */}
					<ScrollView
						contentContainerStyle={styles.chipsContainer}
						keyboardShouldPersistTaps="handled"
					>
						{availableTags.length === 0 ? (
							<Text style={[styles.emptyText, { color: mutedColor }]}>
								Aucun tag disponible
							</Text>
						) : (
							availableTags.map((tag) => {
								const active = isSelected(tag);
								return (
									<Pressable
										key={tag.id}
										onPress={() => toggle(tag)}
										style={[
											styles.chip,
											{
												backgroundColor: active ? `${primaryColor}20` : chipBg,
												borderColor: active ? primaryColor : separatorColor,
											},
										]}
									>
										{tag.emoji ? (
											<Text style={styles.chipEmoji}>{tag.emoji}</Text>
										) : null}
										{active && !tag.emoji ? (
											<Ionicons
												name="checkmark"
												size={13}
												color={primaryColor}
											/>
										) : null}
										<Text
											style={[
												styles.chipText,
												{ color: active ? primaryColor : textColor },
											]}
										>
											{tag.name}
										</Text>
									</Pressable>
								);
							})
						)}
					</ScrollView>

					{/* Confirm */}
					<View style={[styles.footer, { borderTopColor: separatorColor }]}>
						<Pressable
							onPress={() => setVisible(false)}
							style={[styles.doneBtn, { backgroundColor: primaryColor }]}
						>
							<Text style={styles.doneBtnText}>
								{selectedCount > 0 ? `Confirmer (${selectedCount})` : "Fermer"}
							</Text>
						</Pressable>
					</View>
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
		paddingVertical: 10,
		minHeight: 48,
	},
	triggerText: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	badgeScroll: { flex: 1 },
	badgeContainer: { flexDirection: "row", gap: 6, alignItems: "center" },
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	badgeEmoji: { fontSize: 11 },
	badgeText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
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
	chipsContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 10,
		padding: 20,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: 20,
		borderWidth: 1.5,
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	chipEmoji: { fontSize: 13 },
	chipText: {
		fontSize: 14,
		fontFamily: Fonts.bodySemibold,
	},
	emptyText: {
		fontSize: 14,
		fontFamily: Fonts.body,
		padding: 20,
	},
	footer: {
		padding: 16,
		borderTopWidth: 1,
	},
	doneBtn: {
		borderRadius: 12,
		paddingVertical: 14,
		alignItems: "center",
	},
	doneBtnText: {
		fontSize: 15,
		fontFamily: Fonts.displayBold,
		color: "#fff",
	},
});
