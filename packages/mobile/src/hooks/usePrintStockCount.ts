import { useState } from "react";
import { alerts } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { printHtmlDocument } from "@/src/lib/printDocument";

/**
 * The shop's stock count sheet, printed from the phone: the same document
 * the website prints (the API's print document, without its on-screen
 * toolbar), handed to the system's print dialog — which also saves a PDF.
 */
export function usePrintStockCount(shopId: string | undefined) {
	const { t, i18n } = useTranslation();
	const [pending, setPending] = useState(false);

	const print = async (blind: boolean) => {
		if (!shopId || pending) return;
		setPending(true);
		try {
			const lang = i18n.language.startsWith("en") ? "en" : "fr";
			const html = await api.getText(
				`/api/shops/${shopId}/print/stock-count?lang=${lang}&embed=1&blind=${blind ? 1 : 0}`,
			);
			await printHtmlDocument(html);
		} catch (error) {
			alerts.showError(t("stock.printFailed"), resolveErrorMessage(error, t));
		} finally {
			setPending(false);
		}
	};

	/** Asks which sheet, then prints it. */
	const choose = () =>
		alerts.showAlert(t("stock.printTitle"), t("stock.printBody"), [
			{ text: t("stock.printSheet"), onPress: () => void print(false) },
			{ text: t("stock.printBlind"), onPress: () => void print(true) },
			{ text: t("common.cancel"), style: "cancel" },
		]);

	return { choose, pending };
}
