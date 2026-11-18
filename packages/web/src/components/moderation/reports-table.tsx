"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AgeChip } from "~/components/moderation/age-chip";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	detailLabel,
	isSelected,
	type QueueSelection,
	targetLabel,
} from "~/lib/moderation-console";
import {
	listingPhotos,
	populated,
	REPORT_STATUS_LABELS,
} from "~/lib/moderation-reports";
import { relativeAge } from "~/lib/moderation-verification";
import { hasListingPrice } from "~/lib/price";
import { cn } from "~/lib/utils";
import type { Listing, Report, Shop, User } from "~/types";
import { TranslatedCode } from "./queue-item-parts";

const TH =
	"whitespace-nowrap px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide";

function rowClass(selected: boolean) {
	return cn(
		"border-line border-t align-top first:border-t-0",
		selected ? "bg-brand-soft" : "hover:bg-canvas",
	);
}

const LINK =
	"block truncate rounded font-semibold text-ink hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand";

export function personName(person: string | User | null | undefined) {
	const user = populated(person);
	return user ? user.name || user.email : null;
}

/** Reports in the current filter: reason, what was reported, who reported it, when. */
export function ReportsTable({
	reports,
	selection,
	panelHref,
	now,
}: {
	reports: Report[];
	selection: QueueSelection | null;
	panelHref: (item: QueueSelection) => string;
	now?: Date;
}) {
	const t = useTranslations("ModerationConsole");
	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface">
			<table className="w-full text-left text-sm">
				<thead className="border-line border-b bg-canvas text-ink-muted">
					<tr>
						<th className={TH}>{t("reports.col.reason")}</th>
						<th className={TH}>{t("reports.col.target")}</th>
						<th className={cn(TH, "hidden md:table-cell")}>
							{t("reports.col.reporter")}
						</th>
						<th className={TH}>{t("reports.col.received")}</th>
						<th className={cn(TH, "hidden lg:table-cell")}>
							{t("reports.col.status")}
						</th>
					</tr>
				</thead>
				<tbody>
					{reports.map((report) => {
						const item = { type: "report" as const, id: report.id };
						const selected = isSelected(item, selection);
						const target = targetLabel(report.targetType);
						return (
							<tr
								key={report.id}
								aria-current={selected ? "true" : undefined}
								className={rowClass(selected)}
							>
								<td className="max-w-[14rem] px-3 py-3">
									<Link href={panelHref(item)} scroll={false} className={LINK}>
										<TranslatedCode
											label={detailLabel("report", report.reason)}
										/>
									</Link>
									{report.description ? (
										<p className="truncate text-ink-muted text-xs">
											{report.description}
										</p>
									) : null}
								</td>
								<td className="px-3 py-3 text-ink-soft">
									{target ? t(target) : report.targetType}
									<p className="font-mono text-[11px] text-ink-muted">
										…{report.targetId.slice(-6)}
									</p>
								</td>
								<td className="hidden max-w-[12rem] truncate px-3 py-3 text-ink-soft md:table-cell">
									{personName(report.reporter) ?? "—"}
								</td>
								<td className="px-3 py-3">
									<AgeChip age={relativeAge(report.createdAt, now)} />
								</td>
								<td className="hidden px-3 py-3 text-ink-soft lg:table-cell">
									{t(REPORT_STATUS_LABELS[report.status])}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

/** Listings submitted for review: photo, title, shop, price, waiting time. */
export function PendingListingsTable({
	listings,
	selection,
	panelHref,
	now,
}: {
	listings: Listing[];
	selection: QueueSelection | null;
	panelHref: (item: QueueSelection) => string;
	now?: Date;
}) {
	const t = useTranslations("ModerationConsole");
	const money = useOrderMoney();
	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface">
			<table className="w-full text-left text-sm">
				<thead className="border-line border-b bg-canvas text-ink-muted">
					<tr>
						<th className={TH}>{t("listings.col.listing")}</th>
						<th className={cn(TH, "hidden md:table-cell")}>
							{t("listings.col.shop")}
						</th>
						<th className={cn(TH, "hidden sm:table-cell")}>
							{t("listings.col.price")}
						</th>
						<th className={TH}>{t("listings.col.submitted")}</th>
					</tr>
				</thead>
				<tbody>
					{listings.map((listing) => {
						const item = { type: "listing" as const, id: listing.id };
						const selected = isSelected(item, selection);
						const cover = listingPhotos(listing)[0];
						const shop = populated<Shop>(listing.shop);
						const seller = personName(listing.seller);
						return (
							<tr
								key={listing.id}
								aria-current={selected ? "true" : undefined}
								className={rowClass(selected)}
							>
								<td className="max-w-[18rem] px-3 py-3">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle">
											{cover ? (
												// biome-ignore lint/performance/noImgElement: thumbnails from arbitrary storage hosts
												<img
													src={cover.thumb}
													alt=""
													className="h-full w-full object-cover"
												/>
											) : (
												<ImageIcon
													aria-hidden="true"
													className="h-4 w-4 text-ink-ghost"
												/>
											)}
										</div>
										<div className="min-w-0">
											<Link
												href={panelHref(item)}
												scroll={false}
												className={LINK}
											>
												{listing.title}
											</Link>
											<p className="truncate text-ink-muted text-xs md:hidden">
												{shop?.name ?? seller ?? ""}
											</p>
										</div>
									</div>
								</td>
								<td className="hidden max-w-[12rem] truncate px-3 py-3 text-ink-soft md:table-cell">
									{shop?.name ?? seller ?? "—"}
								</td>
								<td className="hidden whitespace-nowrap px-3 py-3 text-ink-soft tabular-nums sm:table-cell">
									{hasListingPrice(listing.price) ? money(listing.price) : "—"}
								</td>
								<td className="px-3 py-3">
									<AgeChip age={relativeAge(listing.createdAt, now)} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
