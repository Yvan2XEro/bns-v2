"use client";

import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import type { OrderAction } from "~/hooks/use-order-actions";
import { usePurchaseShipments } from "~/hooks/use-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	attemptRows,
	formatDeliveryDate,
	proofCard,
	riderCardVisible,
	trackingHeadlineKey,
	trackingSteps,
} from "~/lib/shipment-tracking";
import type { OrderView } from "~/types/order";
import type { BuyerShipmentView } from "../../../../../api/src/contracts/shipments";
import { RescheduleDialog } from "./reschedule-dialog";
import {
	AttemptList,
	PickupCard,
	ProofSection,
	RiderCard,
} from "./tracking-details";
import { TrackingStepper } from "./tracking-stepper";

const ENDED = new Set(["delivered", "returned", "cancelled"]);

function ShipmentCard({
	orderId,
	shipment,
	actions,
	now,
	onContest,
}: {
	orderId: string;
	shipment: BuyerShipmentView;
	actions: readonly OrderAction[];
	now: Date;
	onContest: () => void;
}) {
	const t = useTranslations("Tracking");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const [rescheduling, setRescheduling] = useState(false);
	const proof = proofCard(shipment, actions.includes("contest_delivery"));
	const redelivery = shipment.redelivery;

	return (
		<article className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<header className="space-y-1">
				<h2 className="font-semibold text-[#0F172A]">
					{tRoot(`Delivery.${trackingHeadlineKey(shipment)}`)}
				</h2>
				<p className="text-[#64748B] text-xs">
					{t("shipmentNumber", { number: shipment.shipmentNumber })}
				</p>
				{shipment.promisedBy && !ENDED.has(shipment.status) && (
					<p className="text-[#334155] text-sm">
						{t("promisedBy", {
							date: formatDeliveryDate(shipment.promisedBy, locale),
						})}
					</p>
				)}
			</header>
			<TrackingStepper steps={trackingSteps(shipment)} />
			{riderCardVisible(shipment) && shipment.rider && (
				<RiderCard rider={shipment.rider} />
			)}
			{redelivery && (
				<p className="rounded-xl bg-[#EFF6FF] p-3 text-[#1E40AF] text-sm">
					{t("redeliveryScheduled", {
						date: formatDeliveryDate(redelivery.scheduledFor, locale),
						window: tRoot(`Delivery.window.${redelivery.window}`),
					})}
				</p>
			)}
			<AttemptList
				rows={attemptRows(shipment)}
				labelOf={(key) => tRoot(`Delivery.${key}`)}
			/>
			{shipment.canReschedule && (
				<>
					<Button className="min-h-11" onClick={() => setRescheduling(true)}>
						{t("rescheduleCta")}
					</Button>
					{rescheduling && (
						<RescheduleDialog
							open
							onOpenChange={setRescheduling}
							orderId={orderId}
							shipmentId={shipment.id}
							now={now}
						/>
					)}
				</>
			)}
			{shipment.pickup && <PickupCard pickup={shipment.pickup} now={now} />}
			{shipment.trackingUrl && (
				<a
					href={shipment.trackingUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex min-h-11 items-center gap-2 font-medium text-[#1E40AF] text-sm"
				>
					<ExternalLink aria-hidden className="h-4 w-4" /> {t("trackingLink")}
				</a>
			)}
			{proof && <ProofSection proof={proof} onContest={onContest} />}
		</article>
	);
}

/** Renders what the shipments route serves for the buyer, one card per shipment. */
export function TrackingBlock({
	order,
	actions,
	now,
	onContest,
}: {
	order: OrderView;
	actions: readonly OrderAction[];
	now: Date;
	onContest: () => void;
}) {
	const t = useTranslations("Tracking");
	const tRoot = useTranslations();
	const shipments = usePurchaseShipments(order.id, order.status);
	if (shipments.isError) {
		return (
			<p role="alert" className="text-red-700 text-sm">
				{resolveErrorMessage(shipments.error, tRoot, t("loadError"))}
			</p>
		);
	}
	if (!shipments.data || shipments.data.length === 0) return null;
	return (
		<div className="space-y-3">
			{shipments.data.map((shipment) => (
				<ShipmentCard
					key={shipment.id}
					orderId={order.id}
					shipment={shipment}
					actions={actions}
					now={now}
					onContest={onContest}
				/>
			))}
		</div>
	);
}
