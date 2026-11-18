import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { fillOf } from "@/src/components/shop/ink";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { usePayInvoice } from "@/src/hooks/useBilling";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { isStaleInvoiceError } from "@/src/lib/billing";
import { useTranslation } from "@/src/lib/i18n";
import { billingStyles as s } from "./billingStyles";

/**
 * Opens the provider's hosted checkout. Nothing settles here: the invoice
 * turns `paid` on the provider's callback, so the billing view is re-read
 * when the browser closes. A refusal that says the invoice moved under the
 * screen (`commission.notPayable`, already paid, gone) also re-reads it, so
 * the dead button disappears instead of inviting a retry.
 */
export function PayInvoiceButton({
	shopId,
	invoiceId,
	amountLabel,
	onSettled,
}: {
	shopId: string;
	invoiceId: string;
	/** The formatted total, so the button reads "Payer 12 500 FCFA". */
	amountLabel?: string;
	onSettled: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError, showSuccess } = useAlert();
	const pay = usePayInvoice(shopId);
	// Set once the checkout closes: the provider confirms later, so the screen
	// says the payment is on its way instead of inviting a second one.
	const [confirming, setConfirming] = useState(false);
	const label = amountLabel
		? t("billing.payAmount", { amount: amountLabel })
		: t("billing.pay");

	const onPay = () =>
		pay.mutate(invoiceId, {
			onSuccess: async ({ checkoutUrl }) => {
				await WebBrowser.openBrowserAsync(checkoutUrl);
				setConfirming(true);
				showSuccess(t("billing.payConfirming"));
				onSettled();
			},
			onError: (error) => {
				if (isStaleInvoiceError(error)) onSettled();
				showError(t("billing.payFailed"), resolveErrorMessage(error, t));
			},
		});

	return (
		<View style={{ gap: 8 }}>
			{confirming ? (
				<Text
					accessibilityRole="alert"
					style={[s.body, { color: c.warningText }]}
				>
					{t("billing.payConfirming")}
				</Text>
			) : null}
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{ busy: pay.isPending, disabled: pay.isPending }}
				onPress={onPay}
				disabled={pay.isPending}
				style={[
					s.button,
					confirming
						? { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }
						: { backgroundColor: fillOf(c) },
				]}
			>
				{pay.isPending ? <ActivityIndicator color="#fff" /> : null}
				<Text style={[s.buttonText, confirming && { color: c.link }]}>
					{pay.isPending ? t("billing.payOpening") : label}
				</Text>
			</Pressable>
		</View>
	);
}
