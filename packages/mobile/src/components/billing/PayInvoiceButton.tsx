import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Pressable, Text } from "react-native";
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
	onSettled,
}: {
	shopId: string;
	invoiceId: string;
	onSettled: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showError } = useAlert();
	const pay = usePayInvoice(shopId);

	const onPay = () =>
		pay.mutate(invoiceId, {
			onSuccess: async ({ checkoutUrl }) => {
				await WebBrowser.openBrowserAsync(checkoutUrl);
				onSettled();
			},
			onError: (error) => {
				if (isStaleInvoiceError(error)) onSettled();
				showError(t("billing.payFailed"), resolveErrorMessage(error, t));
			},
		});

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={t("billing.pay")}
			accessibilityState={{ busy: pay.isPending, disabled: pay.isPending }}
			onPress={onPay}
			disabled={pay.isPending}
			style={[s.button, { backgroundColor: c.primary }]}
		>
			{pay.isPending ? <ActivityIndicator color="#fff" /> : null}
			<Text style={s.buttonText}>
				{pay.isPending ? t("billing.payOpening") : t("billing.pay")}
			</Text>
		</Pressable>
	);
}
