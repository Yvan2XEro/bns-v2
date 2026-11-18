import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { HandleStatus } from "@/src/components/shop/HandleField";
import { useAlert } from "@/src/contexts/AlertContext";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { MyShop } from "@/src/types/api";
import { useChangeHandle } from "./useShops";

const HANDLE_ERROR_CODES: ReadonlySet<string> = new Set([
	ERROR_CODES.shopHandleInvalid,
	ERROR_CODES.shopHandleReserved,
	ERROR_CODES.shopHandleTaken,
	ERROR_CODES.shopHandleCooldown,
]);

const changeHandleSchema = z.object({ handle: z.string().min(1) });
export type ChangeHandleFormValues = z.infer<typeof changeHandleSchema>;

/**
 * Owner-only: `useChangeHandle` posts to a route the API refuses to anyone
 * else, so a caller must gate rendering on `isShopOwner(role)` before ever
 * mounting this — never rely on `canSubmit` alone to keep the affordance
 * off a manager's screen.
 */
export function useChangeHandleForm(shop: MyShop) {
	const { t } = useTranslation();
	const { showSuccess, showConfirm } = useAlert();
	const changeHandle = useChangeHandle(shop.id);
	const submittingRef = useRef(false);
	const [handleStatus, setHandleStatus] = useState<HandleStatus>("idle");
	const onStatus = useCallback(
		(status: HandleStatus) => setHandleStatus(status),
		[],
	);

	const form = useForm<ChangeHandleFormValues>({
		resolver: zodResolver(changeHandleSchema),
		defaultValues: { handle: shop.handle },
	});
	const handle = form.watch("handle");

	const canSubmit =
		handle !== shop.handle &&
		handleStatus === "available" &&
		!changeHandle.isPending;

	const submit = form.handleSubmit((values) => {
		if (!canSubmit || submittingRef.current) return;
		showConfirm(
			t("shop.handleConfirmTitle"),
			t("shop.handleConfirmMessage", { handle: values.handle }),
			() => {
				submittingRef.current = true;
				changeHandle.mutate(values.handle, {
					onSuccess: () => {
						submittingRef.current = false;
						showSuccess(
							t("shop.handleChangedTitle"),
							t("shop.handleChangedMessage"),
						);
					},
					onError: (error) => {
						submittingRef.current = false;
						const code = error instanceof ApiError ? error.code : "";
						form.setError(HANDLE_ERROR_CODES.has(code) ? "handle" : "root", {
							message: resolveErrorMessage(error, t),
						});
					},
				});
			},
		);
	});

	return {
		form,
		handle,
		handleStatus,
		onStatus,
		canSubmit,
		isPending: changeHandle.isPending,
		submit,
	};
}
