"use client";

import { ExternalLink, Loader2, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRevealRiderPhone } from "~/hooks/use-rider-phone";
import { resolveErrorMessage } from "~/lib/apiError";
import {
	type AttemptRow,
	countdownParts,
	formatDeliveryDate,
	type ProofCard,
} from "~/lib/shipment-tracking";
import {
	arrivalClock,
	type BuyerShipmentView,
} from "../../../../../../api/src/contracts/shipments";

/**
 * Who carries the parcel, the provider's ETA and « Appeler le livreur ». The
 * number is never in the view: the call goes through the logged, rate-limited
 * reveal, and a second tap dials the number already in hand.
 */
export function RiderCard({
	shipmentId,
	rider,
	eta,
}: {
	shipmentId: string;
	rider: NonNullable<BuyerShipmentView["rider"]>;
	eta: string | null;
}) {
	const t = useTranslations("Tracking");
	const tRoot = useTranslations();
	const reveal = useRevealRiderPhone(shipmentId);
	const clock = arrivalClock(eta);
	const dial = (phone: string) => {
		window.location.href = `tel:${phone.replace(/[^\d+]/g, "")}`;
	};
	const onCall = () => {
		if (reveal.data?.phone) return dial(reveal.data.phone);
		reveal.mutate(undefined, { onSuccess: ({ phone }) => dial(phone) });
	};
	return (
		<div className="space-y-2 rounded-xl bg-[#EFF6FF] p-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<p className="font-medium text-[#0F172A] text-sm">
						{t("riderName", { name: rider.firstName })}
					</p>
					<p className="text-[#64748B] text-xs">
						{[
							rider.vehicle,
							t(
								rider.kind === "courier" ? "riderKindCourier" : "riderKindShop",
							),
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</div>
				{rider.canCall && (
					<button
						type="button"
						onClick={onCall}
						disabled={reveal.isPending}
						className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white disabled:opacity-70"
					>
						{reveal.isPending ? (
							<Loader2 aria-hidden className="h-4 w-4 animate-spin" />
						) : (
							<Phone aria-hidden className="h-4 w-4" />
						)}
						{t("riderCallCta")}
					</button>
				)}
			</div>
			{clock && (
				<p className="font-semibold text-[#1E40AF] text-sm">
					{t("eta", { time: clock })}
				</p>
			)}
			{reveal.error && (
				<p role="alert" className="text-red-700 text-xs">
					{resolveErrorMessage(reveal.error, tRoot)}
				</p>
			)}
		</div>
	);
}

export function AttemptList({
	rows,
	labelOf,
}: {
	rows: AttemptRow[];
	labelOf: (key: string) => string;
}) {
	const t = useTranslations("Tracking");
	const locale = useLocale() === "en" ? "en" : "fr";
	if (rows.length === 0) return null;
	return (
		<div className="space-y-1">
			<h3 className="font-medium text-[#0F172A] text-sm">
				{t("attemptsTitle")}
			</h3>
			<ul className="space-y-1 text-[#334155] text-sm">
				{rows.map((row) => (
					<li key={row.number}>
						{t("attemptRow", {
							number: row.number,
							date: formatDeliveryDate(row.at, locale),
							reason: labelOf(row.labelKey),
						})}
					</li>
				))}
			</ul>
		</div>
	);
}

export function PickupCard({
	pickup,
	now,
}: {
	pickup: NonNullable<BuyerShipmentView["pickup"]>;
	now: Date;
}) {
	const t = useTranslations("Tracking");
	const locale = useLocale() === "en" ? "en" : "fr";
	const countdown = pickup.pickupDeadline
		? countdownParts(pickup.pickupDeadline, now)
		: null;
	return (
		<div className="space-y-1 rounded-xl border border-[#E2E8F0] p-3 text-sm">
			<h3 className="font-medium text-[#0F172A]">{pickup.locationName}</h3>
			<p className="text-[#334155]">{pickup.landmark}</p>
			{pickup.address && <p className="text-[#64748B]">{pickup.address}</p>}
			{pickup.hours && (
				<p className="text-[#64748B]">
					{t("pickupHours", { hours: pickup.hours })}
				</p>
			)}
			{pickup.pickupDeadline && countdown && (
				<p className="font-medium text-[#92400E]">
					{countdown.unit === "expired"
						? t("countdown.expired")
						: t("pickupDeadline", {
								date: formatDeliveryDate(pickup.pickupDeadline, locale),
								left: t(`countdown.${countdown.unit}`, {
									count: countdown.count,
								}),
							})}
				</p>
			)}
			<a
				href={`https://www.google.com/maps/search/?api=1&query=${pickup.gps.lat},${pickup.gps.lng}`}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex min-h-11 items-center gap-2 text-[#1E40AF]"
			>
				<ExternalLink aria-hidden className="h-4 w-4" /> {t("openInMaps")}
			</a>
		</div>
	);
}

export function ProofSection({
	proof,
	onContest,
}: {
	proof: ProofCard;
	onContest: () => void;
}) {
	const t = useTranslations("Tracking");
	const locale = useLocale() === "en" ? "en" : "fr";
	return (
		<div className="space-y-2 rounded-xl border border-[#E2E8F0] p-3 text-sm">
			<h3 className="font-medium text-[#0F172A]">{t("proofTitle")}</h3>
			<p className="text-[#64748B]">
				{t("proofAt", { date: formatDeliveryDate(proof.at, locale, true) })}
			</p>
			{proof.codeVerified && (
				<p className="font-medium text-[#166534]">{t("proofCodeVerified")}</p>
			)}
			{proof.photoUrl && (
				<a href={proof.photoUrl} target="_blank" rel="noopener noreferrer">
					<img
						src={proof.photoUrl}
						alt={t("proofPhotoAlt")}
						className="h-24 w-24 rounded-lg object-cover"
					/>
				</a>
			)}
			{proof.contestable && (
				<button
					type="button"
					onClick={onContest}
					className="min-h-11 rounded-lg border border-[#CBD5E1] px-4 font-medium text-[#0F172A]"
				>
					{t("contestCta")}
				</button>
			)}
		</div>
	);
}
