import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	useDeclineOrder,
	useSellerCancelOrder,
} from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	SELLER_END_REASON_KEYS,
	SELLER_END_REASONS,
	type SellerEndValues,
	sellerEndBody,
	sellerEndSchema,
} from "@/src/lib/sellerOrders";
import { FieldError, NoteField, ReasonPicker, SheetButton } from "./FormBits";
import { OrderSheet } from "./OrderSheet";

const EMPTY: SellerEndValues = { reason: null, note: "" };

/** Decline and seller-cancel share the spec's four reasons and one form. */
export function SellerEndSheet({
	mode,
	visible,
	orderId,
	shopId,
	onClose,
}: {
	mode: "decline" | "seller_cancel";
	visible: boolean;
	orderId: string;
	shopId: string;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const decline = useDeclineOrder(orderId, shopId);
	const cancel = useSellerCancelOrder(orderId, shopId);
	const mutation = mode === "decline" ? decline : cancel;
	const form = useForm<SellerEndValues>({
		resolver: zodResolver(sellerEndSchema),
		defaultValues: EMPTY,
	});
	const { errors } = form.formState;

	// A reopened sheet must not carry the previous order's reason forward.
	useEffect(() => {
		if (visible) form.reset(EMPTY);
	}, [visible, form.reset]);

	const submit = form.handleSubmit(async (values) => {
		const body = sellerEndBody(values);
		if (!body) return;
		try {
			await mutation.mutateAsync(body);
			onClose();
		} catch (error) {
			form.setError("root", {
				message: resolveErrorMessage(error, t, t("sellerOrders.actionFailed")),
			});
		}
	});

	return (
		<OrderSheet
			visible={visible}
			title={
				mode === "decline"
					? t("sellerOrders.declineReason")
					: t("sellerOrders.cancelOrderReason")
			}
			subtitle={
				mode === "decline"
					? t("sellerOrders.declineBody")
					: t("sellerOrders.cancelBody")
			}
			onClose={onClose}
		>
			<Controller
				control={form.control}
				name="reason"
				render={({ field }) => (
					<ReasonPicker
						options={SELLER_END_REASONS}
						labelKeys={SELLER_END_REASON_KEYS}
						value={field.value}
						onChange={field.onChange}
					/>
				)}
			/>
			<FieldError
				message={errors.reason?.message ? t(errors.reason.message) : undefined}
			/>
			<Controller
				control={form.control}
				name="note"
				render={({ field }) => (
					<NoteField
						label={
							form.watch("reason") === "seller_other"
								? t("sellerOrders.note")
								: t("sellerOrders.noteOptional")
						}
						value={field.value}
						onChange={field.onChange}
						onBlur={field.onBlur}
					/>
				)}
			/>
			<FieldError
				message={errors.note?.message ? t(errors.note.message) : undefined}
			/>
			<FieldError message={errors.root?.message} />
			<SheetButton
				label={
					mode === "decline"
						? t("sellerOrders.decline")
						: t("sellerOrders.cancelOrder")
				}
				tone="danger"
				pending={mutation.isPending}
				onPress={submit}
			/>
		</OrderSheet>
	);
}
