"use client";

import { ArrowRight, ExternalLink, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { AgeChip } from "~/components/moderation/age-chip";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	useListingDecision,
	useModerationListing,
} from "~/hooks/use-moderation-reports";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	DECISION_TEXT_MAX,
	type ListingAction,
	listingDecisionBody,
	listingPhotos,
	populated,
} from "~/lib/moderation-reports";
import { relativeAge } from "~/lib/moderation-verification";
import { hasListingPrice } from "~/lib/price";
import type { Category, Listing, Shop } from "~/types";
import {
	LISTING_REJECTION_REASONS,
	type ListingRejectionReason,
} from "../../../../api/src/contracts/listingRejection";
import {
	ConfirmApply,
	DecisionOption,
	DecisionText,
	KeyValue,
	PanelError,
	PanelSection,
} from "./console-parts";
import { DetailNotFound } from "./master-detail";
import { QueueTypeBadge } from "./queue-item-parts";
import { PanelLoading } from "./report-panel";
import { personName } from "./reports-table";

export function ListingPanel({
	listingId,
	onDecided,
}: {
	listingId: string;
	onDecided: (id: string) => void;
}) {
	const listing = useModerationListing(listingId);
	if (listing.isPending) return <PanelLoading />;
	if (listing.isError || !listing.data) return <DetailNotFound />;
	return <ListingDetail listing={listing.data} onDecided={onDecided} />;
}

