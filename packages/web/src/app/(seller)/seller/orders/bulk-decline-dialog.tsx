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
import { ReasonRadios } from "./[id]/reason-radios";
import {
	NOTE_REQUIRED_REASON,
	optionalNote,
	SELLER_END_REASONS,
	type SellerEndReason,
	type SellerEndValues,
	sellerEndSchema,
} from "./order-forms";

/** One reason and note for every selected order; the caller sends them one by one. */
export function BulkDeclineDialog({
	open,
	count,
	pending,
	onClose,
	onSubmit,
}: {
	open: boolean;
	count: number;
	pending: boolean;
	onClose: () => void;
	onSubmit: (input: { reason: SellerEndReason; note?: string }) => void;
}) {
	const t = useTranslations("SellerOrders");
	const tList = useTranslations("SellerOrderList");
	const form = useForm<SellerEndValues>({
		resolver: zodResolver(sellerEndSchema),
		defaultValues: { note: "" },
	});
	const reason = form.watch("reason");
	const { errors } = form.formState;

	const close = () => {
		form.reset();
		onClose();
	};

	const submit = form.handleSubmit((values) => {
		onSubmit({ reason: values.reason, note: optionalNote(values.note) });
		form.reset();
	});

	return (
		<Dialog open={open} onOpenChange={(next) => !next && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{tList("bulkDeclineTitle", { count })}</DialogTitle>
					<DialogDescription>{tList("bulkDeclineBody")}</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4" noValidate>
					<ReasonRadios
						legend={t("declineReason")}
						name="reason"
						options={SELLER_END_REASONS.map((value) => ({
							value,
							label: t(`reason_${value}`),
						}))}
						register={form.register("reason")}
						error={errors.reason ? t("reasonRequired") : null}
					/>
					<label className="block space-y-1 text-sm">
						<span className="font-medium text-ink">
							{reason === NOTE_REQUIRED_REASON ? t("note") : t("noteOptional")}
						</span>
						<textarea
							{...form.register("note")}
							rows={3}
							maxLength={500}
							aria-invalid={Boolean(errors.note)}
							className="w-full rounded-lg border border-line p-3"
						/>
						{errors.note && (
							<span role="alert" className="block text-red-700">
								{t("noteRequired")}
							</span>
						)}
					</label>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={close}>
							{t("dismiss")}
						</Button>
						<Button type="submit" variant="destructive" disabled={pending}>
							{tList("declineSelected", { count })}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
