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
		<View style={{ gap: 8 }}>
			{riders.data?.length === 0 ? (
				<Text style={{ color: c.muted }}>{t("shipmentPanel.noRiders")}</Text>
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
				<Text accessibilityRole="alert" style={{ color: c.danger }}>
					{resolveErrorMessage(assign.error, t)}
				</Text>
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
			{canAssign ? (
				<SheetButton
					tone="secondary"
					label={t("shipmentPanel.assignRider")}
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
		</CourierRow>
	);
}

export default function CourierDispatchScreen() {
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
			<SellerHeader title={t("shipmentPanel.dispatchTitle")} />
			{query.isPending ? (
				<ActivityIndicator style={styles.spinner} color={c.primary} />
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
	spinner: { marginTop: 40 },
	content: { padding: 16, paddingBottom: 48 },
	header: { fontSize: 16, fontFamily: Fonts.displayBold, marginTop: 8 },
});
