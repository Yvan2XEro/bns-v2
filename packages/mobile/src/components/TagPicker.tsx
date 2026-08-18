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
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTranslation } from "@/src/lib/i18n";

const MAX_TAGS = 5;

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
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const isDark = useColorScheme() === "dark";
	const [visible, setVisible] = useState(false);

	const modalBg = isDark ? "#0b1120" : "#f8fafc";
	const separatorColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const chipBg = isDark ? "#1e293b" : "#f1f5f9";

	const useSlugMode =
		selectedSlugs !== undefined && onChangeSlugs !== undefined;

	function isSelected(tag: TagItem): boolean {
		if (useSlugMode) return (selectedSlugs ?? []).includes(tag.slug);
		return (selectedIds ?? []).includes(tag.id);
	}

	function remove(tag: TagItem) {
		if (useSlugMode) {
			onChangeSlugs?.((selectedSlugs ?? []).filter((s) => s !== tag.slug));
		} else {
			onChangeIds?.((selectedIds ?? []).filter((id) => id !== tag.id));
		}
	}

	function toggle(tag: TagItem) {
		if (isSelected(tag)) {
			remove(tag);
			return;
		}
		if (selectedCount >= MAX_TAGS) return;
		if (useSlugMode) {
			onChangeSlugs?.([...(selectedSlugs ?? []), tag.slug]);
		} else {
			onChangeIds?.([...(selectedIds ?? []), tag.id]);
		}
	}

	const selectedTags = availableTags.filter((t) => isSelected(t));
	const selectedCount = selectedTags.length;
	const atMax = selectedCount >= MAX_TAGS;

	return (
		<>
			{/* Trigger */}
			<Pressable
				onPress={() => setVisible(true)}
				style={[styles.trigger, { backgroundColor: inputBg, borderColor }]}
			>
				{selectedCount === 0 ? (
					<>
						<Ionicons name="pricetag-outline" size={16} color={mutedColor} />
						<Text style={[styles.placeholder, { color: mutedColor }]}>
							Ajouter des tags…
						</Text>
						<Ionicons name="chevron-down" size={16} color={mutedColor} />
					</>
				) : (
					<View style={styles.badgeWrap}>
						{selectedTags.map((tag) => (
							<View
								key={tag.id}
								style={[
									styles.badge,
									{
										backgroundColor: `${primaryColor}18`,
										borderColor: `${primaryColor}55`,
									},
								]}
							>
								{tag.emoji ? (
									<Text style={styles.badgeEmoji}>{tag.emoji}</Text>
								) : null}
								<Text style={[styles.badgeText, { color: primaryColor }]}>
									{tag.name}
								</Text>
								<Pressable
									onPress={(e) => {
										e.stopPropagation?.();
										remove(tag);
									}}
									hitSlop={6}
								>
									<Ionicons name="close" size={12} color={primaryColor} />
								</Pressable>
							</View>
						))}
						<Pressable
							onPress={() => setVisible(true)}
							style={[
								styles.addBtn,
								{ borderColor: atMax ? separatorColor : primaryColor },
							]}
						>
							<Ionicons
								name="add"
								size={14}
								color={atMax ? mutedColor : primaryColor}
							/>
						</Pressable>
					</View>
				)}
			</Pressable>

			{/* Modal */}
			<Modal
				visible={visible}
				animationType="slide"
				onRequestClose={() => setVisible(false)}
				statusBarTranslucent
				navigationBarTranslucent
			>
				{/* `bottom` is excluded so the chips scroll under the system bar; the
				    confirm footer gets the inset as padding instead, otherwise the
				    button sits under the Android navigation buttons. */}
				<SafeAreaView
					style={[styles.modalSafe, { backgroundColor: modalBg }]}
					edges={["top", "left", "right"]}
				>
					{/* Header */}
					<View
						style={[styles.modalHeader, { borderBottomColor: separatorColor }]}
					>
						<View>
							<Text
								style={[styles.modalTitle, { color: textColor }]}
								accessibilityRole="header"
							>
								{t("tagPicker.title")}
							</Text>
							<Text style={[styles.modalSub, { color: mutedColor }]}>
								{t("tagPicker.selectedCount", {
									count: selectedCount,
									max: MAX_TAGS,
								})}
							</Text>
						</View>
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
								{t("tagPicker.empty")}
							</Text>
						) : (
							availableTags.map((tag) => {
								const active = isSelected(tag);
								const disabled = !active && atMax;
								return (
									<Pressable
										key={tag.id}
										onPress={() => toggle(tag)}
										disabled={disabled}
										style={[
											styles.chip,
											{
												backgroundColor: active ? `${primaryColor}20` : chipBg,
												borderColor: active ? primaryColor : separatorColor,
												opacity: disabled ? 0.4 : 1,
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
					<View
						style={[
							styles.footer,
							{
								borderTopColor: separatorColor,
								paddingBottom: insets.bottom + 12,
							},
						]}
					>
						<Pressable
							onPress={() => setVisible(false)}
							style={[styles.doneBtn, { backgroundColor: primaryColor }]}
						>
							<Text style={styles.doneBtnText}>
								{selectedCount > 0
									? t("tagPicker.confirm", { count: selectedCount })
									: t("common.close")}
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
		borderRadius: 12,
		borderWidth: 1.5,
		paddingHorizontal: 12,
		paddingVertical: 10,
		minHeight: 48,
		justifyContent: "center",
	},
	placeholder: {
		flex: 1,
		fontSize: 14,
		fontFamily: Fonts.body,
	},
	badgeWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
		alignItems: "center",
	},
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		borderRadius: 20,
		borderWidth: 1,
		paddingHorizontal: 9,
		paddingVertical: 4,
	},
	badgeEmoji: { fontSize: 11 },
	badgeText: {
		fontSize: 12,
		fontFamily: Fonts.bodySemibold,
	},
	addBtn: {
		width: 26,
		height: 26,
		borderRadius: 13,
		borderWidth: 1.5,
		borderStyle: "dashed",
		alignItems: "center",
		justifyContent: "center",
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
	modalSub: {
		fontSize: 12,
		fontFamily: Fonts.body,
		marginTop: 2,
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
