import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import {
	useMarkDeliveryFailed,
	useReportFailedAttempt,
} from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	DELIVERY_FAILURE_REASON_KEYS,
	DELIVERY_FAILURE_REASONS,
	type DeliveryFailureValues,
	deliveryFailureBody,
	deliveryFailureSchema,
} from "@/src/lib/sellerOrders";
import { FieldError, NoteField, ReasonPicker, SheetButton } from "./FormBits";
import { OrderSheet } from "./OrderSheet";

const EMPTY: DeliveryFailureValues = { reason: null, note: "" };

/**
 * A first failed attempt keeps the order `shipped`; marking the delivery
 * failed ends it. Both take the six reasons the collection stores.
 */
export function DeliveryFailureSheet({
	mode,
	visible,
	orderId,
	shopId,
	onClose,
}: {
	mode: "report_failed_attempt" | "mark_delivery_failed";
	visible: boolean;
	orderId: string;
	shopId: string;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const report = useReportFailedAttempt(orderId, shopId);
	const mark = useMarkDeliveryFailed(orderId, shopId);
	const mutation = mode === "report_failed_attempt" ? report : mark;
	const form = useForm<DeliveryFailureValues>({
		resolver: zodResolver(deliveryFailureSchema),
		defaultValues: EMPTY,
	});
	const { errors } = form.formState;

	useEffect(() => {
		if (visible) form.reset(EMPTY);
	}, [visible, form.reset]);

	const submit = form.handleSubmit(async (values) => {
		const body = deliveryFailureBody(values);
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

	const label =
		mode === "report_failed_attempt"
			? t("sellerOrders.reportFailedAttempt")
			: t("sellerOrders.markFailed");

	return (
		<OrderSheet
			visible={visible}
			title={label}
			subtitle={t("sellerOrders.failureBody")}
			onClose={onClose}
		>
			<Controller
				control={form.control}
				name="reason"
				render={({ field }) => (
					<ReasonPicker
						options={DELIVERY_FAILURE_REASONS}
						labelKeys={DELIVERY_FAILURE_REASON_KEYS}
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
						label={t("sellerOrders.noteOptional")}
						value={field.value}
						onChange={field.onChange}
						onBlur={field.onBlur}
					/>
				)}
			/>
			<FieldError message={errors.root?.message} />
			<SheetButton
				label={label}
				tone={mode === "mark_delivery_failed" ? "danger" : "primary"}
				pending={mutation.isPending}
				onPress={submit}
			/>
		</OrderSheet>
	);
}
