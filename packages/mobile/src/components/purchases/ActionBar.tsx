import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useAlert } from "@/src/contexts/AlertContext";
import { useShareReceipt } from "@/src/hooks/useShareReceipt";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { OrderAction } from "@/src/lib/orderActions";
import { barActions } from "@/src/lib/purchaseActions";
import type { OrderView } from "@/src/types/order";
import { PurchaseButton } from "./ui";

export type PurchaseSheet = "cancel" | "confirm_receipt" | "contest_delivery";

function isSheet(action: OrderAction): action is PurchaseSheet {
	return (
		action === "cancel" ||
		action === "confirm_receipt" ||
		action === "contest_delivery"
	);
}

/**
 * Renders the buttons `availableActions(order, "buyer")` returned, in its
 * order, and nothing else.
 */
export function ActionBar({
	order,
	actions,
	onSheet,
}: {
	order: Pick<OrderView, "id" | "orderNumber">;
	actions: readonly OrderAction[];
	onSheet: (sheet: PurchaseSheet) => void;
}) {
	const { t, i18n } = useTranslation();
	const { showError } = useAlert();
	const lang = i18n.language?.startsWith("en") ? "en" : "fr";
	const receipt = useShareReceipt(order, lang);
	const bar = barActions(actions);
	if (bar.length === 0) return null;

	const onPress = (action: OrderAction) => {
		if (isSheet(action)) return onSheet(action);
		if (action === "request_withdrawal") {
			return router.push(`/purchases/${order.id}/withdrawal`);
		}
		if (action === "receipt") {
			receipt
				.share()
				.catch((error: unknown) =>
					showError(
						t("purchases.receiptUnavailable"),
						resolveErrorMessage(error, t),
					),
				);
		}
	};

	return (
		<View style={styles.bar} accessibilityLabel={t("purchases.actionsTitle")}>
			{bar.map((entry) => (
				<PurchaseButton
					key={entry.action}
					label={t(entry.labelKey)}
					tone={entry.tone}
					pending={entry.kind === "receipt" && receipt.pending}
					onPress={() => onPress(entry.action)}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: { gap: 8 },
});
