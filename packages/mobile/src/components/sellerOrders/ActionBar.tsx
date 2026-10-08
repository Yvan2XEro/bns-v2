import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import {
	useAcceptOrder,
	useConfirmByCall,
	useShipOrder,
} from "@/src/hooks/useOrderActions";
import { useShopOrderShipments } from "@/src/hooks/useShipmentActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	type ActionBarItem,
	actionBarItems,
	isPostAction,
	isSheetAction,
	lockedHandoverNotice,
	type SheetAction,
} from "@/src/lib/sellerOrders";
import type { ShopRole } from "@/src/types/api";
import type { OrderView } from "@/src/types/order";
import { DeclareDeliveredSheet } from "./DeclareDeliveredForm";
import { DeliveryFailureSheet } from "./DeliveryFailureSheet";
import { SheetButton } from "./FormBits";
import { SellerEndSheet } from "./SellerEndSheet";

/**
 * Renders `actionBarItems` — `availableActions(order, "shop", role)` — and
 * nothing it does not list. The only state here is which sheet is open.
 */
export function ActionBar({
	order,
	shopId,
	role,
}: {
	order: OrderView;
	shopId: string;
	role: ShopRole;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const [sheet, setSheet] = useState<SheetAction | null>(null);
	const accept = useAcceptOrder(order.id, shopId);
	const ship = useShipOrder(order.id, shopId);
	const confirmByCall = useConfirmByCall(order.id, shopId);
	const posts = { accept, ship, confirm_by_call: confirmByCall };
	const all = [accept, ship, confirmByCall];
	const failed = all.find((m) => m.isError);
	const pending = all.some((m) => m.isPending);
	const shipments = useShopOrderShipments(String(order.id));
	const liveShipment = (shipments.data ?? []).some(
		(shipment) => shipment.status !== "cancelled",
	);
	const items = actionBarItems(order, role, undefined, liveShipment);
	const close = () => setSheet(null);
	const openHandover = () => router.push(`/seller/orders/${order.id}/handover`);

	const press = ({ action }: ActionBarItem) => {
		if (isPostAction(action)) {
			for (const m of all) m.reset();
			posts[action].mutate();
		} else if (isSheetAction(action)) {
			setSheet(action);
		} else {
			openHandover();
		}
	};

	return (
		<View
			style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
		>
			<Text style={[styles.title, { color: c.text }]}>
				{t("sellerOrders.actions")}
			</Text>
			{lockedHandoverNotice(order, items) ? (
				<Pressable
					onPress={openHandover}
					accessibilityRole="button"
					accessibilityLabel={t("sellerOrders.handoverFallbacks")}
					style={[styles.notice, { backgroundColor: c.warningSoft }]}
				>
					<Ionicons name="lock-closed" size={18} color={c.warningText} />
					<View style={styles.noticeText}>
						<Text style={[styles.noticeTitle, { color: c.warningText }]}>
							{t("sellerOrders.handoverLocked")}
						</Text>
						<Text style={[styles.hint, { color: c.warningText }]}>
							{t("sellerOrders.handoverFallbacks")}
						</Text>
					</View>
					<Ionicons name="chevron-forward" size={18} color={c.warningText} />
				</Pressable>
			) : null}
			{items.length === 0 ? (
				<Text style={[styles.hint, { color: c.muted }]}>
					{t("sellerOrders.noActions")}
				</Text>
			) : (
				items.map((item) => (
					<SheetButton
						key={item.action}
						label={t(item.labelKey)}
						tone={item.tone}
						disabled={pending}
						onPress={() => press(item)}
					/>
				))
			)}
			{failed ? (
				<Text
					accessibilityRole="alert"
					style={[styles.hint, { color: c.danger }]}
				>
					{resolveErrorMessage(failed.error, t, t("sellerOrders.actionFailed"))}
				</Text>
			) : null}

			<SellerEndSheet
				mode={sheet === "seller_cancel" ? "seller_cancel" : "decline"}
				visible={sheet === "decline" || sheet === "seller_cancel"}
				orderId={order.id}
				shopId={shopId}
				onClose={close}
			/>
			<DeliveryFailureSheet
				mode={
					sheet === "mark_delivery_failed"
						? "mark_delivery_failed"
						: "report_failed_attempt"
				}
				visible={
					sheet === "report_failed_attempt" || sheet === "mark_delivery_failed"
				}
				orderId={order.id}
				shopId={shopId}
				onClose={close}
			/>
			<DeclareDeliveredSheet
				visible={sheet === "declare_delivered"}
				orderId={order.id}
				shopId={shopId}
				onClose={close}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
	title: { fontSize: 16, fontFamily: Fonts.displayBold },
	hint: { fontSize: 13, fontFamily: Fonts.body },
	notice: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		minHeight: 44,
		padding: 12,
		borderRadius: 12,
	},
	noticeText: { flex: 1, gap: 2 },
	noticeTitle: { fontSize: 14, fontFamily: Fonts.bodySemibold },
});
