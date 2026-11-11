import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { SkeletonBox } from "@/src/components/listing/Skeletons";
import {
	type DiscoveryPalette,
	useDiscoveryPalette,
} from "@/src/components/search/palette";
import { useCategoryCounts } from "@/src/hooks/useCategoryCounts";
import {
	CATEGORIES_QUERY_KEY,
	CATEGORIES_STALE_TIME_MS,
} from "@/src/hooks/useListings";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import {
	type CategoryRubric,
	categoryTree,
	type TreeCategory,
} from "@/src/lib/categoryTree";
import { useTranslation } from "@/src/lib/i18n";
import { useUserLocation } from "@/src/lib/useUserLocation";
import {
	countOf,
	rankByCounts,
} from "../../../../api/src/contracts/categoryCounts";

/** Third-level chips shown under a sub-category before "See all N". */
const GROUP_CHIPS = 8;
const RAIL_WIDTH = 96;

/** The one search of the app, filtered on the category itself. */
function openCategory(id: string) {
	router.push({ pathname: "/(tabs)/search", params: { category: id } });
}

function Thumb({
	category,
	size,
	radius,
	c,
	quiet,
	ring,
}: {
	category: TreeCategory;
	size: number;
	radius: number;
	c: DiscoveryPalette;
	/** Nothing listed in the browsing city: the picture steps back. */
	quiet?: boolean;
	/** The selected rubric: an indigo ring, not a coloured stripe. */
	ring?: boolean;
}) {
	return (
		<View
			style={[
				styles.thumb,
				{
					width: size,
					height: size,
					borderRadius: radius,
					backgroundColor: c.well,
					borderColor: ring ? c.primary : "transparent",
				},
				quiet && styles.quiet,
			]}
		>
			{category.imageUrl ? (
				<Image
					source={{ uri: category.imageUrl }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					transition={150}
				/>
			) : (
				<Ionicons name="cube-outline" size={20} color={c.mutedForeground} />
			)}
		</View>
	);
}

/** The rail and the pane while the categories load. */
function CategoriesSkeleton({ c }: { c: DiscoveryPalette }) {
	return (
		<View
			style={styles.body}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		>
			<View style={[styles.rail, { backgroundColor: c.well }]}>
				{Array.from({ length: 7 }, (_, i) => (
					<View key={i} style={styles.railItem}>
						<SkeletonBox width={44} height={44} radius={14} />
						<SkeletonBox width={56} height={10} radius={4} />
					</View>
				))}
			</View>
			<View style={[styles.pane, styles.paneContent]}>
				<SkeletonBox width="100%" height={48} radius={12} />
				<SkeletonBox width="100%" height={132} radius={14} />
				<SkeletonBox width="100%" height={132} radius={14} />
			</View>
		</View>
	);
}

/**
 * Every category, three levels: the rubrics in a rail on the left, the
 * active one's sub-categories on the right — those with their own as a
 * heading and chips, the others as photo tiles. Opened from the home's
 * "See all" or a rubric there (`?rubric=<id>` selects it).
 */
export function CategoriesScreen() {
	const c = useDiscoveryPalette();
	const { t } = useTranslation();
	const { isTablet } = useResponsive();
	const params = useLocalSearchParams<{ rubric?: string }>();
	const pane = useRef<ScrollView>(null);

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: CATEGORIES_QUERY_KEY,
		queryFn: () => api.get<{ categories: unknown[] }>("/api/public/categories"),
		staleTime: CATEGORIES_STALE_TIME_MS,
	});
	// The browsing city's best stocked first, at every level; nothing hidden.
	const { browsePlace } = useUserLocation();
	const counts = useCategoryCounts(browsePlace?.name ?? null);
	const rubrics = useMemo(
		() =>
			rankByCounts(categoryTree((data?.categories ?? []) as never[]), counts),
		[data, counts],
	);
	const count = (id: string) => countOf(id, counts);
	/** "Plomberie · 12" when the city's counts apply. */
	const withCount = (category: TreeCategory) => {
		const n = count(category.id);
		return n === null ? category.name : `${category.name} · ${n}`;
	};
	const isQuiet = (id: string) => count(id) === 0;
	const [selected, setSelected] = useState<string | undefined>(params.rubric);
	const current: CategoryRubric | undefined =
		rubrics.find((r) => r.id === selected) ?? rubrics[0];

	const select = (id: string) => {
		setSelected(id);
		pane.current?.scrollTo({ y: 0, animated: false });
	};

	const ranked = rankByCounts(current?.children ?? [], counts);
	const groups = ranked.filter((g) => g.children.length > 0);
	const leaves = ranked.filter((g) => g.children.length === 0);
	const tileColumns = isTablet ? 4 : 2;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<View style={[styles.header, { borderBottomColor: c.border }]}>
				<HeaderBackButton color={c.foreground} fallback="/(tabs)/home" inline />
				<Text
					style={[styles.title, { color: c.foreground }]}
					accessibilityRole="header"
					numberOfLines={1}
				>
					{t("categories.title")}
				</Text>
				<View style={styles.headerSpacer} />
			</View>

			{rubrics.length === 0 && isLoading ? (
				<CategoriesSkeleton c={c} />
			) : rubrics.length === 0 && isError ? (
				<EmptyState
					icon="cloud-offline-outline"
					title={t("home.errorTitle")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => refetch()}
				/>
			) : (
				<View style={styles.body}>
					<ScrollView
						style={[styles.rail, { backgroundColor: c.well }]}
						contentContainerStyle={styles.railContent}
						showsVerticalScrollIndicator={false}
						accessibilityRole="tablist"
					>
						{rubrics.map((rubric) => {
							const active = rubric.id === current?.id;
							return (
								<Pressable
									key={rubric.id}
									onPress={() => select(rubric.id)}
									accessibilityRole="tab"
									accessibilityState={{ selected: active }}
									accessibilityLabel={rubric.name}
									style={({ pressed }) => [
										styles.railItem,
										active && { backgroundColor: c.background },
										pressed && !active && { backgroundColor: c.border },
									]}
								>
									<Thumb
										category={rubric}
										size={44}
										radius={14}
										c={c}
										ring={active}
									/>
									<Text
										numberOfLines={2}
										style={[
											styles.railLabel,
											{ color: active ? c.link : c.body },
											active && styles.railLabelActive,
										]}
										android_hyphenationFrequency="normal"
										textBreakStrategy="balanced"
									>
										{rubric.name}
									</Text>
								</Pressable>
							);
						})}
					</ScrollView>

					<ScrollView
						ref={pane}
						style={styles.pane}
						contentContainerStyle={styles.paneContent}
					>
						{current && (
							<>
								<Text
									style={[styles.paneTitle, { color: c.foreground }]}
									accessibilityRole="header"
									numberOfLines={2}
								>
									{current.name}
								</Text>
								<Pressable
									onPress={() => openCategory(current.id)}
									accessibilityRole="button"
									style={({ pressed }) => [
										styles.allRow,
										{ backgroundColor: c.primaryTint },
										pressed && styles.pressed,
									]}
								>
									<Text
										style={[styles.allLabel, { color: c.link }]}
										numberOfLines={1}
									>
										{t("categories.allOf", { name: current.name })}
									</Text>
									<Ionicons name="arrow-forward" size={18} color={c.link} />
								</Pressable>

								{groups.map((group) => (
									<View
										key={group.id}
										style={[
											styles.group,
											{ backgroundColor: c.card, borderColor: c.border },
										]}
									>
										<Pressable
											onPress={() => openCategory(group.id)}
											accessibilityRole="button"
											accessibilityLabel={withCount(group)}
											style={({ pressed }) => [
												styles.groupHead,
												pressed && styles.pressed,
											]}
										>
											<Thumb
												category={group}
												size={40}
												radius={12}
												c={c}
												quiet={isQuiet(group.id)}
											/>
											<Text
												style={[
													styles.groupName,
													{
														color: isQuiet(group.id)
															? c.mutedForeground
															: c.foreground,
													},
												]}
												numberOfLines={2}
											>
												{withCount(group)}
											</Text>
											<Ionicons
												name="chevron-forward"
												size={18}
												color={c.mutedForeground}
											/>
										</Pressable>
										<View style={styles.chips}>
											{rankByCounts(group.children, counts)
												.slice(0, GROUP_CHIPS)
												.map((child) => (
													<Pressable
														key={child.id}
														onPress={() => openCategory(child.id)}
														accessibilityRole="button"
														hitSlop={{ top: 2, bottom: 2 }}
														style={({ pressed }) => [
															styles.chip,
															{ backgroundColor: c.well },
															pressed && styles.pressed,
														]}
													>
														<Text
															style={[
																styles.chipLabel,
																{
																	color: isQuiet(child.id)
																		? c.mutedForeground
																		: c.foreground,
																},
															]}
															numberOfLines={1}
														>
															{withCount(child)}
														</Text>
													</Pressable>
												))}
											{group.children.length > GROUP_CHIPS && (
												<Pressable
													onPress={() => openCategory(group.id)}
													accessibilityRole="button"
													hitSlop={{ top: 2, bottom: 2 }}
													style={({ pressed }) => [
														styles.chip,
														{ backgroundColor: c.primaryTint },
														pressed && styles.pressed,
													]}
												>
													<Text style={[styles.chipLabel, { color: c.link }]}>
														{t("categories.seeAllCount", {
															count: group.children.length,
														})}
													</Text>
												</Pressable>
											)}
										</View>
									</View>
								))}

								{leaves.length > 0 && (
									<View style={styles.tiles}>
										{leaves.map((leaf) => (
											<Pressable
												key={leaf.id}
												onPress={() => openCategory(leaf.id)}
												accessibilityRole="button"
												accessibilityLabel={withCount(leaf)}
												style={({ pressed }) => [
													styles.tile,
													{
														width: `${100 / tileColumns - 2}%`,
														backgroundColor: c.card,
														borderColor: c.border,
													},
													pressed && styles.pressed,
												]}
											>
												<View
													style={[
														styles.tileImage,
														{ backgroundColor: c.well },
														isQuiet(leaf.id) && styles.quiet,
													]}
												>
													{leaf.imageUrl ? (
														<Image
															source={{ uri: leaf.imageUrl }}
															style={StyleSheet.absoluteFill}
															contentFit="cover"
															transition={150}
														/>
													) : (
														<Ionicons
															name="cube-outline"
															size={26}
															color={c.mutedForeground}
														/>
													)}
												</View>
												<Text
													style={[
														styles.tileLabel,
														{
															color: isQuiet(leaf.id)
																? c.mutedForeground
																: c.foreground,
														},
													]}
													numberOfLines={2}
												>
													{withCount(leaf)}
												</Text>
											</Pressable>
										))}
									</View>
								)}
							</>
						)}
					</ScrollView>
				</View>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		paddingHorizontal: 12,
		minHeight: 56,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	headerSpacer: { width: 44 },
	title: {
		flex: 1,
		textAlign: "center",
		fontSize: 18,
		lineHeight: 23,
		letterSpacing: -0.2,
		fontFamily: Fonts.displayBold,
	},
	body: { flex: 1, flexDirection: "row" },
	rail: { width: RAIL_WIDTH, flexGrow: 0 },
	railContent: { paddingVertical: 4, paddingBottom: 24 },
	railItem: {
		alignItems: "center",
		minHeight: 88,
		justifyContent: "center",
		paddingVertical: 10,
		paddingHorizontal: 6,
		gap: 6,
	},
	railLabel: {
		fontSize: 12,
		lineHeight: 15,
		textAlign: "center",
		fontFamily: Fonts.bodySemibold,
	},
	railLabelActive: { fontFamily: Fonts.bodyBold },
	thumb: {
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
	},
	quiet: { opacity: 0.5 },
	pane: { flex: 1 },
	paneContent: { padding: 12, gap: 12, paddingBottom: 40 },
	paneTitle: {
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
		paddingHorizontal: 2,
		paddingTop: 4,
	},
	allRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		minHeight: 48,
		borderRadius: 12,
		paddingHorizontal: 14,
	},
	allLabel: { flexShrink: 1, fontSize: 15, fontFamily: Fonts.bodyBold },
	group: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		padding: 12,
		gap: 12,
	},
	groupHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 44,
	},
	groupName: { flex: 1, fontSize: 15, fontFamily: Fonts.bodyBold },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
	chip: {
		minHeight: 40,
		justifyContent: "center",
		borderRadius: 20,
		paddingHorizontal: 12,
		maxWidth: "100%",
	},
	chipLabel: { fontSize: 13, fontFamily: Fonts.bodySemibold },
	tiles: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		rowGap: 12,
	},
	tile: {
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 14,
		overflow: "hidden",
	},
	tileImage: {
		aspectRatio: 4 / 3,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	tileLabel: {
		fontSize: 13,
		lineHeight: 17,
		fontFamily: Fonts.bodySemibold,
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	pressed: { opacity: 0.8 },
});
