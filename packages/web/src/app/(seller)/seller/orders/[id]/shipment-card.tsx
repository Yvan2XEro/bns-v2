"use client";

import { ExternalLink, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useOrderMoney } from "~/hooks/use-order-money";
import { useShipmentRemittance } from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	gpsLink,
	panelActions,
	remittanceNeedsConfirmation,
} from "~/lib/shipment-panel";
import {
	FAILURE_REASON_LABELS,
	type FailureReason,
	shipmentStatusLabel,
} from "~/lib/shipment-status";
import { formatDeliveryDate } from "~/lib/shipment-tracking";
import { can } from "~/lib/shop-roles";
import type { ShopRole } from "~/types";
import type { ShopShipmentView } from "../../../../../../../api/src/contracts/shipments";
import { RiderLinkCard } from "./rider-link-card";
import { ShipmentActions } from "./shipment-actions";

const isReason = (reason: string): reason is FailureReason =>
	reason in FAILURE_REASON_LABELS;

function RemittanceCard({
	shopId,
	orderId,
	shipmentId,
}: {
	shopId: string;
	orderId: string;
	shipmentId: string;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const remit = useShipmentRemittance(shopId, orderId);
	const [note, setNote] = useState("");
	const send = (action: "confirm" | "dispute") =>
		remit.mutate({
			shipmentId,
			action,
			...(note.trim() ? { note: note.trim() } : {}),
		});
	return (
		<div className="space-y-2 rounded-xl bg-warn-faint p-3 text-sm">
			<p className="font-medium text-warn-ink">{t("remittanceDeclared")}</p>
			<input
				aria-label={t("note")}
				value={note}
				onChange={(e) => setNote(e.target.value)}
				maxLength={500}
				className="h-10 w-full rounded-lg border border-line-strong px-3"
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					className="min-h-11"
					disabled={remit.isPending}
					onClick={() => send("confirm")}
				>
					{t("remittanceConfirm")}
				</Button>
				<Button
					variant="outline"
					className="min-h-11"
					disabled={remit.isPending}
					onClick={() => send("dispute")}
				>
					{t("remittanceDispute")}
				</Button>
			</div>
			{remit.isError && (
				<p role="alert" className="text-red-700">
					{resolveErrorMessage(remit.error, tRoot)}
				</p>
			)}
		</div>
	);
}

export function ShipmentCard({
	shopId,
	orderId,
	shipment,
	role,
	cod,
	now,
}: {
	shopId: string;
	orderId: string;
	shipment: ShopShipmentView;
	role: ShopRole | null;
	cod: boolean;
	now: Date;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const actions = panelActions(shipment, {
		costsView: can(role, "costs.view"),
	});
	const attempts = shipment.attempts ?? [];
	const cash = shipment.codCollection;

	return (
		<article className="space-y-4 rounded-xl border border-line bg-surface p-5">
			<header className="flex flex-wrap items-center justify-between gap-2">
				<h3 className="font-semibold text-ink">{shipment.shipmentNumber}</h3>
				<span className="rounded-full bg-[var(--shop-accent-soft,var(--c-brand-soft))] px-3 py-1 font-semibold text-[var(--shop-accent-text,var(--c-brand))] text-xs">
					{tRoot(
						`Delivery.${shipmentStatusLabel("seller", shipment.status, Boolean(shipment.readyForPickupAt))}`,
					)}
				</span>
			</header>
			<p className="text-ink-muted text-sm">
				{t(`carrier.${shipment.carrier}`)} · {t(`method.${shipment.method}`)}
				{shipment.promisedBy &&
					` · ${t("promisedBy", { date: formatDeliveryDate(shipment.promisedBy, locale) })}`}
			</p>
			{shipment.rider?.name && (
				<p className="flex flex-wrap items-center gap-2 text-sm">
					{t("rider", { name: shipment.rider.name })}
					{shipment.rider.phone && (
						<a
							href={`tel:${shipment.rider.phone}`}
							className="inline-flex min-h-11 items-center gap-1 text-[var(--shop-accent-text,var(--c-brand))]"
						>
							<Phone aria-hidden className="h-4 w-4" /> {shipment.rider.phone}
						</a>
					)}
				</p>
			)}
			{shipment.flags && shipment.flags.length > 0 && (
				<ul className="flex flex-wrap gap-2">
					{shipment.flags.map((flag) => (
						<li
							key={flag}
							className="rounded-full bg-warn-soft px-2.5 py-0.5 text-warn-ink text-xs"
						>
							{t(`flag.${flag}`)}
						</li>
					))}
				</ul>
			)}
			{cash?.expectedAmount != null && (
				<p className="text-ink-soft text-sm">
					{t("cod", {
						amount: formatOrderMoney(cash.expectedAmount, locale),
						status: t(
							`remittance.${cash.remittanceStatus ?? "not_applicable"}`,
						),
					})}
				</p>
			)}
			{attempts.length > 0 && (
				<ol className="space-y-1.5 border-line border-l pl-3 text-sm">
					{attempts.map((attempt) => {
						const link = gpsLink(attempt.gps);
						return (
							<li key={attempt.number} className="space-y-0.5">
								<p>
									{t("attemptRow", {
										number: attempt.number,
										date: formatDeliveryDate(attempt.at, locale, true),
										reason: attempt.reason
											? tRoot(
													`Delivery.${FAILURE_REASON_LABELS[isReason(attempt.reason) ? attempt.reason : "other"]}`,
												)
											: "—",
									})}
								</p>
								{attempt.note && (
									<p className="text-ink-muted">{attempt.note}</p>
								)}
								{link && (
									<a
										href={link}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1 text-[var(--shop-accent-text,var(--c-brand))] text-xs"
									>
										<ExternalLink aria-hidden className="h-3 w-3" />{" "}
										{t("openPosition")}
									</a>
								)}
							</li>
						);
					})}
				</ol>
			)}
			{shipment.proof && (
				<div className="space-y-1 text-sm">
					<p className="text-ink-soft">
						{t("proof", {
							method: t(`proofMethod.${shipment.proof.handoverMethod}`),
							date: formatDeliveryDate(shipment.proof.capturedAt, locale, true),
						})}
					</p>
					{shipment.proof.photoUrl && (
						<a
							href={shipment.proof.photoUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							<img
								src={shipment.proof.photoUrl}
								alt={t("proofPhotoAlt")}
								className="h-20 w-20 rounded-lg object-cover"
							/>
						</a>
					)}
				</div>
			)}
			{actions.includes("rider_link") && (
				<RiderLinkCard
					shopId={shopId}
					orderId={orderId}
					shipment={shipment}
					now={now}
				/>
			)}
			{actions.includes("confirm_remittance") &&
				remittanceNeedsConfirmation(shipment) && (
					<RemittanceCard
						shopId={shopId}
						orderId={orderId}
						shipmentId={shipment.id}
					/>
				)}
			<ShipmentActions
				shopId={shopId}
				orderId={orderId}
				shipment={shipment}
				role={role}
				cod={cod}
				now={now}
			/>
		</article>
	);
}
