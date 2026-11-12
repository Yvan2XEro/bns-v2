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
import { useDiscoveryPalette } from "@/src/components/search/palette";
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
	/** Kept for callers; the picker reads the theme's contrast-safe brand inks. */
	primaryColor?: string;
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
}: TagPickerProps) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const c = useDiscoveryPalette();
	const [visible, setVisible] = useState(false);

	const modalBg = c.background;
	const separatorColor = c.border;
	const chipBg = c.card;

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
				accessibilityRole="button"
				accessibilityLabel={
					selectedCount > 0
						? `${t("tagPicker.title")}, ${selectedTags.map((tag) => tag.name).join(", ")}`
						: t("tagPicker.placeholder")
				}
				style={[styles.trigger, { backgroundColor: inputBg, borderColor }]}
			>
				{selectedCount === 0 ? (
					<View style={styles.placeholderRow}>
						<Ionicons name="pricetag-outline" size={18} color={mutedColor} />
						<Text style={[styles.placeholder, { color: mutedColor }]}>
							{t("tagPicker.placeholder")}
						</Text>
						<Ionicons name="chevron-down" size={18} color={mutedColor} />
					</View>
				) : (
					<View style={styles.badgeWrap}>
						{selectedTags.map((tag) => (
							<View
								key={tag.id}
								style={[
									styles.badge,
									{ backgroundColor: c.primaryTint, borderColor: c.primary },
								]}
							>
								{tag.emoji ? (
									<Text style={styles.badgeEmoji}>{tag.emoji}</Text>
								) : null}
								<Text style={[styles.badgeText, { color: c.link }]}>
									{tag.name}
								</Text>
								<Pressable
									onPress={(e) => {
										e.stopPropagation?.();
										remove(tag);
									}}
									hitSlop={10}
									accessibilityRole="button"
									accessibilityLabel={`${tag.name}, ${t("common.delete")}`}
								>
									<Ionicons name="close" size={14} color={c.link} />
								</Pressable>
							</View>
						))}
						<Pressable
							onPress={() => setVisible(true)}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={t("tagPicker.title")}
							style={[
								styles.addBtn,
								{ borderColor: atMax ? separatorColor : c.primary },
							]}
						>
							<Ionicons
								name="add"
								size={16}
								color={atMax ? mutedColor : c.link}
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
						<Pressable
							onPress={() => setVisible(false)}
							accessibilityRole="button"
							accessibilityLabel={t("common.close")}
							style={[styles.closeBtn, { backgroundColor: c.well }]}
						>
							<Ionicons name="close" size={20} color={textColor} />
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
										accessibilityRole="button"
										accessibilityState={{ selected: active, disabled }}
										accessibilityLabel={tag.name}
										style={[
											styles.chip,
											{
												backgroundColor: active ? c.primaryTint : chipBg,
												borderColor: active ? c.primary : separatorColor,
												opacity: disabled ? 0.4 : 1,
											},
										]}
									>
										{tag.emoji ? (
											<Text style={styles.chipEmoji}>{tag.emoji}</Text>
										) : null}
										{active && !tag.emoji ? (
											<Ionicons name="checkmark" size={15} color={c.link} />
										) : null}
										<Text
											style={[
												styles.chipText,
												{ color: active ? c.link : textColor },
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
							accessibilityRole="button"
							style={({ pressed }) => [
								styles.doneBtn,
								{ backgroundColor: c.primaryFill },
								pressed && { opacity: 0.85 },
							]}
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
	placeholderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
	placeholder: {
		flex: 1,
		fontSize: 16,
		lineHeight: 22,
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
		paddingHorizontal: 10,
		minHeight: 30,
	},
	badgeEmoji: { fontFamily: Fonts.body, fontSize: 12, lineHeight: 16 },
	badgeText: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
	},
	addBtn: {
		width: 30,
		height: 30,
		borderRadius: 15,
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
		fontSize: 20,
		lineHeight: 28,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	modalSub: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.body,
		marginTop: 2,
	},
	closeBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
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
		borderWidth: 1,
		paddingHorizontal: 14,
		minHeight: 40,
	},
	chipEmoji: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
	chipText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
	emptyText: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.body,
		padding: 20,
	},
	footer: {
		padding: 16,
		borderTopWidth: 1,
	},
	doneBtn: {
		minHeight: 52,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	doneBtnText: {
		fontSize: 16,
		lineHeight: 22,
		fontFamily: Fonts.bodyBold,
		color: "#fff",
	},
});
