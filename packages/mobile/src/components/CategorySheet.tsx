import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import { useSheetPresentation } from "@/src/components/layout/sheetPresentation";
import { useDiscoveryPalette } from "@/src/components/search/palette";
import { normalizeText } from "@/src/lib/categorySuggest";
import { useTranslation } from "@/src/lib/i18n";
import { getListingCategoryIcon } from "@/src/lib/listingForm";
import { resolveListingImageUrl } from "@/src/lib/resolveImageUrl";

export interface SheetColors {
	cardBg: string;
	textColor: string;
	mutedColor: string;
	primary: string;
	/** Behind the white glyph of a selected tile; defaults to `primary`. */
	fill?: string;
	/** The selected field's ring and the check mark; defaults to `primary`. */
	link?: string;
	border: string;
	isDark: boolean;
	inputBg: string;
}

interface CategoryNode {
	category: any;
	children: any[];
}

/**
 * A category's mark in a 36pt tile: its picture when the admin gave it one
 * (the same thumbnail the home grid shows), else the glyph for its listing
 * type. `category.icon` is admin free text, often an emoji, so it is never
 * drawn: emoji do not stand in for icons.
 */
function CategoryGlyph({ category, color }: { category: any; color: string }) {
	const image = category?.image;
	if (image?.url) {
		return (
			<Image
				source={{
					uri: resolveListingImageUrl(image, "thumbnail") ?? image.url,
				}}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				accessibilityIgnoresInvertColors
			/>
		);
	}
	return (
		<Ionicons
			name={getListingCategoryIcon(category) as any}
			size={18}
			color={color}
		/>
	);
}

function parentIdOf(category: any): string {
	const parent = category?.parent;
	if (typeof parent === "string") return parent;
	return typeof parent?.id === "string" ? parent.id : "";
}

/**
 * Roots in source order, each with its children. The API returns one flat list
 * — showing it as such is what let sellers pick "Vehicles" (5 questions) when
 * they meant "Cars" (23), because the two sat side by side as equals.
 */
function buildTree(categories: any[]): CategoryNode[] {
	const roots: CategoryNode[] = [];
	const byId = new Map<string, CategoryNode>();

	for (const category of categories) {
		if (!category?.id) continue;
		if (!parentIdOf(category)) {
			const node = { category, children: [] as any[] };
			byId.set(String(category.id), node);
			roots.push(node);
		}
	}

	for (const category of categories) {
		if (!category?.id) continue;
		const parentId = parentIdOf(category);
		if (!parentId) continue;
		// A child whose parent is missing or inactive would otherwise be
		// unreachable; it becomes a root of its own rather than disappearing.
		const parent = byId.get(String(parentId));
		if (parent) parent.children.push(category);
		else roots.push({ category, children: [] });
	}

	return roots;
}

/** Everything a category can be found by, folded once per category. */
function haystackFor(category: any): string {
	const parts: string[] = [category?.name, category?.searchAliases];

	if (Array.isArray(category?.attributes)) {
		for (const attribute of category.attributes) {
			parts.push(attribute?.name);
			if (Array.isArray(attribute?.options)) {
				for (const option of attribute.options) {
					parts.push(typeof option === "string" ? option : option?.value);
				}
			}
		}
	}

	return parts
		.filter((part) => typeof part === "string")
		.map((part) => normalizeText(part))
		.join(" ");
}

/** The first few children, named, to stand in for "12 subcategories". */
function childPreview(children: any[]): string {
	const names = children
		.map((child) => child?.name)
		.filter((name) => typeof name === "string" && name.length > 0);
	if (names.length === 0) return "";
	const shown = names.slice(0, 3).join(", ");
	return names.length > 3 ? `${shown}…` : shown;
}

interface CategorySheetProps {
	visible: boolean;
	categories: any[];
	value?: any;
	onSelect: (category: any) => void;
	onClose: () => void;
	colors: SheetColors;
}

/**
 * The category chooser, presented as a bottom sheet.
 *
 * Two levels, because the taxonomy has two: the roots are listed first and a
 * root opens onto its children. A root is still selectable — "Other" has no
 * children, and a seller who genuinely means "Vehicles" should be able to say
 * so — but it takes the second tap, so the more precise answer is the easier
 * one to give.
 */
