import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { EmptyState } from "@/src/components/EmptyState";
import { useBuyerDisputes } from "@/src/hooks/useDisputes";
import { useTranslation } from "@/src/lib/i18n";
import type { DisputeListRow } from "../../../api/src/contracts/disputes";

export default function AccountDisputesScreen() {
	const dark = useColorScheme() === "dark";
	const { t, i18n } = useTranslation();
	const query = useBuyerDisputes();
	const colors = {
		bg: dark ? "#0b1120" : "#f8fafc",
		text: dark ? "#e2e8f0" : "#0f172a",
		muted: dark ? "#94a3b8" : "#64748b",
		border: dark ? "#1e3a5f" : "#e2e8f0",
		card: dark ? "#111c2e" : "#ffffff",
		primary: dark ? "#c4b5fd" : "#6d28d9",
	};
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: colors.bg }]}
		>
			<View style={[styles.header, { borderBottomColor: colors.border }]}>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t("common.back")}
					onPress={() => router.back()}
					hitSlop={12}
				>
					<Ionicons name="arrow-back" size={22} color={colors.text} />
				</Pressable>
				<Text style={[styles.title, { color: colors.text }]}>
					{t("disputes.title")}
				</Text>
				<View style={styles.spacer} />
			</View>
			{query.isPending ? (
				<ActivityIndicator style={styles.loader} color={colors.primary} />
			) : null}
			{query.isError ? (
				<EmptyState
					icon="alert-circle-outline"
					title={t("disputes.loadError")}
					ctaLabel={t("common.retry")}
					onCta={() => void query.refetch()}
				/>
			) : null}
			{query.data?.rows.length === 0 ? (
				<EmptyState
					icon="chatbubble-ellipses-outline"
					title={t("disputes.emptyTitle")}
					subtitle={t("disputes.emptyBody")}
					ctaLabel={t("disputes.viewPurchases")}
					onCta={() => router.push("/purchases")}
				/>
			) : null}
			{query.data?.rows.length ? (
				<FlashList
					data={query.data.rows}
					keyExtractor={(row) => row.id}
					contentContainerStyle={styles.list}
					renderItem={({ item }) => (
						<DisputeRow item={item} dark={dark} locale={i18n.language} />
					)}
				/>
			) : null}
		</SafeAreaView>
	);
}

function DisputeRow({
	item,
	dark,
	locale,
}: {
	item: DisputeListRow;
	dark: boolean;
	locale: string;
}) {
	const { t } = useTranslation();
	const bg = dark ? "#111c2e" : "#fff";
	const text = dark ? "#e2e8f0" : "#0f172a";
	const muted = dark ? "#94a3b8" : "#64748b";
	return (
		<Pressable
			accessibilityRole="button"
			onPress={() => router.push(`/disputes/${item.id}`)}
			style={[
				styles.card,
				{ backgroundColor: bg, borderColor: dark ? "#1e3a5f" : "#e2e8f0" },
			]}
		>
			<View style={styles.rowTop}>
				<Text style={[styles.number, { color: text }]}>{item.number}</Text>
				<Text
					style={[
						styles.status,
						{ color: item.overdue ? "#dc2626" : "#6d28d9" },
					]}
				>
					{t(`disputes.status.${item.status}`)}
				</Text>
			</View>
			<Text style={[styles.description, { color: muted }]}>
				{t("disputes.order", { number: item.orderNumber })} ·{" "}
				{t(`disputes.reason.${item.reason}`)}
			</Text>
			<View style={styles.rowBottom}>
				<Text style={[styles.description, { color: muted }]}>
					{item.amountAtStake.toLocaleString(locale)} XAF
				</Text>
				{item.overdue ? (
					<Text style={styles.overdue}>{t("disputes.overdue")}</Text>
				) : null}
				<Ionicons name="chevron-forward" size={18} color={muted} />
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		alignItems: "center",
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: "row",
		gap: 16,
		paddingHorizontal: 18,
		paddingVertical: 14,
	},
	title: { flex: 1, fontFamily: Fonts.displaySemibold, fontSize: 20 },
	spacer: { width: 22 },
	loader: { marginTop: 40 },
	list: { padding: 16 },
	card: {
		borderRadius: 16,
		borderWidth: 1,
		gap: 9,
		marginBottom: 12,
		padding: 16,
	},
	rowTop: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	number: { fontFamily: Fonts.bodySemibold, fontSize: 15 },
	status: { fontFamily: Fonts.bodyMedium, fontSize: 12 },
	description: { fontFamily: Fonts.body, fontSize: 13 },
	rowBottom: {
		alignItems: "center",
		flexDirection: "row",
		gap: 10,
		justifyContent: "flex-end",
	},
	overdue: { color: "#dc2626", fontFamily: Fonts.bodyMedium, fontSize: 12 },
});
