"use client";

import { Info, Package, Printer } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useOrderMoney } from "~/hooks/use-order-money";
import { useShopPurchaseOrders } from "~/hooks/use-purchase-orders";
import {
	useDecideResaleLink,
	useResaleLinks,
	useSupplierResaleProducts,
} from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";
import { resaleHref, resaleRules } from "~/lib/resale-hub";
import { cn } from "~/lib/utils";
import type { PurchaseOrderStatus } from "../../../../../../../api/src/contracts/purchaseOrders";
import { initials } from "../catalogue/resale-catalogue-client";

const STATUS_TONE: Record<PurchaseOrderStatus, string> = {
	sent: "bg-warn-soft text-warn-ink",
	accepted:
		"bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]",
	shipped: "bg-[#E0E7FF] text-[#3730A3]",
	delivered: "bg-ok-soft text-ok-ink",
	cancelled: "bg-subtle text-ink-soft",
	returned: "bg-bad-soft text-bad-ink",
};

export function packingSlipUrl(purchaseOrderId: string, locale: string) {
	return `/api/purchase-orders/${encodeURIComponent(purchaseOrderId)}/packing-slip?lang=${locale.startsWith("fr") ? "fr" : "en"}`;
}

export function SupplierOrdersTab({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleHub");
	const locale = useLocale();
	const formatOrderMoney = useOrderMoney();
	const query = useShopPurchaseOrders(shopId, { side: "supplier" });
	const rows = (query.data?.pages ?? []).flatMap((page) => page.docs);

	return (
		<div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_330px]">
			<div className="min-w-0 space-y-3.5">
				<p className="flex gap-2.5 rounded-[10px] border border-[#99F6E4] bg-[#F0FDFA] px-3.5 py-3 text-[#134E4A] text-sm leading-5">
					<Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
					{t("ordersExplainer")}
				</p>
				{query.isPending ? <LoadingRows /> : null}
				{query.isError ? (
					<LoadError
						title={t("ordersLoadError")}
						onRetry={() => void query.refetch()}
					/>
				) : null}
				{query.data && rows.length === 0 ? (
					<p className="rounded-xl border border-line-strong border-dashed bg-surface px-6 py-14 text-center font-medium text-ink-mid">
						{t("ordersEmpty")}
					</p>
				) : null}
				{rows.length > 0 ? (
					<div className="overflow-hidden rounded-xl border border-line bg-surface">
						<div className="overflow-x-auto">
							<table className="w-full min-w-[820px] border-collapse text-left">
								<thead>
									<tr className="border-line border-b bg-canvas text-ink-muted text-xs uppercase tracking-[0.4px]">
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colOrder")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colResellerDelivery")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colItems")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colYourShare")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colToCollect")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colStatus")}
										</th>
										<th className="px-3.5 py-2.5">
											<span className="sr-only">{t("colActions")}</span>
										</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => {
										const detailHref = `/seller/resale/purchase-orders/${encodeURIComponent(row.id)}?side=supplier`;
										const toShip =
											row.status === "sent" || row.status === "accepted";
										const thumbnail =
											row.items.find((item) => item.imageUrl)?.imageUrl ?? null;
										const area = [
											row.deliveryArea?.district,
											row.deliveryArea?.city,
										]
											.filter(Boolean)
											.join(", ");
										return (
											<tr
												key={row.id}
												className="border-subtle border-b text-ink-soft text-sm tabular-nums"
											>
												<td className="px-3.5 py-2.5">
													<Link
														href={detailHref}
														className="whitespace-nowrap font-semibold text-ink hover:underline"
													>
														{row.number}
													</Link>
												</td>
												<td className="px-3.5 py-2.5">
													<span className="flex flex-col gap-0.5">
														<span className="whitespace-nowrap font-medium text-ink">
															{row.counterparty.name}
														</span>
														{area ? (
															<span className="text-ink-muted text-xs">
																{area}
															</span>
														) : null}
													</span>
												</td>
												<td className="px-3.5 py-2.5">
													<span className="flex items-center gap-2.5">
														<span className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-ink-mid">
															{thumbnail ? (
																<Image
																	src={thumbnail}
																	alt=""
																	fill
																	sizes="34px"
																	className="object-cover"
																/>
															) : (
																<Package
																	aria-hidden="true"
																	className="h-[18px] w-[18px]"
																/>
															)}
														</span>
														<span>
															{row.items
																.map(
																	(item) => `${item.title} ×${item.quantity}`,
																)
																.join(", ")}
														</span>
													</span>
												</td>
												<td className="whitespace-nowrap px-3.5 py-2.5">
													{formatOrderMoney(row.supplierAmount)}
												</td>
												<td className="whitespace-nowrap px-3.5 py-2.5 font-bold text-ink">
													{formatOrderMoney(row.collectAmount)}
												</td>
												<td className="px-3.5 py-2.5">
													<span
														className={cn(
															"inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold text-xs",
															STATUS_TONE[row.status],
														)}
													>
														{t(`poStatus_${row.status}`)}
													</span>
												</td>
												<td className="px-3.5 py-2.5 text-right">
													{toShip ? (
														<a
															href={packingSlipUrl(row.id, locale)}
															target="_blank"
															rel="noopener noreferrer"
															className="inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-surface px-3 font-semibold text-[13px] text-ink hover:bg-canvas"
														>
															<Printer aria-hidden="true" className="h-4 w-4" />
															{t("label")}
														</a>
													) : (
														<Link
															href={detailHref}
															className="inline-flex h-[34px] items-center whitespace-nowrap rounded-lg border border-line bg-surface px-3 font-semibold text-[13px] text-ink hover:bg-canvas"
														>
															{row.status === "shipped"
																? t("track")
																: t("open")}
														</Link>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						{query.hasNextPage ? (
							<div className="flex justify-center border-subtle border-t p-3">
								<button
									type="button"
									disabled={query.isFetchingNextPage}
									onClick={() => void query.fetchNextPage()}
									className="h-[34px] rounded-lg border border-line bg-surface px-4 font-semibold text-[13px] disabled:opacity-50"
								>
									{t("loadMore")}
								</button>
							</div>
						) : null}
					</div>
				) : null}
			</div>
			<aside className="space-y-[18px]">
				<RequestsCard shopId={shopId} />
				<RulesCard shopId={shopId} />
			</aside>
		</div>
	);
}

