import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
	FlatList,
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
import { useAuth } from "@/src/lib/auth";
import { formatDate } from "@/src/lib/formatDate";
import { useTranslation } from "@/src/lib/i18n";

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
	const { showConfirm } = useAlert();
	const danger = c.isDark ? c.dangerText : c.destructive;

	const { data, isLoading, refetch } = useQuery({
		queryKey: ["saved-searches"],
		queryFn: () =>
			api.get<{ docs: any[] }>("/api/saved-searches?sort=-createdAt&limit=50"),
		enabled: !!user && !authLoading,
	});

	const searches = data?.docs ?? [];

	const { mutate: toggleAlert } = useMutation({
		mutationFn: ({ id, alertEnabled }: { id: string; alertEnabled: boolean }) =>
			api.patch(`/api/saved-searches/${id}`, { alertEnabled }),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
	});

	const { mutate: deleteSearch } = useMutation({
		mutationFn: (id: string) => api.delete(`/api/saved-searches/${id}`),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: ["saved-searches"] }),
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
					ItemSeparatorComponent={() => (
						<View
							style={[
								styles.separator,
								{ backgroundColor: c.border, borderColor: c.border },
							]}
						/>
					)}
					renderItem={({ item, index }) => {
						const date = formatDate(item.createdAt);
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
											params: { q: item.name },
										});
									}}
									accessibilityRole="button"
									accessibilityLabel={[item.name, date]
										.filter(Boolean)
										.join(", ")}
									android_ripple={{ color: c.well }}
									style={({ pressed }) => [
										styles.searchInfo,
										pressed ? { opacity: 0.7 } : null,
									]}
								>
									<Text
										style={[styles.searchName, { color: c.foreground }]}
										numberOfLines={2}
									>
										{item.name}
									</Text>
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
		gap: 8,
		minHeight: 64,
		paddingLeft: 16,
		paddingRight: 6,
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderRightWidth: StyleSheet.hairlineWidth,
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
		height: StyleSheet.hairlineWidth,
		borderLeftWidth: StyleSheet.hairlineWidth,
		borderRightWidth: StyleSheet.hairlineWidth,
	},
	searchInfo: { flex: 1, gap: 3, paddingVertical: 12 },
	searchName: { fontSize: 16, lineHeight: 21, fontFamily: Fonts.bodyMedium },
	searchDate: { fontSize: 13, lineHeight: 18, fontFamily: Fonts.body },
	alert: { alignItems: "center", gap: 2 },
	alertLabel: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	deleteBtn: {
		width: 44,
		height: 44,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
});
