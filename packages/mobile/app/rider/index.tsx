import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import {
	type CourierListItem,
	CourierRow,
	GROUP_LABEL,
} from "@/src/components/delivery/CourierRows";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCourierShipments } from "@/src/hooks/useRiderShipments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { groupRiderRows } from "@/src/lib/riderShipment";

export default function RiderHomeScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const query = useCourierShipments();
	const items: CourierListItem[] = groupRiderRows(
		query.data?.rows ?? [],
	).flatMap(({ group, rows }) => [
		{ kind: "header" as const, key: `h-${group}`, group },
		...rows.map((row) => ({ kind: "row" as const, key: row.id, row })),
	]);
	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.bg }]}
		>
			<SellerHeader title={t("shipmentPanel.courierSpace")} />
			{query.isPending ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
			) : query.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("shipmentPanel.loadError")}
					subtitle={resolveErrorMessage(query.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => query.refetch()}
				/>
			) : (
				<FlashList
					data={items}
					keyExtractor={(item) => item.key}
					getItemType={(item) => item.kind}
					refreshing={query.isRefetching}
					onRefresh={() => void query.refetch()}
					contentContainerStyle={styles.content}
					ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
					ListEmptyComponent={
						<Text style={{ color: c.muted }}>
							{t("shipmentPanel.riderEmpty")}
						</Text>
					}
					renderItem={({ item }) =>
						item.kind === "header" ? (
							<Text style={[styles.header, { color: c.text }]}>
								{t(GROUP_LABEL[item.group])}
							</Text>
						) : (
							<CourierRow
								row={item.row}
								onPress={() =>
									router.push({
										pathname: "/rider/shipment/[id]",
										params: { id: item.row.id },
									})
								}
							/>
						)
					}
				/>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	spinner: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 48 },
	header: { fontSize: 16, fontFamily: Fonts.displayBold, marginTop: 8 },
});