export function CategorySheet({
	visible,
	categories,
	value,
	onSelect,
	onClose,
	colors,
}: CategorySheetProps) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const sheet = useSheetPresentation();
	const palette = useDiscoveryPalette();
	const { textColor, mutedColor, primary, border, inputBg } = colors;
	const fill = colors.fill ?? primary;
	const link = colors.link ?? primary;

	const [search, setSearch] = useState("");
	const [openRootId, setOpenRootId] = useState<string | null>(null);

	const tree = useMemo(() => buildTree(categories), [categories]);

	const haystacks = useMemo(() => {
		const map = new Map<string, string>();
		for (const category of categories) {
			if (category?.id) map.set(String(category.id), haystackFor(category));
		}
		return map;
	}, [categories]);

	const parentNames = useMemo(() => {
		const map = new Map<string, string>();
		for (const category of categories) {
			if (category?.id) map.set(String(category.id), category?.name ?? "");
		}
		return map;
	}, [categories]);

	// Search spans aliases, attribute names and option values, so "Xbox" or
	// "frigo" finds a category whose name contains neither.
	const results = useMemo(() => {
		const query = normalizeText(search);
		if (!query) return [];
		const words = query.split(" ").filter(Boolean);
		return categories.filter((category) => {
			const haystack = haystacks.get(String(category?.id)) ?? "";
			return words.every((word) => haystack.includes(word));
		});
	}, [search, categories, haystacks]);

	const close = useCallback(() => {
		setSearch("");
		setOpenRootId(null);
		onClose();
	}, [onClose]);

	const choose = useCallback(
		(category: any) => {
			onSelect(category);
			close();
		},
		[onSelect, close],
	);

	const sheetBg = palette.isDark ? palette.background : palette.card;
	const selectedId = value?.id ? String(value.id) : null;

	const renderRow = (
		category: any,
		options: { subtitle?: string; inset?: boolean } = {},
	) => {
		const selected = selectedId === String(category?.id);
		return (
			<Pressable
				key={String(category.id)}
				onPress={() => choose(category)}
				style={[
					styles.row,
					options.inset && styles.rowInset,
					{ borderBottomColor: border },
				]}
				accessibilityRole="button"
				accessibilityState={{ selected }}
				accessibilityLabel={category?.name}
			>
				<View
					style={[
						styles.rowIcon,
						{ backgroundColor: selected ? fill : inputBg },
					]}
				>
					<CategoryGlyph
						category={category}
						color={selected ? ON_FILL : mutedColor}
					/>
				</View>
				<View style={styles.rowText}>
					<Text
						style={[styles.rowName, { color: textColor }]}
						numberOfLines={1}
					>
						{category?.name}
					</Text>
					{options.subtitle ? (
						<Text
							style={[styles.rowSub, { color: mutedColor }]}
							numberOfLines={1}
						>
							{options.subtitle}
						</Text>
					) : null}
				</View>
				{selected ? (
					<Ionicons name="checkmark-circle" size={20} color={link} />
				) : null}
			</Pressable>
		);
	};

	const openRoot = openRootId
		? tree.find((node) => String(node.category.id) === openRootId)
		: null;

	return (
		<Modal
			visible={visible}
			transparent
			animationType={sheet.animationType}
			onRequestClose={close}
			statusBarTranslucent
			navigationBarTranslucent
		>
			<View style={[styles.backdrop, sheet.wrap]}>
				{/* Tapping outside dismisses, as a sheet is expected to. */}
				<Pressable
					style={styles.backdropFill}
					onPress={close}
					accessibilityRole="button"
					accessibilityLabel={t("common.close")}
				/>

				<KeyboardAvoidingView
					behavior="padding"
					style={styles.sheetWrap}
					pointerEvents="box-none"
				>
					<View
						style={[
							styles.sheet,
							{ backgroundColor: sheetBg, paddingBottom: insets.bottom },
							sheet.panel,
						]}
					>
						<View style={[styles.handle, { backgroundColor: border }]} />

						<View style={styles.sheetHeader}>
							{openRoot ? (
								<Pressable
									onPress={() => setOpenRootId(null)}
									style={styles.iconBtn}
									accessibilityRole="button"
									accessibilityLabel={t("common.back")}
								>
									<Ionicons name="chevron-back" size={22} color={textColor} />
								</Pressable>
							) : null}
							<Text
								style={[styles.sheetTitle, { color: textColor }]}
								accessibilityRole="header"
								numberOfLines={1}
							>
								{openRoot ? openRoot.category.name : t("create.selectCategory")}
							</Text>
							<Pressable
								onPress={close}
								style={[styles.iconBtn, { backgroundColor: inputBg }]}
								accessibilityRole="button"
								accessibilityLabel={t("common.close")}
							>
								<Ionicons name="close" size={20} color={textColor} />
							</Pressable>
						</View>

						<View
							style={[
								styles.searchWrap,
								{ backgroundColor: inputBg, borderColor: border },
							]}
						>
							<Ionicons name="search-outline" size={18} color={mutedColor} />
							<TextInput
								value={search}
								onChangeText={setSearch}
								placeholder={t("create.searchCategory")}
								placeholderTextColor={mutedColor}
								style={[styles.searchInput, { color: textColor }]}
								autoCorrect={false}
								autoCapitalize="none"
								returnKeyType="search"
								accessibilityLabel={t("create.searchCategory")}
							/>
							{search.length > 0 ? (
								<Pressable
									onPress={() => setSearch("")}
									hitSlop={14}
									accessibilityRole="button"
									accessibilityLabel={t("search.clearSearch")}
								>
									<Ionicons name="close-circle" size={18} color={mutedColor} />
								</Pressable>
							) : null}
						</View>

						<ScrollView
							style={styles.list}
							contentContainerStyle={{ paddingBottom: 12 }}
							keyboardShouldPersistTaps="handled"
							showsVerticalScrollIndicator={false}
						>
							{search.length > 0 ? (
								results.length > 0 ? (
									results.map((category) =>
										renderRow(category, {
											subtitle:
												parentNames.get(parentIdOf(category)) || undefined,
										}),
									)
								) : (
									<Text style={[styles.empty, { color: mutedColor }]}>
										{t("create.noCategoryMatch")}
									</Text>
								)
							) : openRoot ? (
								<>
									{/* The root itself stays available: some ads really are just
									    "Vehicles", and "Other" has no children at all. */}
									{renderRow(openRoot.category, {
										subtitle: t("create.categoryItself"),
									})}
									{openRoot.children.map((child) =>
										renderRow(child, { inset: true }),
									)}
								</>
							) : (
								tree.map((node) => {
									const hasChildren = node.children.length > 0;
									if (!hasChildren) return renderRow(node.category);
									return (
										<Pressable
											key={String(node.category.id)}
											onPress={() => setOpenRootId(String(node.category.id))}
											style={[styles.row, { borderBottomColor: border }]}
											accessibilityRole="button"
											accessibilityLabel={node.category?.name}
											accessibilityHint={t("create.openSubcategories")}
										>
											<View
												style={[styles.rowIcon, { backgroundColor: inputBg }]}
											>
												<CategoryGlyph
													category={node.category}
													color={mutedColor}
												/>
											</View>
											<View style={styles.rowText}>
												<Text
													style={[styles.rowName, { color: textColor }]}
													numberOfLines={1}
												>
													{node.category?.name}
												</Text>
												{/* What is inside, rather than how many things are
												    inside: "Voitures, Motos, Camions" answers the
												    question a count only postpones. */}
												<Text
													style={[styles.rowSub, { color: mutedColor }]}
													numberOfLines={1}
												>
													{childPreview(node.children)}
												</Text>
											</View>
											<Ionicons
												name="chevron-forward"
												size={18}
												color={mutedColor}
											/>
										</Pressable>
									);
								})
							)}
						</ScrollView>
					</View>
				</KeyboardAvoidingView>
			</View>
		</Modal>
	);
}

