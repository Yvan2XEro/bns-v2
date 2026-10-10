"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ActionDialog } from "~/components/action-dialog";
import { Button } from "~/components/ui/button";
import { useShipmentAction } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatDeliveryDate, rescheduleChoices } from "~/lib/shipment-tracking";
import { useLocaleKey } from "~/lib/use-locale-key";

/** The same slots the buyer is offered; the zone's delivery days are the server's call. */
export function ShipmentRescheduleDialog({
	shopId,
	orderId,
	shipmentId,
	now,
	onClose,
}: {
	shopId: string;
	orderId: string;
	shipmentId: string;
	now: Date;
	onClose: () => void;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const action = useShipmentAction(shopId, orderId);
	const choices = useMemo(() => rescheduleChoices(now), [now]);
	const [slot, setSlot] = useState("");
	const slots = choices.flatMap((day) => day.windows);

	return (
		<ActionDialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={t("rescheduleTitle")}
			description={t("rescheduleBody")}
		>
			<div className="space-y-4">
				<select
					aria-label={t("rescheduleTitle")}
					value={slot}
					onChange={(e) => setSlot(e.target.value)}
					className="flex h-10 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-3 text-sm"
				>
					<option value="">{t("rescheduleChoose")}</option>
					{slots.map((entry) => (
						<option key={entry.iso} value={entry.iso}>
							{formatDeliveryDate(entry.iso, locale)} —{" "}
							{tRoot(`Delivery.window.${entry.window}`)}
						</option>
					))}
				</select>
				{action.isError && (
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(action.error, tRoot)}
					</p>
				)}
				<div className="flex justify-end">
					<Button
						className="min-h-11"
						disabled={!slot || action.isPending}
						onClick={() => {
							const entry = slots.find((s) => s.iso === slot);
							if (!entry) return;
							action.mutate(
								{
									shipmentId,
									action: "reschedule",
									body: { date: entry.iso, window: entry.window },
								},
								{ onSuccess: onClose },
							);
						}}
					>
						{t("confirm")}
					</Button>
				</div>
			</div>
		</ActionDialog>
	);
}
