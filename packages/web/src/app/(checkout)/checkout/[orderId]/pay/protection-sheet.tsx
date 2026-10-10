"use client";

import { useTranslations } from "next-intl";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";

/**
 * "What does protection cover?" — the spec's disclosure copy, verbatim and
 * unparametrised (the fee line itself lives beside the call site, since it
 * is the one sentence here that carries `{rate}`/`{min}`).
 */
export function ProtectionSheet({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("Payments");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{t("sheet_title")}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3 text-[#334155] text-sm leading-relaxed">
					<p>{t("disclosure_holder")}</p>
					<p>{t("sheet_release")}</p>
					<p>{t("sheet_cancelRefund")}</p>
					<p>{t("sheet_feeRefund")}</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}
