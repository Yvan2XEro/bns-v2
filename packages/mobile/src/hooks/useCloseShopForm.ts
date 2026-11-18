import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAlert } from "@/src/contexts/AlertContext";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { normalizeHandle } from "@/src/lib/shopHandle";
import type { MyShop } from "@/src/types/api";
import { useCloseShop } from "./useShops";

function closeShopSchema(handle: string) {
	return z.object({
		confirmation: z
			.string()
			.refine((value) => normalizeHandle(value) === handle),
	});
}
export type CloseShopFormValues = z.infer<ReturnType<typeof closeShopSchema>>;

/**
 * Owner-only, same rule as `useChangeHandleForm`: the API's `closeShop`
 * requires `requireShopMember({ owner: true })`, so a caller must not mount
 * this for a manager. Confirmation must retype the shop's own handle —
 * the schema is rebuilt per shop rather than shared as a constant.
 */
export function useCloseShopForm(shop: MyShop) {
	const { t } = useTranslation();
	const { showSuccess, showError } = useAlert();
	const closeShop = useCloseShop(shop.id);
	const submittingRef = useRef(false);

	const resolver = useMemo(
		() => zodResolver(closeShopSchema(shop.handle)),
		[shop.handle],
	);
	const form = useForm<CloseShopFormValues>({
		resolver,
		mode: "onChange",
		defaultValues: { confirmation: "" },
	});

	const submit = form.handleSubmit((values) => {
		if (submittingRef.current || closeShop.isPending) return;
		submittingRef.current = true;
		closeShop.mutate(values.confirmation, {
			onSuccess: (result) => {
				submittingRef.current = false;
				showSuccess(
					t("shop.closedTitle"),
					t("shop.closedMessage", { count: result.detachedListingIds.length }),
				);
				router.replace("/(tabs)/account" as never);
			},
			onError: (error) => {
				submittingRef.current = false;
				showError(t("shop.saveError"), resolveErrorMessage(error, t));
			},
		});
	});

	return {
		form,
		submit,
		isPending: closeShop.isPending,
	};
}
