import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { StatusPill } from "@/src/components/StatusPill";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";

const DURATION_LABELS: Record<number, string> = {
	7: "1 semaine",
	14: "2 semaines",
	30: "1 mois",
};

export default function BoostHistoryScreen() {
	const isDark = useColorScheme() === "dark";
	const { user } = useAuth();

	const bg = isDark ? "#0b1120" : "#f8fafc";
	const cardBg = isDark ? "#1e293b" : "#ffffff";
	const textColor = isDark ? "#e2e8f0" : "#0f172a";
	const mutedColor = isDark ? "#94a3b8" : "#64748b";
	const primaryColor = isDark ? "#3b82f6" : "#1e40af";
	const borderColor = isDark ? "#1e3a5f" : "#e2e8f0";

	const { data, isLoading, refetch } = useQuery({
		queryKey: ["boost-payments"],
		queryFn: () =>
			api.get<{ docs: any[] }>(
				"/api/boost-payments?sort=-createdAt&depth=1&limit=50",
			),
		enabled: !!user,
	});

	const payments = data?.docs ?? [];
	const completed = payments.filter(
		(p: any) => p.status === "completed",
	).length;
	const totalSpent = payments
		.filter((p: any) => p.status === "completed")
		.reduce((acc: number, p: any) => acc + (p.amount ?? 0), 0);

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
					Historique des boosts
				</Text>
				<View style={{ width: 40 }} />
			</View>

			{isLoading ? (
				<ActivityIndicator style={{ margin: 32 }} color={primaryColor} />
			) : payments.length === 0 ? (
				<EmptyState
					icon="rocket-outline"
					title="Aucun boost"
					subtitle="Boostez vos annonces pour obtenir plus de visibilité"
					ctaLabel="Voir mes annonces"
					onCta={() => router.push("/account/listings")}
				/>
			) : (
				<FlatList
					data={payments}
					keyExtractor={(item) => item.id}
					refreshControl={
						<RefreshControl
							refreshing={refreshing}
							onRefresh={onRefresh}
							tintColor={primaryColor}
						/>
					}
					ListHeaderComponent={
						<View style={styles.statsRow}>
							{[
								{ label: "Total", value: payments.length, color: primaryColor },
								{ label: "Complétés", value: completed, color: "#16a34a" },
								{
									label: "Dépensé",
									value: `${totalSpent.toLocaleString()} XAF`,
									color: "#f59e0b",
								},
							].map(({ label, value, color }) => (
								<View
									key={label}
									style={[
										styles.statCard,
										{ backgroundColor: cardBg, borderColor },
									]}
								>
									<Text style={[styles.statVal, { color }]}>{value}</Text>
									<Text style={[styles.statLabel, { color: mutedColor }]}>
										{label}
									</Text>
								</View>
							))}
						</View>
					}
					contentContainerStyle={{ padding: 16, gap: 10 }}
					renderItem={({ item }) => (
						<Pressable
							onPress={() =>
								router.push(`/listing/${item.listing?.id ?? item.listing}`)
							}
							style={[
								styles.paymentItem,
								{ backgroundColor: cardBg, borderColor },
							]}
						>
							<View
								style={[
									styles.rocketCircle,
									{ backgroundColor: isDark ? "#162032" : "#fff7ed" },
								]}
							>
								<Ionicons name="rocket-outline" size={20} color="#f59e0b" />
							</View>
							<View style={styles.paymentInfo}>
								<Text
									style={[styles.listingTitle, { color: textColor }]}
									numberOfLines={1}
								>
									{item.listing?.title ?? "Annonce supprimée"}
								</Text>
								<Text style={[styles.duration, { color: mutedColor }]}>
									{DURATION_LABELS[item.durationDays] ??
										`${item.durationDays} jours`}
								</Text>
								<Text style={[styles.date, { color: mutedColor }]}>
									{new Date(item.createdAt).toLocaleDateString("fr-FR")}
								</Text>
							</View>
							<View style={{ alignItems: "flex-end", gap: 6 }}>
								<StatusPill status={item.status ?? "pending"} />
								<Text style={[styles.amount, { color: "#f59e0b" }]}>
									{item.amount?.toLocaleString()} XAF
								</Text>
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
	statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
	statCard: {
		flex: 1,
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		alignItems: "center",
		gap: 2,
	},
	statVal: { fontSize: 18, fontFamily: Fonts.displayExtrabold },
	statLabel: { fontSize: 11, fontFamily: Fonts.bodySemibold },
	paymentItem: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 12,
		borderWidth: 1,
		padding: 12,
		gap: 12,
	},
	rocketCircle: {
		width: 48,
		height: 48,
		borderRadius: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	paymentInfo: { flex: 1, gap: 3 },
	listingTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
	duration: { fontSize: 12, fontFamily: Fonts.body },
	date: { fontSize: 12, fontFamily: Fonts.body },
	amount: { fontSize: 14, fontFamily: Fonts.displayBold },
});
