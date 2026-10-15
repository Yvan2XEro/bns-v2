"use client";

import {
	AlertTriangle,
	ImageOff,
	LoaderCircle,
	Lock,
	Phone,
	RotateCcw,
	Star,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CartShopHeader } from "~/components/shop/cart-shop-header";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { useOrderMoney } from "~/hooks/use-order-money";
import { type ApiError, resolveErrorMessage } from "~/lib/apiError";
import { quoteDifferences } from "~/lib/checkout-form";
import type { CartView, QuoteResponse } from "~/types/order";
import { ProtectionFeeRow } from "./protection-fee-row";

function Changed({ on, children }: { on: boolean; children: ReactNode }) {
	const t = useTranslations("Checkout");
	if (!on) return <>{children}</>;
	return (
		<span className="rounded bg-[#FEF3C7] px-1 font-semibold text-[#92400E]">
			{children} <span className="ml-1 text-xs">({t("changed")})</span>
		</span>
	);
}

function SellerCard({
	shop,
	phone,
}: {
	shop: NonNullable<CartView["shop"]>;
	phone: string | null;
}) {
	const t = useTranslations("Checkout");
	const locale = useLocale() === "en" ? "en" : "fr";
	const reviews = shop.totalReviews ?? 0;

	return (
		<div className="space-y-2">
			<p className="font-semibold text-[#64748B] text-xs uppercase tracking-wide">
				{t("sellerLabel")}
			</p>
			<div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
				<CartShopHeader shop={shop} size="sm" />
				{reviews > 0 || phone ? (
					<div className="flex flex-wrap gap-x-4 gap-y-1 text-[#334155] text-[13px]">
						{reviews > 0 ? (
							<span className="inline-flex items-center gap-1.5">
								<Star
									aria-hidden
									className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]"
								/>
								{t("sellerRating", {
									rating: (shop.rating ?? 0).toLocaleString(locale, {
										maximumFractionDigits: 1,
									}),
									count: reviews,
								})}
							</span>
						) : null}
						{phone ? (
							<span className="inline-flex items-center gap-1.5">
								<Phone aria-hidden className="h-3.5 w-3.5" />
								{phone}
							</span>
						) : null}
					</div>
				) : null}
				<p className="text-[#64748B] text-xs leading-relaxed">
					{t("sellerIsShop")}
				</p>
			</div>
		</div>
	);
}

/**
 * The aside of the single checkout page. Before a quote it can only show the
 * cart; every amount after that is the quote's own, and the place button
 * stays disabled until the buyer has ticked the summary on screen.
 */
