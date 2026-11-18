"use client";

import { useTranslations } from "next-intl";
import { ActionDialog, type DialogControl } from "~/components/action-dialog";
import { Button } from "~/components/ui/button";
import { useConfirmReceipt } from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";

export function ConfirmReceiptDialog({
	orderId,
	...control
}: DialogControl & { orderId: string }) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const confirm = useConfirmReceipt({ orderId });

	return (
		<ActionDialog
			{...control}
			title={t("confirmReceipt")}
			description={t("confirmReceiptBody")}
		>
			{confirm.isError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(confirm.error, tRoot)}
				</p>
			)}
			<div className="flex flex-wrap justify-end gap-2">
				<Button
					variant="outline"
					className="min-h-11"
					onClick={() => control.onOpenChange(false)}
				>
					{t("dismiss")}
				</Button>
				<Button
					className="min-h-11"
					disabled={confirm.isPending}
					onClick={() =>
						confirm.mutate(undefined, {
							onSuccess: () => control.onOpenChange(false),
						})
					}
				>
					{t("confirmReceiptSubmit")}
				</Button>
			</div>
		</ActionDialog>
	);
}
