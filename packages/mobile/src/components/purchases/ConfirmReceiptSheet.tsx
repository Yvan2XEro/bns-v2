import { Text } from "react-native";
import { useAlert } from "@/src/contexts/AlertContext";
import { useConfirmReceipt } from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { OrderView } from "@/src/types/order";
import { useShopTheme } from "../shop/theme";
import { FieldError, PurchaseButton, purchaseText, Sheet } from "./ui";

/**
 * The buyer's own way to finish a delivery, and the first fallback once the
 * handover code is locked — which is why the sheet says so in that state.
 */
export function ConfirmReceiptSheet({
	order,
	visible,
	onClose,
}: {
	order: Pick<OrderView, "id" | "handover" | "paymentMethod" | "shop">;
	visible: boolean;
	onClose: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const confirm = useConfirmReceipt(order.id);
	const { showSuccess } = useAlert();
	// On a protected order this releases the money and ends the contest
	// window: the sheet says so before the buyer commits.
	const body =
		order.paymentMethod === "mobile_money"
			? t("purchases.confirmReceiptBodyPaid", { shop: order.shop.name })
			: t("purchases.confirmReceiptBody");

	return (
		<Sheet
			visible={visible}
			title={t("purchases.confirmReceipt")}
			body={body}
			onClose={onClose}
			closeLabel={t("purchases.dismiss")}
		>
			{order.handover.locked ? (
				<Text style={[purchaseText.muted, { color: c.warningText }]}>
					{t("purchases.handoverFallbacksIntro")}{" "}
					{t("purchases.handoverFallbackConfirm")}
				</Text>
			) : null}
			<FieldError
				message={confirm.isError ? resolveErrorMessage(confirm.error, t) : null}
			/>
			<PurchaseButton
				label={t("purchases.confirmReceiptSubmit")}
				pending={confirm.isPending}
				onPress={() =>
					confirm.mutate(undefined, {
						onSuccess: () => {
							onClose();
							showSuccess(t("purchases.receiptConfirmed"));
						},
					})
				}
			/>
		</Sheet>
	);
}
