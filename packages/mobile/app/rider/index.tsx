import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Fonts } from "@/constants/theme";
import {
	type CourierListItem,
	GROUP_LABEL,
} from "@/src/components/delivery/CourierRows";
import { EmptyState } from "@/src/components/EmptyState";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import {
	isConnectionError,
	OfflineMark,
	QueueSkeleton,
} from "@/src/components/moderation/ModerationKit";
import { OpsGroupHeader } from "@/src/components/moderation/OpsGroupHeader";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	type CourierShipmentRow,
	useCourierShipments,
} from "@/src/hooks/useRiderShipments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { groupRiderRows, readDestination } from "@/src/lib/riderShipment";
import { courierStatusLabel } from "@/src/lib/shipmentStatus";

const Separator = () => <View style={styles.separator} />;

/**
 * One parcel as a rider plans a run around it: where it goes first, in large
 * type, then the cash to collect on the yellow tag. The shipment number is
 * only a reference, so it moves to the meta line.
 */
function RiderRow({
	row,
	onPress,
}: {
	row: CourierShipmentRow;
	onPress: () => void;
}) {
	const c = useShopTheme();
	const { t, i18n } = useTranslation();
	const destination = readDestination(row.destination);
	const place =
		[destination.landmark, destination.district].filter(Boolean).join(", ") ||
		destination.city ||
		row.shipmentNumber;
	const city =
		destination.landmark || destination.district ? destination.city : null;
	const status = t(courierStatusLabel(row.status));
	// Failed and delivered must not look alike: the colour follows the
	// outcome, the words stay.
	const tone =
		row.status === "failed"
			? { bg: c.dangerSoft, fg: c.dangerText }
			: row.status === "delivered"
				? { bg: c.successSoft, fg: c.successText }
				: { bg: c.neutralSoft, fg: c.neutralText };
	const cash =
		row.codCollection?.expectedAmount && row.codCollection.expectedAmount > 0
			? row.codCollection.expectedAmount
			: null;
	const sun = c.isDark ? Colors.dark.sun : Colors.light.sun;
	const cashLabel = cash
		? t("shipmentPanel.cashTag", {
				amount: formatPrice(cash, i18n.language),
			})
		: null;
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={[place, city, cashLabel, status, row.shipmentNumber]
				.filter(Boolean)
				.join(", ")}
			style={({ pressed }) => [
				styles.card,
				{
					borderColor: c.border,
					backgroundColor: c.card,
					opacity: pressed ? 0.7 : 1,
				},
			]}
		>
			<View style={styles.body}>
				<Text style={[styles.place, { color: c.text }]} numberOfLines={2}>
					{place}
				</Text>
				{city ? (
					<Text style={[styles.city, { color: c.body }]}>{city}</Text>
				) : null}
				<View style={styles.metaRow}>
					<View style={[styles.pill, { backgroundColor: tone.bg }]}>
						<Text style={[styles.pillText, { color: tone.fg }]}>{status}</Text>
					</View>
					{cashLabel ? (
						<View style={[styles.cash, { backgroundColor: sun }]}>
							<Text style={styles.cashText}>{cashLabel}</Text>
						</View>
					) : null}
				</View>
				<Text style={[styles.number, { color: c.muted }]}>
					{row.shipmentNumber}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={20} color={c.muted} />
		</Pressable>
	);
}

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
	const offline = isConnectionError(query.error);
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
					illustration={offline ? undefined : "notFound"}
					illustrationNode={offline ? <OfflineMark /> : undefined}
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
								<OpsGroupHeader
									title={t(GROUP_LABEL[item.group])}
									count={counts.get(item.group) ?? 0}
								/>
							) : (
								<RiderRow
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
	card: {
		minHeight: 72,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		borderRadius: 16,
		borderWidth: StyleSheet.hairlineWidth,
		padding: 14,
	},
	body: { flex: 1, gap: 4 },
	place: { fontFamily: Fonts.displayBold, fontSize: 18, lineHeight: 23 },
	city: { fontFamily: Fonts.body, fontSize: 15, lineHeight: 20 },
	metaRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: 8,
		marginTop: 2,
	},
	pill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
	pillText: { fontFamily: Fonts.bodySemibold, fontSize: 13, lineHeight: 17 },
	cash: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
	cashText: {
		color: Colors.light.sunForeground,
		fontFamily: Fonts.displayExtrabold,
		fontSize: 15,
		lineHeight: 22,
		fontVariant: ["tabular-nums"],
	},
	number: { fontFamily: Fonts.body, fontSize: 13, lineHeight: 18 },
});
