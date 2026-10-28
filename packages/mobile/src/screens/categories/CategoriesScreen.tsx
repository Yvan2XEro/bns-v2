import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
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

/** Third-level chips shown under a sub-category before "See all N". */
const GROUP_CHIPS = 8;

/** The one search of the app, filtered on the category itself. */
function openCategory(id: string) {
	router.push({ pathname: "/(tabs)/search", params: { category: id } });
}

function Thumb({
	category,
	size,
	radius,
	tint,
	iconColor,
}: {
	category: TreeCategory;
	size: number | `${number}%`;
	radius: number;
	tint: string;
	iconColor: string;
}) {
	return (
		<View
			style={[
				styles.thumb,
				{
					width: size,
					height: size,
					borderRadius: radius,
					backgroundColor: tint,
				},
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
				<Ionicons name="cube-outline" size={22} color={iconColor} />
			)}
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
	const isDark = useColorScheme() === "dark";
	const { t } = useTranslation();
	const { isTablet } = useResponsive();
	const params = useLocalSearchParams<{ rubric?: string }>();
	const pane = useRef<ScrollView>(null);

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const railBg = isDark ? "#0f172a" : "#f1f5f9";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const tint = isDark ? "#1e293b" : "#e2e8f0";

	const { data, isLoading } = useQuery({
		queryKey: CATEGORIES_QUERY_KEY,
		queryFn: () => api.get<{ categories: unknown[] }>("/api/public/categories"),
		staleTime: CATEGORIES_STALE_TIME_MS,
	});
	const rubrics = useMemo(
		() => categoryTree((data?.categories ?? []) as never[]),
		[data],
	);
	const [selected, setSelected] = useState<string | undefined>(params.rubric);
	const current: CategoryRubric | undefined =
		rubrics.find((r) => r.id === selected) ?? rubrics[0];

	const select = (id: string) => {
		setSelected(id);
		pane.current?.scrollTo({ y: 0, animated: false });
	};

	const groups = current?.children.filter((g) => g.children.length > 0) ?? [];
	const leaves = current?.children.filter((g) => g.children.length === 0) ?? [];
	const tileColumns = isTablet ? 4 : 2;

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<HeaderBackButton color={textColor} fallback="/(tabs)/home" inline />
				<Text style={[styles.title, { color: textColor }]}>
					{t("categories.title")}
				</Text>
				<View style={{ width: 40 }} />
			</View>

			{isLoading && rubrics.length === 0 ? (
				<ActivityIndicator style={styles.loading} color={primaryColor} />
			) : (
				<View style={styles.body}>
					<ScrollView
						style={[styles.rail, { backgroundColor: railBg }]}
						contentContainerStyle={styles.railContent}
						showsVerticalScrollIndicator={false}
					>
						{rubrics.map((rubric) => {
							const active = rubric.id === current?.id;
							return (
								<Pressable
									key={rubric.id}
									onPress={() => select(rubric.id)}
									accessibilityRole="tab"
									accessibilityState={{ selected: active }}
									style={[styles.railItem, active && { backgroundColor: bg }]}
								>
									{active && (
										<View
											style={[
												styles.railMark,
												{ backgroundColor: primaryColor },
											]}
										/>
									)}
									<Thumb
										category={rubric}
										size={40}
										radius={12}
										tint={tint}
										iconColor={mutedColor}
									/>
									<Text
										numberOfLines={2}
										style={[
											styles.railLabel,
											{ color: active ? primaryColor : mutedColor },
											active && styles.railLabelActive,
										]}
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
								<Pressable
									onPress={() => openCategory(current.id)}
									style={[
										styles.allRow,
										{ backgroundColor: cardBg, borderColor },
									]}
								>
									<Text
										style={[styles.allLabel, { color: primaryColor }]}
										numberOfLines={1}
									>
										{t("categories.allOf", { name: current.name })}
									</Text>
									<Ionicons
										name="chevron-forward"
										size={16}
										color={primaryColor}
									/>
								</Pressable>

								{groups.map((group) => (
									<View
										key={group.id}
										style={[
											styles.group,
											{ backgroundColor: cardBg, borderColor },
										]}
									>
										<Pressable
											onPress={() => openCategory(group.id)}
											style={styles.groupHead}
										>
											<Thumb
												category={group}
												size={36}
												radius={10}
												tint={tint}
												iconColor={mutedColor}
											/>
											<Text
												style={[styles.groupName, { color: textColor }]}
												numberOfLines={2}
											>
												{group.name}
											</Text>
											<Ionicons
												name="chevron-forward"
												size={16}
												color={mutedColor}
											/>
										</Pressable>
										<View style={styles.chips}>
											{group.children.slice(0, GROUP_CHIPS).map((child) => (
												<Pressable
													key={child.id}
													onPress={() => openCategory(child.id)}
													style={[styles.chip, { borderColor }]}
												>
													<Text
														style={[styles.chipLabel, { color: textColor }]}
														numberOfLines={1}
													>
														{child.name}
													</Text>
												</Pressable>
											))}
											{group.children.length > GROUP_CHIPS && (
												<Pressable
													onPress={() => openCategory(group.id)}
													style={[styles.chip, { borderColor: primaryColor }]}
												>
													<Text
														style={[styles.chipLabel, { color: primaryColor }]}
													>
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
												style={[
													styles.tile,
													{
														width: `${100 / tileColumns - 2}%`,
														backgroundColor: cardBg,
														borderColor,
													},
												]}
											>
												<View
													style={[styles.tileImage, { backgroundColor: tint }]}
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
															color={mutedColor}
														/>
													)}
												</View>
												<Text
													style={[styles.tileLabel, { color: textColor }]}
													numberOfLines={2}
												>
													{leaf.name}
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
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: 1,
	},
	title: { fontSize: 17, fontFamily: Fonts.displayBold },
	loading: { marginTop: 40 },
	body: { flex: 1, flexDirection: "row" },
	rail: { width: 92, flexGrow: 0 },
	railContent: { paddingVertical: 6 },
	railItem: {
		alignItems: "center",
		paddingVertical: 10,
		paddingHorizontal: 6,
		gap: 6,
	},
	railMark: {
		position: "absolute",
		left: 0,
		top: 10,
		bottom: 10,
		width: 3,
		borderTopRightRadius: 3,
		borderBottomRightRadius: 3,
	},
	railLabel: {
		fontSize: 11,
		lineHeight: 14,
		textAlign: "center",
		fontFamily: Fonts.bodySemibold,
	},
	railLabelActive: { fontFamily: Fonts.bodyBold },
	thumb: {
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	pane: { flex: 1 },
	paneContent: { padding: 12, gap: 10, paddingBottom: 40 },
	allRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		borderWidth: 1,
		borderRadius: 12,
		paddingHorizontal: 12,
		paddingVertical: 11,
	},
	allLabel: { flexShrink: 1, fontSize: 14, fontFamily: Fonts.bodyBold },
	group: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 10 },
	groupHead: { flexDirection: "row", alignItems: "center", gap: 10 },
	groupName: { flex: 1, fontSize: 14, fontFamily: Fonts.bodyBold },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	chip: {
		borderWidth: 1,
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 6,
		maxWidth: "100%",
	},
	chipLabel: { fontSize: 12, fontFamily: Fonts.bodySemibold },
	tiles: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		rowGap: 10,
	},
	tile: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
	tileImage: {
		aspectRatio: 4 / 3,
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	tileLabel: {
		fontSize: 12,
		lineHeight: 16,
		fontFamily: Fonts.bodySemibold,
		paddingHorizontal: 8,
		paddingVertical: 7,
	},
});
