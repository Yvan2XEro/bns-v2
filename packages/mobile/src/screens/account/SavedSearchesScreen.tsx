import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
	FlatList,
	Platform,
	Pressable,
	RefreshControl,
	StyleSheet,
	Switch,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { SkeletonRow } from "@/src/components/SkeletonCard";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { SettingsHeader } from "@/src/components/settings/SettingsHeader";
import { useAlert } from "@/src/contexts/AlertContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";

interface SavedSearch {
	id: string;
	name: string;
	query?: string | null;
	url?: string | null;
	filters?: Record<string, unknown> | null;
	alertEnabled?: boolean;
	createdAt?: string;
}

const savedSearchesKey = ["saved-searches"] as const;

/**
 * The params the search tab reads, rebuilt from what was saved. The stored
 * `url` ("/search?q=…&category=…") carries every criterion; older rows
 * without one fall back to the query plus the filters. The name is never
 * the query: a renamed search ("Corolla pas chère") would be fed to the
 * engine as text.
 */
export function savedSearchParams(item: SavedSearch): Record<string, string> {
	const params: Record<string, string> = {};
	const queryString = item.url?.split("?")[1];
	if (queryString) {
		for (const [key, value] of new URLSearchParams(queryString)) {
			if (value && key !== "sort") params[key] = value;
		}
		return params;
	}
	if (item.query) params.q = item.query;
	for (const [key, value] of Object.entries(item.filters ?? {})) {
		if (key === "sort" || value == null || value === "") continue;
		if (typeof value === "string" || typeof value === "number") {
			params[key] = String(value);
		}
	}
	return params;
}

/**
 * Saved searches as one inset list: tap a search to run it again, the
 * switch turns its alerts on or off, the bin removes it after a prompt.
 */
