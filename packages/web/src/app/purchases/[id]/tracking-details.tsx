"use client";

import { ExternalLink, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
	type AttemptRow,
	countdownParts,
	formatDeliveryDate,
	type ProofCard,
} from "~/lib/shipment-tracking";
import type { BuyerShipmentView } from "../../../../../api/src/contracts/shipments";

export function RiderCard({
	rider,
}: {
	rider: NonNullable<BuyerShipmentView["rider"]>;
}) {
	const t = useTranslations("Tracking");
	return (
		<div className="flex items-center justify-between gap-3 rounded-xl bg-[#EFF6FF] p-3">
			<p className="font-medium text-[#0F172A] text-sm">
				{t("riderName", { name: rider.firstName })}
			</p>
			<a
				href={`tel:${rider.phone}`}
				className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white"
			>
				<Phone aria-hidden className="h-4 w-4" /> {t("riderCall")}
			</a>
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
