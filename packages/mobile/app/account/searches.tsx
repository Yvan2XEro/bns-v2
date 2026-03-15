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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

export default function SavedSearchesScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const { showConfirm } = useAlert();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { data, refetch } = useQuery({
		queryKey: ["saved-searches"],
		queryFn: () =>
			api.get<{ docs: any[] }>("/api/saved-searches?sort=-createdAt&limit=50"),
		enabled: !!user,
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
			style={[styles.safe, { backgroundColor: bg }]}
		>
			<View style={[styles.header, { borderBottomColor: borderColor }]}>
				<Pressable onPress={() => router.back()}>
					<Ionicons name="arrow-back" size={22} color={textColor} />
				</Pressable>
				<Text style={[styles.title, { color: textColor }]}>
					Recherches sauvegardées
				</Text>
				<View style={{ width: 40 }} />
			</View>

			{searches.length === 0 ? (
				<EmptyState
					icon="bookmark-outline"
					title="Aucune recherche"
					subtitle="Sauvegardez vos recherches pour être notifié des nouvelles annonces"
					ctaLabel="Rechercher"
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
							tintColor={primaryColor}
						/>
					}
					contentContainerStyle={{ padding: 16, gap: 10 }}
					renderItem={({ item }) => (
						<Pressable
							onPress={() => {
								router.push({
									pathname: "/(tabs)/search",
									params: { q: item.name },
								});
							}}
							style={[
								styles.searchItem,
								{ backgroundColor: cardBg, borderColor },
							]}
						>
							<View style={styles.searchInfo}>
								<Text style={[styles.searchName, { color: textColor }]}>
									{item.name}
								</Text>
								<Text style={[styles.searchDate, { color: mutedColor }]}>
									{new Date(item.createdAt).toLocaleDateString("fr-FR")}
								</Text>
							</View>
							<View style={styles.searchActions}>
								<View style={{ alignItems: "center", gap: 2 }}>
									<Switch
										value={item.alertEnabled ?? false}
										onValueChange={(val) =>
											toggleAlert({ id: item.id, alertEnabled: val })
										}
										thumbColor={item.alertEnabled ? primaryColor : "#f4f4f5"}
										trackColor={{
											false: borderColor,
											true: isDark ? "#1e3a5f" : "#dbeafe",
										}}
									/>
									<Text style={[styles.alertLabel, { color: mutedColor }]}>
										Alertes
									</Text>
								</View>
								<Pressable
									onPress={() =>
										showConfirm(
											"Supprimer",
											"Supprimer cette recherche ?",
											() => deleteSearch(item.id),
										)
									}
									style={[
										styles.deleteBtn,
										{ backgroundColor: isDark ? "#1a0a0a" : "#fee2e2" },
									]}
								>
									<Ionicons name="trash" size={16} color="#dc2626" />
								</Pressable>
							</View>
						</Pressable>
					)}
				/>
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
	searchItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderRadius: 12,
		borderWidth: 1,
		padding: 14,
	},
	searchInfo: { flex: 1, gap: 4 },
	searchName: { fontSize: 15, fontFamily: Fonts.bodySemibold },
	searchDate: { fontSize: 12, fontFamily: Fonts.body },
	searchActions: { flexDirection: "row", alignItems: "center", gap: 8 },
	alertLabel: { fontSize: 10, fontFamily: Fonts.bodySemibold },
	deleteBtn: {
		width: 36,
		height: 36,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
});
