"use client";

import { MapPin, PackageCheck, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useReducer } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { WorkspaceBreadcrumb } from "~/components/seller/workspace-breadcrumb";
import { useAppConfig } from "~/hooks/use-app-config";
import {
	usePurchaseOrder,
	usePurchaseOrderAction,
} from "~/hooks/use-purchase-orders";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate, formatXaf } from "~/lib/order-money";
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
	const t = useTranslations("SellerResale");
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
	const order = query.data;
	const statusLabels: Record<PurchaseOrderView["status"], string> = {
		sent: t("status.sent"),
		accepted: t("status.accepted"),
		shipped: t("status.shipped"),
		delivered: t("status.delivered"),
		cancelled: t("status.cancelled"),
		returned: t("status.returned"),
	};
	const actionError = action.error
		? resolveErrorMessage(action.error, tRoot, t("actionFailed"))
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
				href={`/seller/resale/purchase-orders?side=${side}`}
				reference={order.number}
			/>

			<header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#E2E8F0] bg-white p-5 sm:p-7">
				<div>
					<p className="font-semibold text-[#B45309] text-xs uppercase tracking-[0.18em]">
						{t("number")}
					</p>
					<h1 className="mt-2 font-bold text-2xl text-[#0F172A]">
						{order.number}
					</h1>
					<p className="mt-2 text-[#64748B] text-sm">
						{order.branding.name} · {formatOrderDate(order.sentAt, locale)}
					</p>
				</div>
				<span className="rounded-full bg-[#FEF3C7] px-3 py-1.5 font-semibold text-[#92400E] text-sm">
					{statusLabels[order.status]}
				</span>
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
				<section className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
					<h2 className="font-bold text-[#0F172A]">{t("items")}</h2>
					<ul className="divide-y divide-[#E2E8F0]">
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
									<p className="font-semibold text-[#0F172A]">{item.title}</p>
									<p className="mt-1 text-[#64748B] text-sm">
										{item.quantity} ×{" "}
										{formatXaf(item.resellerUnitPrice, locale)}
										{item.variantLabel ? ` · ${item.variantLabel}` : ""}
									</p>
								</div>
								{side === "supplier" && (
									<p className="font-semibold text-[#334155] text-sm">
										{formatXaf(item.supplierUnitPrice * item.quantity, locale)}
									</p>
								)}
							</li>
						))}
					</ul>
					<div className="grid gap-3 border-[#E2E8F0] border-t pt-4 sm:grid-cols-2">
						<div className="rounded-xl bg-[#F8FAFC] p-4">
							<p className="text-[#64748B] text-xs">{t("amount")}</p>
							<p className="mt-1 font-bold text-[#0F172A]">
								{order.supplierAmount === null
									? "—"
									: formatXaf(order.supplierAmount, locale)}
							</p>
						</div>
						<div className="rounded-xl bg-[#F8FAFC] p-4">
							<p className="text-[#64748B] text-xs">{t("collectAmount")}</p>
							<p className="mt-1 font-bold text-[#0F172A]">
								{formatXaf(order.collectAmount, locale)}
							</p>
						</div>
					</div>
				</section>

				<aside className="space-y-4">
					<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
						<h2 className="font-bold text-[#0F172A]">{t("recipient")}</h2>
						<p className="font-medium text-[#334155]">
							{order.delivery.recipientName}
						</p>
						<p className="text-[#475569] text-sm">
							{t("phone")}: {order.delivery.phone}
							{order.delivery.phoneMasked ? ` · ${t("phoneMasked")}` : ""}
						</p>
						<p className="text-[#475569] text-sm">
							{t("address")}:{" "}
							{[order.delivery.district, order.delivery.city]
								.filter(Boolean)
								.join(", ") || t("notProvided")}
							{order.delivery.landmark ? ` · ${order.delivery.landmark}` : ""}
						</p>
						{order.delivery.instructions && (
							<p className="text-[#64748B] text-sm">
								{t("instructions")}: {order.delivery.instructions}
							</p>
						)}
						{mapsUrl && (
							<a
								href={mapsUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex min-h-11 items-center gap-2 font-semibold text-[#1D4ED8] text-sm"
							>
								<MapPin aria-hidden="true" className="h-4 w-4" />
								{t("address")}
							</a>
						)}
					</section>

					<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
						<h2 className="font-bold text-[#0F172A]">{t("deadline")}</h2>
						<p className="text-[#475569] text-sm">
							{formatOrderDate(order.shipBy ?? order.acceptBy, locale)}
						</p>
						<a
							href={slipUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] px-4 font-semibold text-[#334155] text-sm hover:bg-[#F8FAFC]"
						>
							<Printer aria-hidden="true" className="h-4 w-4" />
							{t("printSlip")}
						</a>
						{canAccept && (
							<button
								type="button"
								disabled={action.isPending}
								onClick={() =>
									action.mutate({ purchaseOrderId, action: "accept" })
								}
								className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B45309] px-4 font-semibold text-sm text-white hover:bg-[#92400E] disabled:opacity-50"
							>
								<PackageCheck aria-hidden="true" className="h-4 w-4" />
								{t("acceptAction")}
							</button>
						)}
						{canShip && (
							<div className="space-y-3 border-[#E2E8F0] border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
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
										className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
									>
										<option value="own_courier">{t("carrierOwn")}</option>
										<option value="yango">Yango</option>
										<option value="other">{t("carrierOther")}</option>
									</select>
								</label>
								{state.carrier !== "own_courier" ? (
									<label className="block space-y-1 text-sm">
										<span className="font-medium text-[#334155]">
											{t("trackingNumber")}
										</span>
										<input
											value={state.trackingNumber}
											onChange={(event) =>
												patch({ trackingNumber: event.target.value })
											}
											maxLength={120}
											className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
										/>
									</label>
								) : null}
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
										{t("trackingUrl")}
									</span>
									<input
										type="url"
										value={state.trackingUrl}
										onChange={(event) =>
											patch({ trackingUrl: event.target.value })
										}
										maxLength={500}
										className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
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
									className="min-h-11 w-full rounded-xl bg-[#0F172A] px-4 font-semibold text-sm text-white hover:bg-[#334155] disabled:opacity-50"
								>
									{t("shipAction")}
								</button>
							</div>
						)}
						{canHandover && (
							<div className="space-y-3 border-[#E2E8F0] border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
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
										className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
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
									className="min-h-11 w-full rounded-xl bg-[#0F172A] px-4 font-semibold text-sm text-white hover:bg-[#334155] disabled:opacity-50"
								>
									{t("confirmHandover")}
								</button>
							</div>
						)}
						{canDeclareDelivered && (
							<div className="space-y-3 border-[#E2E8F0] border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
										{t("declareDeliveredNote")}
									</span>
									<textarea
										value={state.deliveryNote}
										onChange={(event) =>
											patch({ deliveryNote: event.target.value })
										}
										maxLength={500}
										className="min-h-20 w-full rounded-lg border border-[#CBD5E1] bg-white p-3"
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
									className="min-h-11 w-full rounded-xl border border-[#CBD5E1] px-4 font-semibold text-[#334155] text-sm hover:bg-[#F8FAFC] disabled:opacity-50"
								>
									{t("declareDeliveredAction")}
								</button>
							</div>
						)}
						{canReportDeliveryFailure && (
							<div className="space-y-3 border-[#E2E8F0] border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
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
										className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
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
									<span className="font-medium text-[#334155]">
										{t("failedDeliveryCost", {
											max: formatXaf(order.deliveryFee, locale),
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
										className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
									/>
								</label>
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
										{t("deliveryFailureNote")}
									</span>
									<textarea
										value={state.deliveryFailureNote}
										onChange={(event) =>
											patch({ deliveryFailureNote: event.target.value })
										}
										maxLength={500}
										className="min-h-20 w-full rounded-lg border border-[#CBD5E1] bg-white p-3"
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
							<div className="space-y-3 border-[#E2E8F0] border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
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
										className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
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
										<span className="font-medium text-[#334155]">
											{t("cancelNote")}
										</span>
										<textarea
											value={state.cancelNote}
											onChange={(event) =>
												patch({ cancelNote: event.target.value })
											}
											maxLength={500}
											required
											className="min-h-24 w-full rounded-lg border border-[#CBD5E1] bg-white p-3"
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
									onClick={() => {
										if (!window.confirm(t("confirmCancelBody"))) return;
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
							<div className="space-y-2 border-[#E2E8F0] border-t pt-3">
								<label className="block space-y-1 text-sm">
									<span className="font-medium text-[#334155]">
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
										className="h-11 w-full rounded-lg border border-[#CBD5E1] bg-white px-3"
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
									className="min-h-11 w-full rounded-xl bg-[#0F172A] px-4 font-semibold text-sm text-white hover:bg-[#334155] disabled:opacity-50"
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
