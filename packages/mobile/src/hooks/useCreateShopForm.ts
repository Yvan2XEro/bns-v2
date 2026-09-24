import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { HandleStatus } from "@/src/components/shop/HandleField";
import { useAlert } from "@/src/contexts/AlertContext";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import type { Place } from "@/src/lib/places";
import { normalizeHandle } from "@/src/lib/shopHandle";
import { useCreateShop } from "./useShops";

const HANDLE_ERROR_CODES: ReadonlySet<string> = new Set([
	ERROR_CODES.shopHandleInvalid,
	ERROR_CODES.shopHandleReserved,
	ERROR_CODES.shopHandleTaken,
]);

const createShopSchema = z.object({
	name: z.string().trim().min(2).max(60),
	handle: z.string().min(1),
	city: z.custom<Place | null>(),
	categories: z.array(z.object({ id: z.string(), name: z.string() })).max(5),
});
export type CreateShopFormValues = z.infer<typeof createShopSchema>;

/**
 * Owns the shop-creation form's state and submission. Split out of the
 * screen so the component stays render logic: the name→handle auto-slug,
 * the double-submit guard and the server-error-to-field mapping all belong
 * here rather than in JSX.
 */
export function useCreateShopForm() {
	const { t } = useTranslation();
	const { showError, showSuccess } = useAlert();
	const create = useCreateShop();
	// A ref, not state: must block a second tap in the same tick, before
	// `create.isPending` has had a chance to re-render.
	const submittingRef = useRef(false);
	const [handleTouched, setHandleTouched] = useState(false);
	const [handleStatus, setHandleStatus] = useState<HandleStatus>("idle");
	const onStatus = useCallback(
		(status: HandleStatus) => setHandleStatus(status),
		[],
	);

	const form = useForm<CreateShopFormValues>({
		resolver: zodResolver(createShopSchema),
		defaultValues: { name: "", handle: "", city: null, categories: [] },
	});

	const name = form.watch("name");
	const nameOk = name.trim().length >= 2 && name.trim().length <= 60;
	const canSubmit = nameOk && handleStatus === "available" && !create.isPending;

	const onNameChange = (value: string) => {
		if (!handleTouched) form.setValue("handle", normalizeHandle(value));
	};

	const onHandleChange = useCallback(() => setHandleTouched(true), []);

	const submit = form.handleSubmit((values) => {
		if (submittingRef.current || create.isPending) return;
		submittingRef.current = true;
		create.mutate(
			{
				handle: values.handle,
				name: values.name.trim(),
				city: values.city?.name,
				categories: values.categories.map((cat) => cat.id),
			},
			{
				onSuccess: () => {
					showSuccess(t("shop.createdTitle"), t("shop.createdMessage"));
					router.replace("/seller" as never);
				},
				onError: (error) => {
					submittingRef.current = false;
					if (error instanceof ApiError && HANDLE_ERROR_CODES.has(error.code)) {
						form.setError("handle", { message: resolveErrorMessage(error, t) });
						return;
					}
					showError(t("shop.createError"), resolveErrorMessage(error, t));
				},
			},
		);
	});

	return {
		form,
		name,
		canSubmit,
		isPending: create.isPending,
		handleStatus,
		onStatus,
		onNameChange,
		onHandleChange,
		submit,
	};
}