export function CheckoutSummary({
	cart,
	quote,
	previousQuote,
	quoting,
	quoteError,
	onRetryQuote,
	accepted,
	onAccept,
	canPlace,
	placing,
	placeError,
	onPlace,
}: {
	cart: CartView;
	quote: QuoteResponse | null;
	previousQuote: QuoteResponse | null;
	quoting: boolean;
	/** Only when the quote failed for something other than the address, which the address form shows itself. */
	quoteError: ApiError | null;
	onRetryQuote: (() => void) | null;
	accepted: boolean;
	onAccept: (accepted: boolean) => void;
	canPlace: boolean;
	placing: boolean;
	placeError: ApiError | null;
	onPlace: () => void;
}) {
	const t = useTranslations("Checkout");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const formatOrderMoney = useOrderMoney();
	const { withdrawalDays } = useAppConfig();
	const money = (amount: number) => formatOrderMoney(amount, locale);
	const changed = quote ? quoteDifferences(previousQuote, quote) : new Set();

	const lines = quote
		? quote.summary.lines.map((line, i) => ({
				key: `${line.title}-${line.variantLabel}-${i}`,
				...line,
				changed: changed.has(`line:${i}`),
			}))
		: cart.lines
				.filter((line) => line.available)
				.map((line) => ({ key: line.id, ...line, changed: false }));
	const amounts = quote?.summary.amounts;
	const delivery = quote?.summary.delivery;
	const mobileMoney = quote?.summary.paymentMethod === "mobile_money";
	const withdrawal = quote?.preContract.withdrawal;
	const methodLabel = (method: string) =>
		method === "pickup"
			? t("pickupAtShop")
			: method === "courier"
				? t("courierDelivery")
				: t("sellerDelivery");

	return (
		<aside className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5 lg:sticky lg:top-6">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-bold text-[#0F172A] text-xl">
					{t("summaryTitle")}
				</h2>
				<Link
					href="/cart"
					className="inline-flex min-h-11 items-center text-[#1E40AF] text-sm underline"
				>
					{t("editCart")}
				</Link>
			</div>

			{cart.shop ? (
				<SellerCard
					shop={cart.shop}
					phone={quote?.preContract.seller.phone ?? null}
				/>
			) : null}

			{previousQuote && quote ? (
				<div
					role="alert"
					className="flex gap-3 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] p-3"
				>
					<AlertTriangle className="h-5 w-5 shrink-0 text-[#B45309]" />
					<div>
						<p className="font-semibold text-[#92400E] text-sm">
							{t("quoteChanged")}
						</p>
						<p className="text-[#92400E] text-xs">{t("quoteChangedBody")}</p>
					</div>
				</div>
			) : null}

			<ul className="space-y-3">
				{lines.map((line) => (
					<li key={line.key} className="flex items-center gap-3">
						<div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#EFF6FF]">
							{line.imageUrl ? (
								<Image
									src={line.imageUrl}
									alt=""
									fill
									sizes="56px"
									className="object-cover"
								/>
							) : (
								<ImageOff
									aria-hidden="true"
									className="h-4 w-4 text-[#94A3B8]"
								/>
							)}
						</div>
						<div className="min-w-0 flex-1 text-sm">
							<p className="truncate font-semibold text-[#0F172A]">
								{line.title}
							</p>
							<p className="text-[#64748B] text-xs">
								<Changed on={line.changed}>
									{[
										line.variantLabel,
										t("quantity", { quantity: line.quantity }),
									]
										.filter(Boolean)
										.join(" · ")}
								</Changed>
							</p>
						</div>
						<p className="whitespace-nowrap font-semibold text-[#0F172A] text-sm">
							{money(line.lineSubtotal)}
						</p>
					</li>
				))}
			</ul>

			<dl className="space-y-2 border-[#E2E8F0] border-t pt-3 text-sm">
				<div className="flex justify-between gap-3">
					<dt className="text-[#334155]">{t("subtotal")}</dt>
					<dd className="font-medium text-[#0F172A]">
						<Changed on={changed.has("subtotal")}>
							{money(amounts?.subtotal ?? cart.subtotal)}
						</Changed>
					</dd>
				</div>
				<div className="flex justify-between gap-3">
					<dt className="text-[#334155]">
						{delivery ? (
							<Changed on={changed.has("etaText")}>
								{`${methodLabel(delivery.method)} · ${delivery.etaText}`}
							</Changed>
						) : (
							t("deliveryRow")
						)}
					</dt>
					<dd className="text-right font-medium text-[#0F172A]">
						{amounts ? (
							<Changed on={changed.has("deliveryFee")}>
								{amounts.deliveryFee === 0
									? t("free")
									: money(amounts.deliveryFee)}
							</Changed>
						) : (
							<span className="font-normal text-[#64748B]">
								{t("deliveryPending")}
							</span>
						)}
					</dd>
				</div>
				{mobileMoney && amounts && amounts.buyerProtectionFee > 0 ? (
					<ProtectionFeeRow amount={money(amounts.buyerProtectionFee)} />
				) : null}
				{amounts ? (
					<div className="flex items-baseline justify-between gap-3 border-[#E2E8F0] border-t pt-2.5">
						<dt className="font-bold text-[#0F172A] text-base">
							{t("totalLabel")}
						</dt>
						<dd className="font-extrabold text-2xl text-[#1E40AF]">
							<Changed on={changed.has("total")}>
								{money(amounts.total)}
							</Changed>
						</dd>
					</div>
				) : null}
			</dl>
			{quoting ? (
				<p className="flex items-center gap-2 text-[#64748B] text-sm">
					<LoaderCircle className="h-4 w-4 animate-spin" />
					{t("loadingQuote")}
				</p>
			) : amounts ? (
				<p className="text-[#64748B] text-xs">
					{mobileMoney ? t("payNowNote") : t("payOnDeliveryNote")}
				</p>
			) : (
				<p className="text-[#64748B] text-xs">{t("totalPending")}</p>
			)}
			{quoteError && !quote ? (
				<div className="space-y-2">
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(quoteError, tRoot)}
					</p>
					{onRetryQuote ? (
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={onRetryQuote}
						>
							{t("retryQuote")}
						</Button>
					) : null}
				</div>
			) : null}

			<div className="flex gap-2.5 rounded-xl bg-[#EFF6FF] p-3">
				<RotateCcw
					aria-hidden
					className="mt-0.5 h-4 w-4 shrink-0 text-[#1E40AF]"
				/>
				<div className="space-y-0.5">
					<p className="font-bold text-[#0F172A] text-sm">
						{t("withdrawalBoxTitle", {
							days: withdrawal?.days ?? withdrawalDays,
						})}
					</p>
					<p className="text-[#334155] text-[13px] leading-relaxed">
						{t("withdrawalBoxBody")}
						{withdrawal ? ` ${withdrawal.costs[locale]}` : ""}
					</p>
				</div>
			</div>

			<div className="flex items-start gap-3">
				<input
					id="accept-pre-contract"
					type="checkbox"
					className="mt-0.5 h-5 w-5 shrink-0"
					disabled={!quote}
					checked={accepted}
					onChange={(event) => onAccept(event.target.checked)}
				/>
				<label
					htmlFor="accept-pre-contract"
					className="text-[#334155] text-sm leading-relaxed"
				>
					{t.rich("acceptSalesTerms", {
						shop: quote?.preContract.seller.name ?? cart.shop?.name ?? "",
						link: (chunks) => (
							<a
								href="#pre-contract"
								className="font-semibold text-[#1E40AF] underline"
							>
								{chunks}
							</a>
						),
					})}
				</label>
			</div>

			{placeError ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(placeError, tRoot)}
				</p>
			) : null}
			<Button
				type="button"
				className="min-h-12 w-full bg-[#1E40AF] font-bold text-base hover:bg-[#1E3A8A]"
				disabled={!canPlace || placing}
				onClick={onPlace}
			>
				{placing ? (
					<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
				) : (
					<Lock aria-hidden className="mr-2 h-4 w-4" />
				)}
				{amounts
					? mobileMoney
						? t("placeOrderPay", { total: money(amounts.total) })
						: t("placeOrderConfirm", { total: money(amounts.total) })
					: t("placeOrderIdle")}
			</Button>
		</aside>
	);
}