interface CategoryFieldProps {
	categories: any[];
	value?: any;
	onSelect: (category: any) => void;
	/** Clears the category and lets the title be guessed from again. */
	onClear?: () => void;
	/** Shown under the value, e.g. to say the category was guessed from the title. */
	hint?: string | null;
	colors: SheetColors;
}

/**
 * The row that shows the chosen category and opens the sheet.
 *
 * Tapping the row changes the category; the cross next to it removes one, so a
 * seller who disagrees with the guess can drop it and reword the title instead
 * of hunting for the right entry in the sheet.
 */
export function CategoryField({
	categories,
	value,
	onSelect,
	onClear,
	hint,
	colors,
}: CategoryFieldProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const { cardBg, textColor, mutedColor, primary, border, inputBg } = colors;
	const fill = colors.fill ?? primary;
	const link = colors.link ?? primary;

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				style={[
					styles.trigger,
					{ backgroundColor: cardBg, borderColor: value ? link : border },
				]}
				accessibilityRole="button"
				accessibilityLabel={value?.name ?? t("create.selectCategory")}
				accessibilityHint={t("create.openCategorySheet")}
			>
				<View
					style={[
						styles.triggerIcon,
						{ backgroundColor: value ? fill : inputBg },
					]}
				>
					{/* Empty, the field leads with a chevron: it says "this opens a
					    list" without spending a word on it. Filled, the category's own
					    icon is the more useful thing to show. */}
					{value ? (
						<CategoryGlyph category={value} color={ON_FILL} />
					) : (
						<Ionicons name="chevron-down" size={18} color={mutedColor} />
					)}
				</View>
				<View style={styles.rowText}>
					<Text
						style={[
							styles.triggerValue,
							{ color: value ? textColor : mutedColor },
						]}
						numberOfLines={1}
					>
						{value?.name ?? t("create.selectCategory")}
					</Text>
					{hint ? (
						<Text
							style={[styles.rowSub, { color: mutedColor }]}
							numberOfLines={1}
						>
							{hint}
						</Text>
					) : null}
				</View>
				{/* The row is tappable in full, so the cross is the only control that
				    earns its width — a "Modifier" next to it said nothing the row did
				    not already say. */}
				{value && onClear ? (
					<Pressable
						onPress={onClear}
						hitSlop={12}
						accessibilityRole="button"
						// Named for screen readers only: everyone else gets the cross they
						// already know from every other clearable field.
						accessibilityLabel={t("create.clearCategory")}
					>
						<Ionicons name="close-circle" size={20} color={mutedColor} />
					</Pressable>
				) : null}
			</Pressable>

			<CategorySheet
				visible={open}
				categories={categories}
				value={value}
				onSelect={onSelect}
				onClose={() => setOpen(false)}
				colors={colors}
			/>
		</>
	);
}

