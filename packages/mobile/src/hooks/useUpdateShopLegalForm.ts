import { zodResolver } from "@hookform/resolvers/zod";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { useAlert } from "@/src/contexts/AlertContext";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	type LegalFormValues,
	legalFormDefaults,
	legalFormSchema,
	toLegalUpdateInput,
} from "@/src/lib/shopLegal";
import type { MyShop } from "@/src/types/api";
import { useUpdateShop } from "./useShops";

/**
 * Owns the legal-declaration form: business type, legal name, RCCM and NIU
 * save together through one `PATCH`. The server silently discards the write
 * once `capabilities.effectiveLevel` reaches 3 (`Shops.ts`'s `beforeChange`),
 * so `readOnly` here only spares the owner a confusing no-op submit — it is
 * not the enforcement.
 */
export function useUpdateShopLegalForm(shop: MyShop) {
	const { t } = useTranslation();
	const { showSuccess } = useAlert();
	const updateShop = useUpdateShop(shop.id);
	const submittingRef = useRef(false);

	const form = useForm<LegalFormValues>({
		resolver: zodResolver(legalFormSchema),
		mode: "onChange",
		defaultValues: legalFormDefaults(shop.legal),
	});

	const submit = form.handleSubmit((values) => {
		if (submittingRef.current || updateShop.isPending) return;
		submittingRef.current = true;
		updateShop.mutate(
			{ legal: toLegalUpdateInput(values) },
			{
				onSuccess: () => {
					submittingRef.current = false;
					showSuccess(t("shop.savedTitle"), t("shop.savedMessage"));
				},
				onError: (error) => {
					submittingRef.current = false;
					// The server's own reason, mapped back onto the form rather than
					// only alerted: a toast disappears, but the refusal stays wrong
					// until the person changes something, so it belongs next to the
					// Save button they are about to press again.
					form.setError("root", { message: resolveErrorMessage(error, t) });
				},
			},
		);
	});

	return { form, submit, isPending: updateShop.isPending };
}
