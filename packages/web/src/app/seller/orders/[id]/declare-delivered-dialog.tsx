"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	type OrderActionTarget,
	useDeclareDelivered,
} from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type DeclareDeliveredValues,
	declareDeliveredSchema,
	optionalNote,
} from "../order-forms";

/**
 * "Déclarer livrée" with its weaker-proof warning, always shown together:
 * a declaration opens the buyer's 48-hour contest window, which a code does
 * not. Used on its own and inside the handover dialog once the code locks.
 */
export function DeclareDeliveredForm({
	target,
	onDone,
}: {
	target: OrderActionTarget;
	onDone: () => void;
}) {
	const t = useTranslations("SellerOrders");
	const tRoot = useTranslations();
	const declare = useDeclareDelivered(target);
	const form = useForm<DeclareDeliveredValues>({
		resolver: zodResolver(declareDeliveredSchema),
		defaultValues: { note: "" },
	});
	const { errors } = form.formState;

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			await declare.mutateAsync({ note: optionalNote(values.note) });
			form.reset();
			onDone();
		} catch (error) {
			form.setError("root", {
				type: "server",
				message: resolveErrorMessage(error, tRoot, t("actionFailed")),
			});
		}
	});

	return (
		<form onSubmit={onSubmit} className="space-y-3" noValidate>
			<p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
				<AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
				{t("declareWarning")}
			</p>
			<label className="block space-y-1 text-sm">
				<span className="font-medium text-[#0F172A]">{t("noteOptional")}</span>
				<textarea
					{...form.register("note")}
					rows={2}
					maxLength={500}
					className="w-full rounded-lg border border-[#E2E8F0] p-3"
				/>
			</label>
			{errors.root?.message && (
				<p role="alert" className="text-red-700 text-sm">
					{errors.root.message}
				</p>
			)}
			<Button
				type="submit"
				variant="outline"
				className="min-h-11 w-full"
				disabled={declare.isPending}
			>
				{t("declareDelivered")}
			</Button>
		</form>
	);
}

export function DeclareDeliveredDialog({
	open,
	target,
	onClose,
}: {
	open: boolean;
	target: OrderActionTarget;
	onClose: () => void;
}) {
	const t = useTranslations("SellerOrders");
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("declareDelivered")}</DialogTitle>
					<DialogDescription>{t("declareDeliveredBody")}</DialogDescription>
				</DialogHeader>
				{open && <DeclareDeliveredForm target={target} onDone={onClose} />}
			</DialogContent>
		</Dialog>
	);
}
