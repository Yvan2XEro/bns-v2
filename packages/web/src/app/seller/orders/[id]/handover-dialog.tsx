"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { type OrderActionTarget, useHandover } from "~/hooks/use-order-actions";
import { ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import type { OrderView } from "~/types/order";
import { type HandoverValues, handoverSchema } from "../order-forms";
import { DeclareDeliveredForm } from "./declare-delivered-dialog";

/** What the seller can still do once the code is locked (spec: handover code). */
export function HandoverFallbacks() {
	const t = useTranslations("SellerOrders");
	return (
		<>
			<p className="font-medium">{t("handoverFallbacks")}</p>
			<ul className="list-disc space-y-1 pl-5">
				<li>{t("handoverFallbackRegenerate")}</li>
				<li>{t("handoverFallbackConfirm")}</li>
			</ul>
		</>
	);
}

/**
 * Lock and attempts come from `order.handover`. A failed POST's code says at
 * once whether the code was wrong or is now locked; the caller then
 * refetches the order, whose `handover` carries the server's own count.
 */
export function HandoverDialog({
	open,
	handover,
	target,
	canDeclare,
	onFailed,
	onClose,
}: {
	open: boolean;
	handover: OrderView["handover"];
	target: OrderActionTarget;
	canDeclare: boolean;
	onFailed: () => void;
	onClose: () => void;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const mutation = useHandover(target);
	const form = useForm<HandoverValues>({
		resolver: zodResolver(handoverSchema),
		defaultValues: { code: "" },
	});
	const { errors } = form.formState;

	const errorCode = mutation.error?.code ?? null;
	const locked =
		handover.locked ||
		handover.attemptsLeft <= 0 ||
		errorCode === ERROR_CODES.orderHandoverLocked;
	const wrong = errorCode === ERROR_CODES.orderHandoverCodeInvalid;
	const otherError =
		mutation.error && !wrong && !locked
			? resolveErrorMessage(mutation.error, tRoot, t("actionFailed"))
			: null;

	const close = () => {
		form.reset();
		mutation.reset();
		onClose();
	};

	const onSubmit = form.handleSubmit((values) => {
		mutation.mutate(
			{ code: values.code },
			{
				onSuccess: close,
				onError: () => {
					form.resetField("code");
					onFailed();
				},
			},
		);
	});

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("handoverTitle")}</DialogTitle>
					<DialogDescription>
						{locked ? t("handoverLocked") : t("handoverBody")}
					</DialogDescription>
				</DialogHeader>

				{locked ? (
					<div className="space-y-4 text-sm">
						<div className="space-y-2 rounded-lg bg-[#F8FAFC] p-3 text-[#0F172A]">
							<HandoverFallbacks />
						</div>
						{canDeclare && (
							<DeclareDeliveredForm target={target} onDone={close} />
						)}
					</div>
				) : (
					<form onSubmit={onSubmit} className="space-y-3" noValidate>
						<label className="block space-y-1 text-sm">
							<span className="font-medium text-[#0F172A]">
								{t("handoverCodeLabel")}
							</span>
							<input
								{...form.register("code")}
								inputMode="numeric"
								autoComplete="one-time-code"
								maxLength={4}
								aria-invalid={Boolean(errors.code) || wrong}
								className="h-12 w-full rounded-lg border border-[#E2E8F0] text-center font-mono text-2xl tracking-[0.5em]"
							/>
						</label>
						{errors.code && (
							<p role="alert" className="text-red-700 text-sm">
								{t("handoverCodeFormat")}
							</p>
						)}
						{wrong && (
							<p role="alert" className="font-medium text-red-700 text-sm">
								{t("handoverWrong")}
							</p>
						)}
						{otherError && (
							<p role="alert" className="text-red-700 text-sm">
								{otherError}
							</p>
						)}
						<p className="text-[#64748B] text-sm">
							{t("handoverAttemptsLeft", { count: handover.attemptsLeft })}
						</p>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={close}>
								{t("dismiss")}
							</Button>
							<Button type="submit" disabled={mutation.isPending}>
								{t("handoverSubmit")}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
