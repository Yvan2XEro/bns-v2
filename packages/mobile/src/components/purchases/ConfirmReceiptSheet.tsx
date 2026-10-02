import { Text } from "react-native";
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
	order: Pick<OrderView, "id" | "handover">;
	visible: boolean;
	onClose: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const confirm = useConfirmReceipt(order.id);

	return (
		<Sheet
			visible={visible}
			title={t("purchases.confirmReceipt")}
			body={t("purchases.confirmReceiptBody")}
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
				onPress={() => confirm.mutate(undefined, { onSuccess: onClose })}
			/>
		</Sheet>
	);
}
