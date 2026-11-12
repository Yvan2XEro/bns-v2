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
import {
	isConnectionError,
	isForbiddenError,
	OfflineMark,
	QueueSkeleton,
} from "@/src/components/moderation/ModerationKit";
import { OpsGroupHeader } from "@/src/components/moderation/OpsGroupHeader";
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
import { groupRiderRows, riderGroup } from "@/src/lib/riderShipment";

/** Parcels each rider is carrying now (to pick up, picked up, on the way). */
function openLoadByRider(rows: readonly CourierShipmentRow[]) {
	const load = new Map<string, number>();
	for (const row of rows) {
		if (riderGroup(row.status) !== "today") continue;
		const rider = row.rider?.user;
		const riderId = typeof rider === "object" && rider ? rider.id : rider;
		if (!riderId) continue;
		load.set(riderId, (load.get(riderId) ?? 0) + 1);
	}
	return load;
}

function AssignRider({
	row,
	load,
}: {
	row: CourierShipmentRow;
	load: Map<string, number>;
}) {
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
			{/* Least loaded first, each with what they already carry: the
			    dispatcher picks a rider, not a name. */}
			{(riders.data ?? [])
				.map((member) => {
					const user = typeof member.user === "object" ? member.user : null;
					const userId = user?.id ?? String(member.user);
					return { member, user, userId, open: load.get(userId) ?? 0 };
				})
				.sort((a, b) => a.open - b.open)
				.map(({ member, user, userId, open }) => {
					return (
						<SheetButton
							key={member.id}
							tone="secondary"
							label={`${user?.name ?? userId} · ${t("shipmentPanel.riderLoad", {
								count: open,
							})}`}
							// The spinner sits on the rider being assigned; the others wait.
							pending={assign.isPending && assign.variables === userId}
							disabled={assign.isPending}
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

function DispatcherRow({
	row,
	load,
}: {
	row: CourierShipmentRow;
	load: Map<string, number>;
}) {
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
					{assigning ? <AssignRider row={row} load={load} /> : null}
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
	const rows = query.data?.rows ?? [];
	const load = openLoadByRider(rows);
	const groups = groupRiderRows(rows);
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
			) : query.isError && isForbiddenError(query.error) ? (
				<EmptyState
					illustration="auth"
					title={t("shipmentPanel.notMember")}
					subtitle={resolveErrorMessage(query.error, t)}
				/>
			) : query.isError ? (
				// A weak signal is not a missing membership: only a 403 says
				// "not for you"; everything else is a load that can be retried.
				<EmptyState
					illustration={isConnectionError(query.error) ? undefined : "notFound"}
					illustrationNode={
						isConnectionError(query.error) ? <OfflineMark /> : undefined
					}
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
								<DispatcherRow row={item.row} load={load} />
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
	actions: { gap: 8, marginTop: 8 },
	assign: { gap: 8 },
	note: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.body },
	error: { borderRadius: 12, padding: 12 },
	loading: { minHeight: 48 },
});