/** The glyph on a selected tile: white holds 4.5:1 on every `fill`. */
const ON_FILL = Colors.light.primaryForeground;

const styles = StyleSheet.create({
	backdrop: { backgroundColor: "rgba(18, 22, 58, 0.45)" },
	backdropFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
	sheetWrap: { maxHeight: "88%", width: "100%", alignItems: "center" },
	sheet: {
		// Without this the sheet lays its children out at their natural height and
		// `maxHeight` merely clips the result, so a long category list pushed the
		// search box off the top instead of scrolling under it.
		flexShrink: 1,
		width: "100%",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: 16,
		overflow: "hidden",
	},
	handle: {
		alignSelf: "center",
		width: 40,
		height: 4,
		borderRadius: 2,
		marginTop: 8,
		marginBottom: 4,
	},
	sheetHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 8,
	},
	iconBtn: {
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	sheetTitle: {
		flex: 1,
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	searchWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 14,
		minHeight: 48,
		marginBottom: 8,
	},
	searchInput: { flex: 1, fontSize: 16, padding: 0, fontFamily: Fonts.body },
	// `flexShrink` is what lets the list give way to the header and search above
	// it; React Native defaults it to 0, so the list would otherwise claim its
	// full content height and scroll nothing.
	list: { flexGrow: 0, flexShrink: 1 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		minHeight: 60,
		paddingVertical: 10,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	rowInset: { paddingLeft: 16 },
	rowIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	rowText: { flex: 1, gap: 2 },
	rowName: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.bodySemibold },
	rowSub: { fontSize: 13, lineHeight: 17, fontFamily: Fonts.body },
	empty: {
		textAlign: "center",
		paddingVertical: 32,
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.body,
	},
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderWidth: 1,
		borderRadius: 14,
		padding: 12,
		minHeight: 60,
	},
	triggerIcon: {
		width: 36,
		height: 36,
		borderRadius: 10,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	triggerValue: {
		fontSize: 15,
		lineHeight: 22,
		fontFamily: Fonts.bodySemibold,
	},
});