export function ListingDetail({
	listing,
	onDecided,
}: {
	listing: Listing;
	onDecided: (id: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const locale = useLocale();
	const money = useOrderMoney();
	const date = new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const photos = listingPhotos(listing);
	const shop = populated<Shop>(listing.shop);
	const category = populated<Category>(listing.category);
	const seller = personName(listing.seller);
	const link =
		"inline-flex items-center gap-1.5 rounded font-semibold text-brand text-sm hover:underline focus-visible:outline-2 focus-visible:outline-brand";

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<QueueTypeBadge type="listing" />
				<h2 className="break-words font-bold font-heading text-ink text-lg">
					{listing.title}
				</h2>
				{hasListingPrice(listing.price) ? (
					<p className="font-bold font-heading text-brand tabular-nums">
						{money(listing.price)}
					</p>
				) : null}
			</div>

			{photos.length > 0 ? (
				<ul
					aria-label={t("listings.photos", { count: photos.length })}
					className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
				>
					{photos.map((photo) => (
						<li key={photo.key} className="shrink-0">
							<a
								href={photo.url}
								target="_blank"
								rel="noreferrer"
								className="block overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-brand"
							>
								{/* biome-ignore lint/performance/noImgElement: listing photos from arbitrary storage hosts */}
								<img
									src={photo.thumb}
									alt={t("listings.photoAlt", { title: listing.title })}
									className="h-28 w-36 object-cover"
								/>
							</a>
						</li>
					))}
				</ul>
			) : (
				<div className="flex h-20 items-center justify-center gap-2 rounded-lg border border-line border-dashed text-ink-muted text-sm">
					<ImageIcon aria-hidden="true" className="h-4 w-4" />
					{t("listings.noPhotos")}
				</div>
			)}

			<dl className="space-y-2">
				{category ? (
					<KeyValue label={t("listings.category")}>{category.name}</KeyValue>
				) : null}
				<KeyValue label={t("listings.shop")}>
					{shop ? (
						<Link
							href={`/moderation/shops/${encodeURIComponent(shop.id)}`}
							className={link}
						>
							{shop.name}
							<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
						</Link>
					) : (
						(seller ?? "—")
					)}
				</KeyValue>
				{shop && seller ? (
					<KeyValue label={t("listings.seller")}>{seller}</KeyValue>
				) : null}
				<KeyValue label={t("listings.submitted")}>
					<span className="inline-flex flex-wrap items-center justify-end gap-2">
						{date.format(new Date(listing.createdAt))}
						<AgeChip age={relativeAge(listing.createdAt)} />
					</span>
				</KeyValue>
			</dl>

			<PanelSection title={t("listings.description")}>
				<p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-canvas p-3 text-ink text-sm">
					{listing.description}
				</p>
			</PanelSection>

			<a
				href={`/listing/${encodeURIComponent(listing.id)}`}
				target="_blank"
				rel="noreferrer"
				className={link}
			>
				{t("reports.openPublic")}
				<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
			</a>

			{listing.status === "pending" ? (
				<ListingDecisionForm listingId={listing.id} onDecided={onDecided} />
			) : (
				<p className="rounded-lg border border-line bg-canvas px-3 py-2 text-ink-soft text-sm">
					{t("listings.notPending", {
						status: t(`reports.listingStatus.${listing.status}`),
					})}
				</p>
			)}
		</div>
	);
}

function ListingDecisionForm({
	listingId,
	onDecided,
}: {
	listingId: string;
	onDecided: (id: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const decision = useListingDecision();
	const [action, setAction] = useState<ListingAction>("approve");
	const tReason = useTranslations("ListingRejection");
	const [reasonCode, setReasonCode] = useState<ListingRejectionReason | "">("");
	const [message, setMessage] = useState("");
	const [note, setNote] = useState("");
	const [confirming, setConfirming] = useState(false);
	const [touched, setTouched] = useState(false);
	const checked = listingDecisionBody(action, reasonCode, message, note);
	const name = `listing-action-${listingId}`;

	const choose = (value: string) => {
		setAction(value === "reject" ? "reject" : "approve");
		setConfirming(false);
	};

	return (
		<PanelSection
			title={t("decision.title")}
			className="border-line border-t pt-4"
		>
			<fieldset className="space-y-2">
				<legend className="sr-only">{t("decision.title")}</legend>
				<DecisionOption
					name={name}
					value="approve"
					checked={action === "approve"}
					onChange={choose}
					title={t("listings.decision.approve")}
					body={t("listings.decision.approveBody")}
				/>
				<DecisionOption
					name={name}
					value="reject"
					checked={action === "reject"}
					onChange={choose}
					title={t("listings.decision.reject")}
					body={t("listings.decision.rejectBody")}
					tone="danger"
				/>
			</fieldset>
			{action === "reject" ? (
				<>
					<div className="space-y-1.5">
						<Label htmlFor={`${name}-reason`}>
							{t("listings.decision.reason")}
						</Label>
						<Select
							value={reasonCode}
							onValueChange={(value) => {
								setReasonCode(
									LISTING_REJECTION_REASONS.find((code) => code === value) ??
										"",
								);
								setConfirming(false);
							}}
						>
							<SelectTrigger id={`${name}-reason`}>
								<SelectValue
									placeholder={t("listings.decision.reasonPlaceholder")}
								/>
							</SelectTrigger>
							<SelectContent>
								{LISTING_REJECTION_REASONS.map((code) => (
									<SelectItem key={code} value={code}>
										{tReason(code)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<DecisionText
						id={`${name}-message`}
						label={t("listings.decision.message")}
						value={message}
						onChange={(value) => {
							setMessage(value);
							setConfirming(false);
						}}
						required={reasonCode === "other"}
						max={DECISION_TEXT_MAX}
						placeholder={t("listings.decision.messagePlaceholder")}
						error={
							touched && !checked.ok
								? t("listings.decision.reasonRequired")
								: null
						}
					/>
				</>
			) : null}
			<DecisionText
				id={`${name}-note`}
				label={t("listings.decision.note")}
				value={note}
				onChange={(value) => {
					setNote(value);
					setConfirming(false);
				}}
				required={false}
				max={DECISION_TEXT_MAX}
			/>
			{decision.isError ? (
				<PanelError error={decision.error} fallback={t("decision.failed")} />
			) : null}
			<ConfirmApply
				confirming={confirming}
				pending={decision.isPending}
				danger={action === "reject"}
				applyLabel={t("decision.apply")}
				confirmText={
					action === "approve"
						? t("listings.decision.confirmApprove")
						: t("listings.decision.confirmReject")
				}
				confirmLabel={t("decision.confirm")}
				onApply={() => {
					setTouched(true);
					if (checked.ok) setConfirming(true);
				}}
				onCancel={() => setConfirming(false)}
				onConfirm={() => {
					if (!checked.ok) return;
					decision.mutate(
						{ id: listingId, body: checked.body },
						{ onSuccess: () => onDecided(listingId) },
					);
				}}
			/>
			<p className="text-ink-muted text-xs">{t("decision.logged")}</p>
		</PanelSection>
	);
}