export function SavedSearchesScreen() {
	const c = useGroupedColors();
	const { centeredContent } = useResponsive();
	const { t } = useTranslation();
	const { user, isLoading: authLoading } = useAuth();
	const queryClient = useQueryClient();
	const { showConfirm, showError } = useAlert();
	const danger = c.isDark ? c.dangerText : c.destructive;

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: savedSearchesKey,
		queryFn: () =>
			api.get<{ docs: SavedSearch[] }>(
				"/api/saved-searches?sort=-createdAt&limit=50",
			),
		enabled: !!user && !authLoading,
	});

	const searches = data?.docs ?? [];

	const { mutate: toggleAlert } = useMutation({
		mutationFn: ({ id, alertEnabled }: { id: string; alertEnabled: boolean }) =>
			api.patch(`/api/saved-searches/${id}`, { alertEnabled }),
		// The switch moves under the thumb at once; a refusal puts it back
		// and says so, instead of snapping back on a slow network.
		onMutate: async ({ id, alertEnabled }) => {
			await queryClient.cancelQueries({ queryKey: savedSearchesKey });
			const previous = queryClient.getQueryData<{ docs: SavedSearch[] }>(
				savedSearchesKey,
			);
			queryClient.setQueryData<{ docs: SavedSearch[] }>(
				savedSearchesKey,
				(old) =>
					old
						? {
								...old,
								docs: old.docs.map((doc) =>
									doc.id === id ? { ...doc, alertEnabled } : doc,
								),
							}
						: old,
			);
			return { previous };
		},
		onError: (err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(savedSearchesKey, context.previous);
			}
			showError(t("common.error"), resolveErrorMessage(err, t));
		},
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: savedSearchesKey }),
	});

	// "Douala · ≤ 150 000 FCFA": enough to tell two "iPhone" searches apart.
	const describe = (item: SavedSearch): string | null => {
		const params = savedSearchParams(item);
		const parts: string[] = [];
		if (params.location) parts.push(params.location);
		const min = Number(params.minPrice);
		const max = Number(params.maxPrice);
		if (min > 0 && max > 0) {
			parts.push(`${formatPrice(min)} – ${formatPrice(max)}`);
		} else if (max > 0) {
			parts.push(`≤ ${formatPrice(max)}`);
		} else if (min > 0) {
			parts.push(`≥ ${formatPrice(min)}`);
		}
		const extra = Object.keys(params).filter(
			(key) => key === "category" || key.startsWith("attr_"),
		).length;
		if (extra > 0) {
			parts.push(
				t("savedSearches.filterCount", {
					count: extra,
					defaultValue: extra > 1 ? "{{count}} filtres" : "{{count}} filtre",
				}),
			);
		}
		return parts.length ? parts.join(" · ") : null;
	};

	const { mutate: deleteSearch } = useMutation({
		mutationFn: (id: string) => api.delete(`/api/saved-searches/${id}`),
		onError: (err) => showError(t("common.error"), resolveErrorMessage(err, t)),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: savedSearchesKey }),
	});

	const [refreshing, setRefreshing] = React.useState(false);
	const onRefresh = async () => {
		setRefreshing(true);
		await refetch();
		setRefreshing(false);
	};

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			<SettingsHeader title={t("savedSearches.title")} />

			{authLoading || isLoading ? (
				<View
					style={styles.skeletonList}
					accessible
					accessibilityRole="progressbar"
					accessibilityLabel={t("common.loading")}
				>
					{Array.from({ length: 5 }).map((_, i) => (
						<SkeletonRow key={i} />
					))}
				</View>
			) : isError && searches.length === 0 ? (
				// A failed load is not an empty list: "no searches" would read as
				// if they had been deleted.
				<EmptyState
					icon="alert-circle-outline"
					title={t("common.error")}
					subtitle={t("home.errorSub")}
					ctaLabel={t("common.retry")}
					onCta={() => void refetch()}
				/>
			) : searches.length === 0 ? (
				<EmptyState
					icon="bookmark-outline"
					title={t("savedSearches.noSearches")}
					subtitle={t("savedSearches.noSearchesSubtitle")}
					ctaLabel={t("common.search")}
					onCta={() => router.push("/(tabs)/search")}
				/>
			) : (
				<FlatList
					data={searches}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={c.primary}
							colors={[c.primary]}
						/>
					}
					contentContainerStyle={[styles.list, centeredContent]}
					// The hairline between rows starts at the text, as in the grouped
					// lists of Settings; the card's sides run past it.
					ItemSeparatorComponent={() => (
						<View
							style={[
								styles.separator,
								{ backgroundColor: c.card, borderColor: c.border },
							]}
						>
							<View
								style={[styles.separatorLine, { backgroundColor: c.border }]}
							/>
						</View>
					)}
					renderItem={({ item, index }) => {
						const date = formatDate(item.createdAt);
						const meta = describe(item);
						const first = index === 0;
						const last = index === searches.length - 1;
						return (
							<View
								style={[
									styles.item,
									{ backgroundColor: c.card, borderColor: c.border },
									first && styles.itemFirst,
									last && styles.itemLast,
								]}
							>
								<Pressable
									onPress={() => {
										router.push({
											pathname: "/(tabs)/search",
											// A fresh `entry` makes a mounted Search tab
											// reset its text, sort and segment to these.
											params: {
												...savedSearchParams(item),
												entry: String(Date.now()),
											},
										});
									}}
									accessibilityRole="button"
									accessibilityLabel={[item.name, meta, date]
										.filter(Boolean)
										.join(", ")}
									android_ripple={{ color: c.well }}
									style={({ pressed }) => [
										styles.searchInfo,
										pressed && Platform.OS === "ios"
											? { backgroundColor: c.well }
											: null,
									]}
								>
									<Text
										style={[styles.searchName, { color: c.foreground }]}
										numberOfLines={2}
									>
										{item.name}
									</Text>
									{meta ? (
										<Text
											style={[styles.searchMeta, { color: c.body }]}
											numberOfLines={1}
										>
											{meta}
										</Text>
									) : null}
									{date ? (
										<Text
											style={[styles.searchDate, { color: c.mutedForeground }]}
										>
											{date}
										</Text>
									) : null}
								</Pressable>
								<View style={styles.alert}>
									<Switch
										value={item.alertEnabled ?? false}
										onValueChange={(val) =>
											toggleAlert({ id: item.id, alertEnabled: val })
										}
										accessibilityLabel={`${t("savedSearches.alerts")}, ${item.name}`}
										trackColor={{ false: c.borderStrong, true: c.primaryFill }}
										thumbColor="#ffffff"
										ios_backgroundColor={c.borderStrong}
									/>
									<Text
										style={[styles.alertLabel, { color: c.mutedForeground }]}
										importantForAccessibility="no"
										accessibilityElementsHidden
									>
										{t("savedSearches.alerts")}
									</Text>
								</View>
								<Pressable
									onPress={() =>
										showConfirm(
											t("common.delete"),
											t("savedSearches.deleteConfirm"),
											() => deleteSearch(item.id),
										)
									}
									accessibilityRole="button"
									accessibilityLabel={`${t("common.delete")}, ${item.name}`}
									hitSlop={4}
									style={({ pressed }) => [
										styles.deleteBtn,
										pressed ? { backgroundColor: c.dangerTint } : null,
									]}
								>
									<Ionicons name="trash-outline" size={20} color={danger} />
								</Pressable>
							</View>
						);
					}}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	skeletonList: { padding: 16, gap: 10 },
	list: { padding: 16, paddingTop: 20, paddingBottom: 48 },
	// The rows read as one inset card: hairline sides, rounded ends.
	item: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 64,
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderRightWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
	},
	itemFirst: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopLeftRadius: 14,
		borderTopRightRadius: 14,
	},
	itemLast: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomLeftRadius: 14,
		borderBottomRightRadius: 14,
	},
	separator: {
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderRightWidth: StyleSheet.hairlineWidth,
	},
	separatorLine: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
	// The pressable text fills the row's height, so the press highlight
	// reaches the card's edges like a GroupedRow's.
	searchInfo: {
		flex: 1,
		alignSelf: "stretch",
		justifyContent: "center",
		gap: 2,
		paddingLeft: 16,
		paddingRight: 8,
		paddingVertical: 12,
	},
	searchName: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.bodyMedium },
	searchMeta: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.body },
	searchDate: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	alert: { alignItems: "center", gap: 2, paddingHorizontal: 4 },
	alertLabel: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	deleteBtn: {
		width: 48,
		height: 48,
		marginRight: 4,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
});
