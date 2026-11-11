import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import {
	type CourierListItem,
	CourierRow,
	GROUP_LABEL,
} from "@/src/components/delivery/CourierRows";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { QueueSkeleton } from "@/src/components/moderation/ModerationKit";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useCourierShipments } from "@/src/hooks/useRiderShipments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { groupRiderRows } from "@/src/lib/riderShipment";

const Separator = () => <View style={styles.separator} />;

export default function RiderHomeScreen() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const query = useCourierShipments();
	const groups = groupRiderRows(query.data?.rows ?? []);
	const counts = new Map(groups.map(({ group, rows }) => [group, rows.length]));
	const items: CourierListItem[] = groups.flatMap(({ group, rows }) => [
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
				<QueueSkeleton rows={4} />
			) : query.isError ? (
				<EmptyState
					illustration="notFound"
					title={t("shipmentPanel.loadError")}
					subtitle={resolveErrorMessage(query.error, t)}
					ctaLabel={t("common.retry")}
					onCta={() => query.refetch()}
				/>
			) : (
				<ScreenColumn width="wide">
					<FlashList
						data={items}
						keyExtractor={(item) => item.key}
						getItemType={(item) => item.kind}
						refreshing={query.isRefetching}
						onRefresh={() => void query.refetch()}
						contentContainerStyle={styles.content}
						ItemSeparatorComponent={Separator}
						ListEmptyComponent={
							<EmptyState
								illustration="empty"
								title={t("shipmentPanel.riderEmpty")}
							/>
						}
						renderItem={({ item }) =>
							item.kind === "header" ? (
								<View style={styles.headerRow}>
									<Text
										accessibilityRole="header"
										style={[styles.header, { color: c.text }]}
									>
										{t(GROUP_LABEL[item.group])}
									</Text>
									<View
										style={[styles.count, { backgroundColor: c.neutralSoft }]}
									>
										<Text style={[styles.countText, { color: c.text }]}>
											{counts.get(item.group) ?? 0}
										</Text>
									</View>
								</View>
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
				</ScreenColumn>
			)}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	separator: { height: 10 },
	content: { padding: 16, paddingBottom: 48 },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		marginTop: 12,
	},
	header: {
		fontSize: 20,
		lineHeight: 25,
		letterSpacing: -0.4,
		fontFamily: Fonts.displayBold,
	},
	count: {
		minWidth: 26,
		height: 26,
		borderRadius: 13,
		paddingHorizontal: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	countText: { fontSize: 14, fontFamily: Fonts.displayBold },
});
