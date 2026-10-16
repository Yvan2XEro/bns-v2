import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
	type SharedValue,
	useAnimatedStyle,
} from "react-native-reanimated";
import { Fonts } from "@/constants/theme";
import { useTranslation } from "@/src/lib/i18n";
import type { PublicShop } from "@/src/types/api";
import { useShopBrand } from "./brand";
import { ShopAvatar } from "./ShopAvatar";
import { useShopTheme } from "./theme";

export const TOP_BAR_ROW = 52;

/**
 * Round buttons over the banner at rest; a compact bar with the shop's logo
 * and name once the name has scrolled under it (`progress` 0 → 1); the
 * in-shop search field while searching.
 */
export function ShopTopBar({
	shop,
	insetTop,
	progress,
	collapsed,
	searchOpen,
	query,
	onQueryChange,
	onOpenSearch,
	onCloseSearch,
	onBack,
	onShare,
}: {
	shop: PublicShop;
	insetTop: number;
	progress: SharedValue<number>;
	/** The JS mirror of `progress === 1`, for touch targets. */
	collapsed: boolean;
	searchOpen: boolean;
	query: string;
	onQueryChange: (q: string) => void;
	onOpenSearch: () => void;
	onCloseSearch: () => void;
	onBack: () => void;
	onShare: () => void;
}) {
	const c = useShopTheme();
	const brand = useShopBrand();
	const { t } = useTranslation();
	const input = useRef<TextInput>(null);
	const solid = collapsed || searchOpen;

	useEffect(() => {
		if (searchOpen) input.current?.focus();
	}, [searchOpen]);

	const barStyle = useAnimatedStyle(() => ({
		opacity: searchOpen ? 1 : progress.value,
	}));
	const roundStyle = useAnimatedStyle(() => ({
		opacity: searchOpen ? 0 : 1 - progress.value,
	}));

	return (
		<View
			style={[styles.root, { height: insetTop + TOP_BAR_ROW }]}
			pointerEvents="box-none"
		>
			<Animated.View
				style={[
					StyleSheet.absoluteFill,
					styles.bar,
					{
						backgroundColor: c.card,
						borderBottomColor: c.border,
						paddingTop: insetTop,
					},
					barStyle,
				]}
				pointerEvents={solid ? "auto" : "none"}
				accessibilityElementsHidden={!solid}
				importantForAccessibility={solid ? "auto" : "no-hide-descendants"}
			>
				<IconButton
					icon="arrow-back"
					color={c.text}
					label={t("common.back")}
					onPress={searchOpen ? onCloseSearch : onBack}
				/>
				{searchOpen ? (
					<View style={[styles.field, { borderColor: brand.accentText }]}>
						<Ionicons name="search" size={16} color={c.muted} />
						<TextInput
							ref={input}
							value={query}
							onChangeText={onQueryChange}
							placeholder={t("shop.searchInShop")}
							placeholderTextColor={c.muted}
							accessibilityLabel={t("shop.searchInShop")}
							returnKeyType="search"
							autoCorrect={false}
							style={[styles.input, { color: c.text }]}
						/>
						{query ? (
							<Pressable
								onPress={() => onQueryChange("")}
								hitSlop={10}
								accessibilityRole="button"
								accessibilityLabel={t("shop.searchClear")}
							>
								<Ionicons name="close-circle" size={18} color={c.muted} />
							</Pressable>
						) : null}
					</View>
				) : (
					<>
						<View style={styles.identity}>
							<ShopAvatar
								name={shop.name}
								logo={shop.logo?.url}
								size={28}
								radius={8}
							/>
							<Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
								{shop.name}
							</Text>
						</View>
						<IconButton
							icon="search"
							color={c.text}
							label={t("shop.searchInShop")}
							onPress={onOpenSearch}
						/>
						<IconButton
							icon="share-outline"
							color={c.text}
							label={t("shop.shareLabel", { name: shop.name })}
							onPress={onShare}
						/>
					</>
				)}
			</Animated.View>

			<Animated.View
				style={[styles.round, { top: insetTop + 8 }, roundStyle]}
				pointerEvents={solid ? "none" : "box-none"}
				accessibilityElementsHidden={solid}
				importantForAccessibility={solid ? "no-hide-descendants" : "auto"}
			>
				<RoundButton
					icon="arrow-back"
					label={t("common.back")}
					onPress={onBack}
				/>
				<View style={styles.roundRight}>
					<RoundButton
						icon="search"
						label={t("shop.searchInShop")}
						onPress={onOpenSearch}
					/>
					<RoundButton
						icon="share-outline"
						label={t("shop.shareLabel", { name: shop.name })}
						onPress={onShare}
					/>
				</View>
			</Animated.View>
		</View>
	);
}

function IconButton({
	icon,
	color,
	label,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	color: string;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			hitSlop={6}
			style={styles.icon}
			accessibilityRole="button"
			accessibilityLabel={label}
		>
			<Ionicons name={icon} size={22} color={color} />
		</Pressable>
	);
}

/** White on a dark disc, readable over any banner photo. */
function RoundButton({
	icon,
	label,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			hitSlop={8}
			style={styles.roundBtn}
			accessibilityRole="button"
			accessibilityLabel={label}
		>
			<Ionicons name={icon} size={20} color="#fff" />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	root: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 },
	bar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 6,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	icon: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	identity: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minWidth: 0,
	},
	name: { flexShrink: 1, fontSize: 16, fontFamily: Fonts.displayBold },
	field: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		height: 38,
		borderWidth: 1.5,
		borderRadius: 999,
		paddingHorizontal: 12,
		marginRight: 10,
	},
	input: { flex: 1, fontSize: 15, fontFamily: Fonts.body, paddingVertical: 0 },
	round: {
		position: "absolute",
		left: 14,
		right: 14,
		flexDirection: "row",
		justifyContent: "space-between",
	},
	roundRight: { flexDirection: "row", gap: 10 },
	roundBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.45)",
	},
});
