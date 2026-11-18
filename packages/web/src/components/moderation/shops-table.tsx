"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LevelBadge } from "~/components/shop/level-badge";
import { SHOP_STATUS_LABELS, shopSheetHref } from "~/lib/moderation-shops";
import { cn } from "~/lib/utils";
import { badgeForLevel } from "~/lib/verification";
import type {
	ModerationShopRow,
	ModerationShopStatus,
} from "../../../../api/src/contracts/moderationConsole";

const TH =
	"whitespace-nowrap px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wide";

const STATUS_TONE: Record<ModerationShopStatus, string> = {
	active: "bg-ok-soft text-ok-ink",
	suspended: "bg-bad-soft text-bad-ink",
	closed: "bg-subtle text-ink-soft",
};

export function ShopStatusChip({ status }: { status: ModerationShopStatus }) {
	const t = useTranslations("ModerationConsole");
	return (
		<span
			className={cn(
				"inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs",
				STATUS_TONE[status],
			)}
		>
			{t(SHOP_STATUS_LABELS[status])}
		</span>
	);
}

export function ShopLogo({
	name,
	url,
	size = "sm",
}: {
	name: string;
	url: string | null | undefined;
	size?: "sm" | "lg";
}) {
	const box = size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-xs";
	if (url)
		return (
			// biome-ignore lint/performance/noImgElement: shop logos from arbitrary storage hosts
			<img
				src={url}
				alt=""
				className={cn(
					"shrink-0 rounded-lg border border-line object-cover",
					box,
				)}
			/>
		);
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase())
		.join("");
	return (
		<span
			aria-hidden="true"
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-soft font-bold text-brand",
				box,
			)}
		>
			{initials || "?"}
		</span>
	);
}

/** Shops matching the search: identity, owner, level, standing, open reports, strikes. */
export function ShopsTable({
	shops,
	onOpen,
}: {
	shops: ModerationShopRow[];
	/** A click anywhere on a row opens the sheet; the name stays the keyboard's link. */
	onOpen?: (id: string) => void;
}) {
	const t = useTranslations("ModerationConsole");
	const locale = useLocale();
	const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface">
			<table className="w-full text-left text-sm">
				<thead className="border-line border-b bg-canvas text-ink-muted">
					<tr>
						<th className={TH}>{t("shops.col.shop")}</th>
						<th className={cn(TH, "hidden md:table-cell")}>
							{t("shops.col.owner")}
						</th>
						<th className={cn(TH, "hidden lg:table-cell")}>
							{t("shops.col.level")}
						</th>
						<th className={TH}>{t("shops.col.status")}</th>
						<th className={cn(TH, "text-right")}>{t("shops.col.reports")}</th>
						<th className={cn(TH, "hidden text-right sm:table-cell")}>
							{t("shops.col.strikes")}
						</th>
						<th className={cn(TH, "hidden xl:table-cell")}>
							{t("shops.col.created")}
						</th>
					</tr>
				</thead>
				<tbody>
					{shops.map((shop) => (
						<tr
							key={shop.id}
							onClick={(event) => {
								const target = event.target;
								if (target instanceof Element && target.closest("a")) return;
								onOpen?.(shop.id);
							}}
							className="cursor-pointer border-line border-t align-middle first:border-t-0 hover:bg-canvas"
						>
							<td className="max-w-[16rem] px-3 py-2.5">
								<div className="flex items-center gap-2.5">
									<ShopLogo name={shop.name} url={shop.logoUrl} />
									<div className="min-w-0">
										<Link
											href={shopSheetHref(shop.id)}
											className="block truncate rounded font-semibold text-ink hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
										>
											{shop.name}
										</Link>
										<p className="truncate text-ink-muted text-xs">
											@{shop.handle}
										</p>
									</div>
								</div>
							</td>
							<td className="hidden max-w-[12rem] truncate px-3 py-2.5 text-ink-soft md:table-cell">
								{shop.owner?.name ?? "—"}
							</td>
							<td className="hidden px-3 py-2.5 lg:table-cell">
								<LevelBadge badge={badgeForLevel(shop.level)} size="sm" />
							</td>
							<td className="px-3 py-2.5">
								<ShopStatusChip status={shop.status} />
							</td>
							<td
								className={cn(
									"px-3 py-2.5 text-right font-semibold tabular-nums",
									shop.openReports > 0 ? "text-warn-ink" : "text-ink-muted",
								)}
							>
								{shop.openReports}
							</td>
							<td
								className={cn(
									"hidden px-3 py-2.5 text-right font-semibold tabular-nums sm:table-cell",
									shop.strikes > 0 ? "text-bad-ink" : "text-ink-muted",
								)}
							>
								{shop.strikes}
							</td>
							<td className="hidden whitespace-nowrap px-3 py-2.5 text-ink-muted xl:table-cell">
								{date.format(new Date(shop.createdAt))}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
