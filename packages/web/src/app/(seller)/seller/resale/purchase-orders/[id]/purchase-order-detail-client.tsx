"use client";

import {
	Clock,
	MapPin,
	MessageSquare,
	PackageCheck,
	Printer,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useReducer } from "react";
import { Confirm } from "~/components/callable/confirm";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { WorkspaceBreadcrumb } from "~/components/seller/workspace-breadcrumb";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	usePurchaseOrder,
	usePurchaseOrderAction,
} from "~/hooks/use-purchase-orders";
import { useStartShopConversation } from "~/hooks/use-shop-inbox";
import { resolveErrorMessage } from "~/lib/apiError";
import { personalConversationHref } from "~/lib/nav";
import { formatOrderDate } from "~/lib/order-money";
import { resaleHref } from "~/lib/resale-hub";
import type { PurchaseOrderView } from "../../../../../../../../api/src/contracts/purchaseOrders";

type Side = "supplier" | "reseller";
type SupplierCancelReason =
	| "seller_out_of_stock"
	| "seller_cannot_deliver"
	| "seller_other";
type DeliveryFailureReason =
	| "refused"
	| "unreachable"
	| "absent"
	| "address_not_found"
	| "timeout"
	| "other";
interface State {
	condition: "resellable" | "damaged";
	cancelReason: SupplierCancelReason;
	cancelNote: string;
	carrier: "own_courier" | "yango" | "other";
	trackingNumber: string;
	trackingUrl: string;
	handoverCode: string;
	deliveryFailureReason: DeliveryFailureReason;
	failedDeliveryCost: string;
	deliveryFailureNote: string;
	deliveryNote: string;
}
function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function PurchaseOrderDetailClient({
	shopId,
	purchaseOrderId,
	side,
}: {
	shopId: string;
	purchaseOrderId: string;
	side: Side;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("SellerResale");
	const tHub = useTranslations("SellerResaleHub");
	const tRoot = useTranslations();
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const { deliveryZonesEnabled } = useAppConfig();
	const [state, patch] = useReducer(reducer, {
		condition: "resellable",
		cancelReason: "seller_out_of_stock",
		cancelNote: "",
		carrier: "own_courier",
		trackingNumber: "",
		trackingUrl: "",
		handoverCode: "",
		deliveryFailureReason: "refused",
		failedDeliveryCost: "0",
		deliveryFailureNote: "",
		deliveryNote: "",
	});
	const query = usePurchaseOrder(shopId, purchaseOrderId);
	const action = usePurchaseOrderAction(shopId);
	const startConversation = useStartShopConversation();
	const order = query.data;
	const statusLabels: Record<PurchaseOrderView["status"], string> = {
		sent: t("status.sent"),
		accepted: t("status.accepted"),
		shipped: t("status.shipped"),
		delivered: t("status.delivered"),
		cancelled: t("status.cancelled"),
		returned: t("status.returned"),
	};
	const actionError =
		action.error || startConversation.error
			? resolveErrorMessage(
					action.error ?? startConversation.error,
					tRoot,
					t("actionFailed"),
				)
			: null;

	if (query.isPending) return <LoadingRows />;
	if (query.isError || !order) {
		return (
			<LoadError
				title={t("detailsUnavailable")}
				onRetry={() => void query.refetch()}
			/>
		);
	}

	const gps = order.delivery.gps;
	const mapsUrl = gps
		? `https://www.google.com/maps?q=${gps.lat},${gps.lng}`
		: null;
	const canAccept = side === "supplier" && order.status === "sent";
	const canCancel =
		side === "supplier" &&
		(order.status === "sent" || order.status === "accepted");
	const canShip = side === "supplier" && order.status === "accepted";
	const canHandover = side === "supplier" && order.status === "shipped";
	const canDeclareDelivered = canHandover;
	const canReportDeliveryFailure = canHandover && !deliveryZonesEnabled;
	const canReceiveReturn = side === "supplier" && order.status === "returned";
	const slipUrl = `/api/purchase-orders/${encodeURIComponent(order.id)}/packing-slip?lang=${locale}`;

	return (
		<div className="space-y-6">
			<WorkspaceBreadcrumb
				section="resale"
				href={
					side === "supplier"
						? resaleHref("supplier", "orders")
						: "/seller/resale/purchase-orders?side=reseller"
				}
				reference={order.number}
			/>

			<header className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2.5">
						<h1 className="font-extrabold text-[28px] text-ink tracking-tight">
							{order.number}
						</h1>
						<span className="rounded-full bg-[var(--shop-accent-soft,var(--c-brand-tint))] px-2.5 py-0.5 font-semibold text-[var(--shop-accent-text,var(--c-brand))] text-xs">
							{statusLabels[order.status]}
						</span>
					</div>
					<p className="text-ink-muted text-sm">
						{[
							tHub("receivedOn", {
								date: formatOrderDate(order.sentAt, locale),
							}),
							order.status === "sent" || order.status === "accepted"
								? tHub("shipBefore", {
										date: formatOrderDate(
											order.shipBy ?? order.acceptBy,
											locale,
										),
									})
								: null,
							side === "reseller" ? order.branding.name : null,
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</div>
				<a
					href={slipUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-semibold text-ink text-sm hover:bg-canvas"
				>
					<Printer aria-hidden="true" className="h-4 w-4" />
					{tHub("printLabel")}
				</a>
			</header>

			{actionError && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"
				>
					{actionError}
				</p>
			)}

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.8fr)]">
				<div className="space-y-5">
					<section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="font-bold text-ink">{tHub("itemsAndAmounts")}</h2>
							<span className="rounded-full bg-subtle px-2.5 py-0.5 font-semibold text-ink-soft text-xs">
								{tHub(
									order.paymentMethod === "cod"
										? "paymentCod"
										: "paymentMobileMoney",
								)}
							</span>
						</div>
						<ul className="divide-y divide-line">
							{order.items.map((item) => (
								<li
									key={
										typeof item.orderItem === "object"
											? item.orderItem.id
											: item.orderItem
									}
									className="flex flex-wrap items-center justify-between gap-3 py-3"
								>
									<div>
										<p className="font-semibold text-ink">
											{item.title}
											<span className="font-normal text-ink-muted">
												{" "}
												×{item.quantity}
											</span>
										</p>
										<p className="mt-1 text-ink-muted text-sm">
											{[item.sku, item.variantLabel]
												.filter(Boolean)
												.join(" · ")}
										</p>
									</div>
									{side === "supplier" ? (
										<p className="text-right text-ink-soft text-sm">
											<span className="font-semibold">
												{formatOrderMoney(item.supplierUnitPrice, locale)} ×{" "}
												{item.quantity}
											</span>
											<span className="block text-ink-muted text-xs">
												{tHub("supplierPriceShort")}
											</span>
										</p>
									) : null}
								</li>
							))}
						</ul>
						<dl className="space-y-2 rounded-xl bg-canvas p-4 text-sm">
							{order.items.map((item) => (
								<div
									key={`sale-${typeof item.orderItem === "object" ? item.orderItem.id : item.orderItem}`}
									className="flex justify-between gap-3"
								>
									<dt className="text-ink-muted">
										{item.title} ·{" "}
										{formatOrderMoney(item.resellerUnitPrice, locale)} ×{" "}
										{item.quantity}
									</dt>
									<dd className="font-semibold tabular-nums">
										{formatOrderMoney(
											item.resellerUnitPrice * item.quantity,
											locale,
										)}
									</dd>
								</div>
							))}
							<div className="flex justify-between gap-3">
								<dt className="text-ink-muted">{tHub("delivery")}</dt>
								<dd className="font-semibold tabular-nums">
									{formatOrderMoney(order.deliveryFee, locale)}
								</dd>
							</div>
							<div className="flex justify-between gap-3 border-line border-t pt-2">
								<dt className="font-semibold text-ink">
									{order.paymentMethod === "cod"
										? tHub("collectOnHandover")
										: tHub("orderTotal")}
								</dt>
								<dd className="font-bold text-ink tabular-nums">
									{formatOrderMoney(order.collectAmount, locale)}
								</dd>
							</div>
						</dl>
						{side === "supplier" && order.supplierAmount !== null ? (
							<div className="space-y-2 text-sm">
								<h3 className="font-semibold text-ink">{tHub("split")}</h3>
								<dl className="space-y-1.5">
									<div className="flex justify-between gap-3">
										<dt className="text-ink-muted">{tHub("splitSupplier")}</dt>
										<dd className="font-semibold tabular-nums">
											{formatOrderMoney(order.supplierAmount, locale)}
										</dd>
									</div>
									<div className="flex justify-between gap-3">
										<dt className="text-ink-muted">{tHub("splitDelivery")}</dt>
										<dd className="font-semibold tabular-nums">
											{formatOrderMoney(order.deliveryFee, locale)}
										</dd>
									</div>
									{order.platformCommission !== null &&
									order.resellerCommission !== null ? (
										<div className="flex justify-between gap-3">
											<dt className="text-ink-muted">
												{tHub("splitBilled")}
												<span className="block text-xs">
													{tHub("splitBilledNote")}
												</span>
											</dt>
											<dd className="font-semibold tabular-nums">
												{formatOrderMoney(
													order.platformCommission + order.resellerCommission,
													locale,
												)}
											</dd>
										</div>
									) : null}
								</dl>
							</div>
						) : null}
					</section>
					{order.statusHistory?.length ? (
						<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
							<h2 className="font-bold text-ink">{tHub("timeline")}</h2>
							<ol className="space-y-3 border-line border-l-2 pl-4">
								{order.statusHistory.map((entry, index) => (
									<li
										key={`${entry.status}-${entry.at}-${index}`}
										className="text-sm"
									>
										<p className="font-semibold text-ink">
											{entry.status in statusLabels
												? statusLabels[
														entry.status as PurchaseOrderView["status"]
													]
												: entry.status}
										</p>
										<p className="text-ink-muted text-xs">
											{formatOrderDate(entry.at, locale)}
										</p>
									</li>
								))}
							</ol>
						</section>
					) : null}
				</div>

				<aside className="space-y-4">
					{side === "supplier" && order.reseller ? (
						<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
							<h2 className="font-bold text-ink">{tHub("resellerCard")}</h2>
							<div className="flex flex-col gap-0.5">
								<p className="font-semibold text-ink">{order.reseller.name}</p>
								{order.reseller.level > 0 ? (
									<span className="w-fit rounded-full bg-[var(--shop-accent-soft,var(--c-brand-tint))] px-2 py-0.5 font-semibold text-[11px] text-[var(--shop-accent-text,var(--c-brand))]">
										{tHub("levelBadge", { level: order.reseller.level })}
									</span>
								) : null}
							</div>
							{order.reseller.orderNumber ? (
								<p className="text-ink-mid text-sm">
									{order.reseller.orderedAt
										? tHub("customerOrder", {
												number: order.reseller.orderNumber,
												date: formatOrderDate(order.reseller.orderedAt, locale),
											})
										: tHub("customerOrderNumber", {
												number: order.reseller.orderNumber,
											})}
								</p>
							) : null}
							{order.reseller.phone ? (
								<p className="text-ink-mid text-sm">
									{tHub("resellerContact", { phone: order.reseller.phone })}
								</p>
							) : null}
							{order.reseller.reachable ? (
								<p className="flex items-center gap-1.5 text-ink-mid text-sm">
									<Clock aria-hidden="true" className="h-4 w-4" />
									{tHub("reachableFromTo", order.reseller.reachable)}
								</p>
							) : null}
							<button
								type="button"
								disabled={startConversation.isPending}
								onClick={() => {
									const resellerShopId = order.reseller?.shopId;
									if (!resellerShopId) return;
									// Opened before the request so the browser does not block it.
									const tab = window.open("", "_blank");
									startConversation.mutate(resellerShopId, {
										onSuccess: ({ conversationId }) => {
											const href = personalConversationHref(conversationId);
											if (tab) tab.location.href = href;
											else window.location.assign(href);
										},
										onError: () => tab?.close(),
									});
								}}
								className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-ink text-sm hover:bg-canvas disabled:opacity-50"
							>
								<MessageSquare aria-hidden="true" className="h-4 w-4" />
								{tHub("writeToReseller")}
							</button>
						</section>
					) : null}
					<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
						<h2 className="font-bold text-ink">{t("recipient")}</h2>
						<p className="font-medium text-ink-soft">
							{order.delivery.recipientName}
						</p>
						<p className="text-ink-mid text-sm">
							{t("phone")}: {order.delivery.phone}
							{order.delivery.phoneMasked ? ` · ${t("phoneMasked")}` : ""}
						</p>
						<p className="text-ink-mid text-sm">
							{t("address")}:{" "}
							{[order.delivery.district, order.delivery.city]
								.filter(Boolean)
								.join(", ") || t("notProvided")}
							{order.delivery.landmark ? ` · ${order.delivery.landmark}` : ""}
						</p>
						{order.delivery.instructions && (
							<p className="text-ink-muted text-sm">
								{t("instructions")}: {order.delivery.instructions}
							</p>
						)}
						{mapsUrl && (
							<a
								href={mapsUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--shop-accent-text,#1D4ED8)] text-sm"
							>
								<MapPin aria-hidden="true" className="h-4 w-4" />
								{t("address")}
							</a>
						)}
					</section>

					<section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
						<h2 className="font-bold text-ink">{t("deadline")}</h2>
						<p className="text-ink-mid text-sm">
							{formatOrderDate(order.shipBy ?? order.acceptBy, locale)}
						</p>
						{canAccept && (
							<button
								type="button"
								disabled={action.isPending}
								onClick={() =>
									action.mutate({ purchaseOrderId, action: "accept" })
								}
								className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-warn-ink-soft px-4 font-semibold text-sm text-white hover:bg-warn-ink disabled:opacity-50"
							>
								<PackageCheck aria-hidden="true" className="h-4 w-4" />
								{t("acceptAction")}
							</button>
						)}
						{canShip && (
							<div className="space-y-3 border-line border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("carrier")}
									</span>
									<select
										value={state.carrier}
										onChange={(event) => {
											const carrier = event.target.value;
											if (
												carrier === "own_courier" ||
												carrier === "yango" ||
												carrier === "other"
											)
												patch({ carrier });
										}}
										className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
									>
										<option value="own_courier">{t("carrierOwn")}</option>
										<option value="yango">Yango</option>
										<option value="other">{t("carrierOther")}</option>
									</select>
								</label>
								{state.carrier !== "own_courier" ? (
									<label className="block space-y-1 text-sm">
										<span className="font-medium text-ink-soft">
											{t("trackingNumber")}
										</span>
										<input
											value={state.trackingNumber}
											onChange={(event) =>
												patch({ trackingNumber: event.target.value })
											}
											maxLength={120}
											className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
										/>
									</label>
								) : null}
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("trackingUrl")}
									</span>
									<input
										type="url"
										value={state.trackingUrl}
										onChange={(event) =>
											patch({ trackingUrl: event.target.value })
										}
										maxLength={500}
										className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
									/>
								</label>
								<button
									type="button"
									disabled={
										action.isPending ||
										(state.carrier !== "own_courier" &&
											!state.trackingNumber.trim())
									}
									onClick={() =>
										action.mutate({
											purchaseOrderId,
											action: "ship",
											body: {
												carrier: state.carrier,
												trackingNumber:
													state.trackingNumber.trim() || undefined,
												trackingUrl: state.trackingUrl.trim() || undefined,
											},
										})
									}
									className="min-h-11 w-full rounded-xl bg-night px-4 font-semibold text-sm text-white hover:bg-ink-soft disabled:opacity-50"
								>
									{t("shipAction")}
								</button>
							</div>
						)}
						{canHandover && (
							<div className="space-y-3 border-line border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("handoverCode")}
									</span>
									<input
										inputMode="numeric"
										value={state.handoverCode}
										onChange={(event) =>
											patch({
												handoverCode: event.target.value
													.replace(/\D/g, "")
													.slice(0, 8),
											})
										}
										className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
									/>
								</label>
								<button
									type="button"
									disabled={action.isPending || state.handoverCode.length < 4}
									onClick={() =>
										action.mutate({
											purchaseOrderId,
											action: "handover",
											body: { code: state.handoverCode },
										})
									}
									className="min-h-11 w-full rounded-xl bg-night px-4 font-semibold text-sm text-white hover:bg-ink-soft disabled:opacity-50"
								>
									{t("confirmHandover")}
								</button>
							</div>
						)}
						{canDeclareDelivered && (
							<div className="space-y-3 border-line border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("declareDeliveredNote")}
									</span>
									<textarea
										value={state.deliveryNote}
										onChange={(event) =>
											patch({ deliveryNote: event.target.value })
										}
										maxLength={500}
										className="min-h-20 w-full rounded-lg border border-line-strong bg-surface p-3"
									/>
								</label>
								<button
									type="button"
									disabled={action.isPending}
									onClick={() =>
										action.mutate({
											purchaseOrderId,
											action: "declare-delivered",
											body: { note: state.deliveryNote.trim() || undefined },
										})
									}
									className="min-h-11 w-full rounded-xl border border-line-strong px-4 font-semibold text-ink-soft text-sm hover:bg-canvas disabled:opacity-50"
								>
									{t("declareDeliveredAction")}
								</button>
							</div>
						)}
						{canReportDeliveryFailure && (
							<div className="space-y-3 border-line border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("deliveryFailureReason")}
									</span>
									<select
										value={state.deliveryFailureReason}
										onChange={(event) => {
											const value = event.target.value;
											if (
												[
													"refused",
													"unreachable",
													"absent",
													"address_not_found",
													"timeout",
													"other",
												].includes(value)
											)
												patch({
													deliveryFailureReason: value as DeliveryFailureReason,
												});
										}}
										className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
									>
										{(
											[
												"refused",
												"unreachable",
												"absent",
												"address_not_found",
												"timeout",
												"other",
											] as const
										).map((reason) => (
											<option key={reason} value={reason}>
												{t(`deliveryFailure.${reason}`)}
											</option>
										))}
									</select>
								</label>
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("failedDeliveryCost", {
											max: formatOrderMoney(order.deliveryFee, locale),
										})}
									</span>
									<input
										inputMode="numeric"
										value={state.failedDeliveryCost}
										onChange={(event) =>
											patch({
												failedDeliveryCost: event.target.value
													.replace(/\D/g, "")
													.slice(0, 10),
											})
										}
										className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
									/>
								</label>
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("deliveryFailureNote")}
									</span>
									<textarea
										value={state.deliveryFailureNote}
										onChange={(event) =>
											patch({ deliveryFailureNote: event.target.value })
										}
										maxLength={500}
										className="min-h-20 w-full rounded-lg border border-line-strong bg-surface p-3"
									/>
								</label>
								<button
									type="button"
									disabled={
										action.isPending ||
										Number(state.failedDeliveryCost) > order.deliveryFee ||
										(state.deliveryFailureReason === "other" &&
											!state.deliveryFailureNote.trim())
									}
									onClick={() =>
										action.mutate({
											purchaseOrderId,
											action: "delivery-failed",
											body: {
												reason: state.deliveryFailureReason,
												failedDeliveryCost: Number(state.failedDeliveryCost),
												note: state.deliveryFailureNote.trim() || undefined,
											},
										})
									}
									className="min-h-11 w-full rounded-xl border border-red-200 px-4 font-semibold text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
								>
									{t("reportDeliveryFailure")}
								</button>
							</div>
						)}
						{canCancel && (
							<div className="space-y-3 border-line border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("cancelReason")}
									</span>
									<select
										value={state.cancelReason}
										onChange={(event) => {
											const reason = event.target.value;
											if (
												reason === "seller_out_of_stock" ||
												reason === "seller_cannot_deliver" ||
												reason === "seller_other"
											)
												patch({ cancelReason: reason });
										}}
										className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
									>
										<option value="seller_out_of_stock">
											{t("reasonOutOfStock")}
										</option>
										<option value="seller_cannot_deliver">
											{t("reasonCannotDeliver")}
										</option>
										<option value="seller_other">{t("reasonOther")}</option>
									</select>
								</label>
								{state.cancelReason === "seller_other" ? (
									<label className="block space-y-1 text-sm">
										<span className="font-medium text-ink-soft">
											{t("cancelNote")}
										</span>
										<textarea
											value={state.cancelNote}
											onChange={(event) =>
												patch({ cancelNote: event.target.value })
											}
											maxLength={500}
											required
											className="min-h-24 w-full rounded-lg border border-line-strong bg-surface p-3"
										/>
									</label>
								) : null}
								<button
									type="button"
									disabled={
										action.isPending ||
										(state.cancelReason === "seller_other" &&
											!state.cancelNote.trim())
									}
									onClick={async () => {
										const confirmed = await Confirm.call({
											title: t("cancelAction"),
											message: t("confirmCancelBody"),
											confirmLabel: t("cancelAction"),
											tone: "danger",
										});
										if (!confirmed) return;
										action.mutate({
											purchaseOrderId,
											action: "cancel",
											body: {
												reason: state.cancelReason,
												note: state.cancelNote.trim() || undefined,
											},
										});
									}}
									className="min-h-11 w-full rounded-xl border border-red-200 px-4 font-semibold text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
								>
									{t("cancelAction")}
								</button>
							</div>
						)}
						{canReceiveReturn && (
							<div className="space-y-2 border-line border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-ink-soft">
										{t("returnCondition")}
									</span>
									<select
										value={state.condition}
										onChange={(event) =>
											patch({
												condition:
													event.target.value === "damaged"
														? "damaged"
														: "resellable",
											})
										}
										className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3"
									>
										<option value="resellable">{t("resellable")}</option>
										<option value="damaged">{t("damaged")}</option>
									</select>
								</label>
								<button
									type="button"
									disabled={action.isPending}
									onClick={() =>
										action.mutate({
											purchaseOrderId,
											action: "return-received",
											body: { condition: state.condition },
										})
									}
									className="min-h-11 w-full rounded-xl bg-night px-4 font-semibold text-sm text-white hover:bg-ink-soft disabled:opacity-50"
								>
									{t("receiveReturn")}
								</button>
							</div>
						)}
					</section>
				</aside>
			</div>
		</div>
	);
}
