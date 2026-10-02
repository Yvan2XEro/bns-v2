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
import {
	type OrderActionTarget,
	useDeclineOrder,
	useSellerCancelOrder,
} from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	NOTE_REQUIRED_REASON,
	optionalNote,
	SELLER_END_REASONS,
	type SellerEndValues,
	sellerEndSchema,
} from "../order-forms";
import { ReasonRadios } from "./reason-radios";

/**
 * Declining before acceptance and cancelling after it take the same four
 * reasons (`SELLER_END_REASONS`); only the route and the wording differ.
 */
export function DeclineDialog({
	mode,
	open,
	target,
	onClose,
}: {
	mode: "decline" | "seller_cancel";
	open: boolean;
	target: OrderActionTarget;
	onClose: () => void;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const decline = useDeclineOrder(target);
	const cancel = useSellerCancelOrder(target);
	const mutation = mode === "decline" ? decline : cancel;

	const form = useForm<SellerEndValues>({
		resolver: zodResolver(sellerEndSchema),
		defaultValues: { note: "" },
	});
	const reason = form.watch("reason");
	const { errors } = form.formState;

	const close = () => {
		form.reset();
		decline.reset();
		cancel.reset();
		onClose();
	};

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			await mutation.mutateAsync({
				reason: values.reason,
				note: optionalNote(values.note),
			});
			close();
		} catch (error) {
			form.setError("root", {
				type: "server",
				message: resolveErrorMessage(error, tRoot, t("actionFailed")),
			});
		}
	});

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{mode === "decline" ? t("decline") : t("cancelOrder")}
					</DialogTitle>
					<DialogDescription>
						{mode === "decline" ? t("declineBody") : t("cancelBody")}
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="space-y-4" noValidate>
					<ReasonRadios
						legend={
							mode === "decline" ? t("declineReason") : t("cancelOrderReason")
						}
						name="reason"
						options={SELLER_END_REASONS.map((value) => ({
							value,
							label: t(`reason_${value}`),
						}))}
						register={form.register("reason")}
						error={errors.reason ? t("reasonRequired") : null}
					/>
					<label className="block space-y-1 text-sm">
						<span className="font-medium text-[#0F172A]">
							{reason === NOTE_REQUIRED_REASON ? t("note") : t("noteOptional")}
						</span>
						<textarea
							{...form.register("note")}
							rows={3}
							maxLength={500}
							aria-invalid={Boolean(errors.note)}
							className="w-full rounded-lg border border-[#E2E8F0] p-3"
						/>
						{errors.note && (
							<span role="alert" className="block text-red-700">
								{t("noteRequired")}
							</span>
						)}
					</label>
					{errors.root?.message && (
						<p role="alert" className="text-red-700 text-sm">
							{errors.root.message}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={close}>
							{t("dismiss")}
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={mutation.isPending}
						>
							{t("confirm")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