function RequestsCard({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleHub");
	const tRoot = useTranslations();
	const requests = useResaleLinks(shopId, "supplier", "requested");
	const decide = useDecideResaleLink(shopId);
	const docs = requests.data?.docs ?? [];
	const error = decide.error
		? resolveErrorMessage(decide.error, tRoot, t("actionFailed"))
		: null;
	return (
		<section className="rounded-xl border border-line bg-surface">
			<div className="flex items-center justify-between border-subtle border-b px-[18px] py-4">
				<h2 className="font-bold text-base">{t("requestsTitle")}</h2>
				<span className="rounded-full bg-[#E0E7FF] px-2.5 py-0.5 font-semibold text-[#3730A3] text-xs">
					{requests.data?.totalDocs ?? 0}
				</span>
			</div>
			{error ? (
				<p role="alert" className="px-[18px] pt-3 text-red-700 text-sm">
					{error}
				</p>
			) : null}
			{requests.data && docs.length === 0 ? (
				<p className="px-[18px] py-4 text-ink-muted text-sm">
					{t("requestsEmpty")}
				</p>
			) : null}
			{docs.map((link) => (
				<div
					key={link.id}
					className="flex flex-col gap-2 border-subtle border-b px-[18px] py-3 last:border-b-0"
				>
					<div className="flex items-center gap-2.5">
						<span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--shop-accent-soft,var(--c-brand-tint))] font-extrabold text-[var(--shop-accent-text,var(--c-brand))] text-xs">
							{initials(link.partnerShop.name)}
						</span>
						<span className="flex flex-1 flex-col gap-0.5">
							<span className="font-semibold text-sm">
								{link.partnerShop.name}
							</span>
							{link.partnerShop.level ? (
								<span
									className={cn(
										"w-fit rounded-full px-2 py-0.5 font-semibold text-[11px]",
										link.partnerShop.level >= 3
											? "bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)]"
											: link.partnerShop.level === 2
												? "bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]"
												: "bg-subtle text-ink-soft",
									)}
								>
									{t(`levelName_${Math.min(link.partnerShop.level, 3)}`)}
								</span>
							) : null}
						</span>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={decide.isPending}
							onClick={() => {
								if (window.confirm(t("confirmDecline")))
									decide.mutate({ linkId: link.id, action: "decline" });
							}}
							className="h-[34px] rounded-lg border border-line bg-surface px-3 font-semibold text-[13px] text-ink disabled:opacity-50"
						>
							{t("decline")}
						</button>
						<button
							type="button"
							disabled={decide.isPending}
							onClick={() =>
								decide.mutate({ linkId: link.id, action: "approve" })
							}
							className="h-[34px] flex-1 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] font-semibold text-[13px] text-[var(--shop-on-accent,#FFFFFF)] disabled:opacity-50"
						>
							{t("approve")}
						</button>
					</div>
				</div>
			))}
		</section>
	);
}

function RulesCard({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleHub");
	const offered = useSupplierResaleProducts(shopId);
	const rules = resaleRules(offered.data?.products ?? []);
	const handling = rules.handling
		? rules.handling.min === rules.handling.max
			? t("ruleHandling", { hours: rules.handling.min })
			: t("ruleHandlingRange", {
					min: rules.handling.min,
					max: rules.handling.max,
				})
		: "—";
	const approval =
		rules.approval === "all"
			? t("ruleApprovalAll")
			: rules.approval === "none"
				? t("ruleApprovalNone")
				: rules.approval === "mixed"
					? t("rulePerProduct")
					: "—";
	const cod =
		rules.cod === "all"
			? t("ruleYes")
			: rules.cod === "none"
				? t("ruleNo")
				: rules.cod === "mixed"
					? t("rulePerProduct")
					: "—";
	const rows: Array<[string, string]> = [
		[t("ruleMinimum"), t("rulePerProduct")],
		[t("ruleShipping"), handling],
		[t("ruleCod"), cod],
		[t("ruleDefects"), t("ruleDefectsValue")],
		[t("ruleRefusal"), t("ruleRefusalValue")],
		[t("ruleNewResellers"), approval],
	];
	return (
		<section
			id="resale-rules"
			className="scroll-mt-6 rounded-xl border border-line bg-surface"
		>
			<div className="flex items-center justify-between border-subtle border-b px-[18px] py-4">
				<h2 className="font-bold text-base">{t("rulesTitle")}</h2>
				<Link
					href={resaleHref("supplier", "offered")}
					className="font-semibold text-[13px] text-[var(--shop-accent-text,var(--c-brand))]"
				>
					{t("edit")}
				</Link>
			</div>
			<dl>
				{rows.map(([label, value]) => (
					<div
						key={label}
						className="flex justify-between gap-2.5 border-subtle border-b px-[18px] py-2.5 text-sm last:border-b-0"
					>
						<dt className="text-ink-muted">{label}</dt>
						<dd className="text-right font-semibold">{value}</dd>
					</div>
				))}
			</dl>
			{offered.isError ? (
				<p className="px-[18px] pb-3 text-ink-muted text-xs">
					{t("rulesUnavailable")}
				</p>
			) : null}
		</section>
	);
}
