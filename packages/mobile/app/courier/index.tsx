import { FlashList } from "@shopify/flash-list";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
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
import { SheetButton } from "@/src/components/sellerOrders/FormBits";
import { SellerHeader } from "@/src/components/shop/SellerHeader";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import {
	type CourierShipmentRow,
	useAssignCourierRider,
	useCourierRiders,
	useCourierShipments,
	useDeclareRemitted,
} from "@/src/hooks/useRiderShipments";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { formatPrice } from "@/src/lib/market";
import { groupRiderRows } from "@/src/lib/riderShipment";

function AssignRider({ row }: { row: CourierShipmentRow }) {
	const { t } = useTranslation();
	const c = useShopTheme();
	const { showConfirm } = useAlert();
	const riders = useCourierRiders(row.courierId);
	const assign = useAssignCourierRider(row.id);
	return (
		<View style={styles.assign}>
			{riders.isLoading ? (
				<ActivityIndicator
					color={c.muted}
					style={styles.loading}
					accessibilityLabel={t("shipmentPanel.assignRider")}
				/>
			) : null}
			{riders.error ? (
				<View
					accessibilityRole="alert"
					style={[styles.error, { backgroundColor: c.dangerSoft }]}
				>
					<Text style={[styles.note, { color: c.dangerText }]}>
						{resolveErrorMessage(riders.error, t)}
					</Text>
				</View>
			) : null}
			{riders.data?.length === 0 ? (
				<Text style={[styles.note, { color: c.muted }]}>
					{t("shipmentPanel.noRiders")}
				</Text>
			) : null}
			{(riders.data ?? []).map((member) => {
				const user = typeof member.user === "object" ? member.user : null;
				const userId = user?.id ?? String(member.user);
				return (
					<SheetButton
						key={member.id}
						tone="secondary"
						label={user?.name ?? userId}
						pending={assign.isPending}
						// One tap away from sending someone across town: confirm first.
						onPress={() =>
							showConfirm(
								t("shipmentPanel.assignRider"),
								t("shipmentPanel.assignConfirm", {
									name: user?.name ?? userId,
								}),
								() => assign.mutate(userId),
							)
						}
					/>
				);
			})}
			{assign.error ? (
				<View
					accessibilityRole="alert"
					style={[styles.error, { backgroundColor: c.dangerSoft }]}
				>
					<Text style={[styles.note, { color: c.dangerText }]}>
						{resolveErrorMessage(assign.error, t)}
					</Text>
				</View>
			) : null}
		</View>
	);
}

function DispatcherRow({ row }: { row: CourierShipmentRow }) {
	const { t, i18n } = useTranslation();
	const { showConfirm } = useAlert();
	const [assigning, setAssigning] = useState(false);
	const remitted = useDeclareRemitted(row.id);
	const canAssign = row.status === "pending" || row.status === "failed";
	const canRemit =
		row.status === "delivered" &&
		row.codCollection?.remittanceStatus === "pending";
	return (
		<CourierRow row={row}>
			{canAssign || canRemit ? (
				<View style={styles.actions}>
					{canAssign ? (
						<SheetButton
							tone="secondary"
							label={t("shipmentPanel.assignRider")}
							expanded={assigning}
							onPress={() => setAssigning(!assigning)}
						/>
					) : null}
					{assigning ? <AssignRider row={row} /> : null}
					{canRemit ? (
						<SheetButton
							label={t("shipmentPanel.declareRemitted")}
							pending={remitted.isPending}
							// Declaring cash handed over is final: the amount is stated first.
							onPress={() =>
								showConfirm(
									t("shipmentPanel.declareRemitted"),
									t("shipmentPanel.remitConfirm", {
										amount: formatPrice(
											row.codCollection?.collectedAmount ??
												row.codCollection?.expectedAmount ??
												0,
											i18n.language,
										),
									}),
									() => remitted.mutate(undefined),
								)
							}
						/>
					) : null}
				</View>
			) : null}
		</CourierRow>
	);
}

const Separator = () => <View style={styles.separator} />;

export default function CourierDispatchScreen() {
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
			<SellerHeader title={t("shipmentPanel.dispatchTitle")} />
			{query.isPending ? (
				<QueueSkeleton rows={4} />
			) : query.isError ? (
				<EmptyState
					illustration="auth"
					title={t("shipmentPanel.notMember")}
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
								<DispatcherRow row={item.row} />
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
	actions: { gap: 8, marginTop: 8 },
	assign: { gap: 8 },
	note: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	error: { borderRadius: 12, padding: 12 },
	loading: { minHeight: 48 },
});
