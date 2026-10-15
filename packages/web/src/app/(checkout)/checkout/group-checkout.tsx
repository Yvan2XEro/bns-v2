"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { useAppConfig } from "~/hooks/use-app-config";
import { useSplitPlace, useSplitQuote } from "~/hooks/use-checkout-group";
import { useOrderMoney } from "~/hooks/use-order-money";
import {
	type ApiError,
	ERROR_CODES,
	resolveErrorMessage,
} from "~/lib/apiError";
import { type AddressField, addressFieldOf } from "~/lib/checkout-form";
import { isSplitQuote, unavailableReasonKey } from "~/lib/checkout-group-flow";
import { cartKey } from "~/lib/query-keys";
import type {
	AddressInput,
	PaymentMethod,
	SplitQuoteGroup,
	SplitQuoteView,
} from "~/types/order";
import { AddressStep } from "./address-step";
import { PaymentMethodPicker } from "./payment-method-picker";

function GroupReview({
	group,
	picks,
	onPick,
	disabled,
}: {
	group: SplitQuoteGroup;
	picks: Record<string, string>;
	onPick: (groupKey: string, optionId: string) => void;
	disabled: boolean;
}) {
	const formatOrderMoney = useOrderMoney();
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const money = (amount: number) => formatOrderMoney(amount, locale);
	const selected = picks[group.groupKey] ?? group.selectedOptionId;

	return (
		<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-semibold text-[#0F172A]">
				{tRoot("CheckoutGroup.cartGroupHeading", {
					shop: group.fulfillingShop.name,
				})}
			</h2>
			<ul className="space-y-1 text-sm">
				{group.items.map((item) => (
					<li
						key={`${item.title}-${item.variantLabel}`}
						className="flex justify-between gap-3"
					>
						<span className="text-[#334155]">
							{item.title} × {item.quantity}
						</span>
						<span className="shrink-0 text-[#0F172A]">
							{money(item.lineSubtotal)}
						</span>
					</li>
				))}
			</ul>
			<fieldset className="space-y-2" disabled={disabled}>
				<legend className="font-medium text-[#0F172A] text-sm">
					{tRoot("CheckoutGroup.groupDelivery")}
				</legend>
				{group.delivery.options.map((option) => (
					<label
						key={option.optionId}
						className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
							option.optionId === selected
								? "border-[#1E40AF] bg-[#EFF6FF]"
								: "border-[#E2E8F0]"
						}`}
					>
						<input
							type="radio"
							name={`delivery-${group.groupKey}`}
							className="mt-1 h-4 w-4"
							checked={option.optionId === selected}
							onChange={() => onPick(group.groupKey, option.optionId)}
						/>
						<span className="flex-1">
							<span className="block font-medium text-[#0F172A]">
								{option.method === "pickup"
									? tRoot("Checkout.pickupAtShop")
									: option.method === "courier"
										? tRoot("Checkout.courierDelivery")
										: tRoot("Checkout.sellerDelivery")}
							</span>
							<span className="block text-[#64748B]">
								{tRoot("Checkout.eta", { eta: option.etaText })}
							</span>
						</span>
						<span className="shrink-0 text-[#0F172A]">
							{option.fee === 0 ? tRoot("Checkout.free") : money(option.fee)}
						</span>
					</label>
				))}
			</fieldset>
			<dl className="space-y-1 border-[#E2E8F0] border-t pt-3 text-sm">
				<div className="flex justify-between">
					<dt className="text-[#64748B]">
						{tRoot("CheckoutGroup.groupSubtotal")}
					</dt>
					<dd>{money(group.subtotal)}</dd>
				</div>
				<div className="flex justify-between">
					<dt className="text-[#64748B]">
						{tRoot("CheckoutGroup.groupDelivery")}
					</dt>
					<dd>
						{group.deliveryFee === 0
							? tRoot("Checkout.free")
							: money(group.deliveryFee)}
					</dd>
				</div>
				<div className="flex justify-between font-semibold text-[#0F172A]">
					<dt>{tRoot("CheckoutGroup.groupTotal")}</dt>
					<dd>{money(group.total)}</dd>
				</div>
			</dl>
		</section>
	);
}

/** One address, one review per fulfilling group, one placement; every figure is the quote's. */
export function GroupCheckout({
	launchCities,
}: {
	launchCities: Parameters<typeof AddressStep>[0]["launchCities"];
}) {
	const tRoot = useTranslations();
	const formatOrderMoney = useOrderMoney();
	const locale = useLocale() === "en" ? "en" : "fr";
	const router = useRouter();
	const { protectedPaymentEnabled } = useAppConfig();
	const queryClient = useQueryClient();
	const quoteMutation = useSplitQuote();
	const place = useSplitPlace();

	const [address, setAddress] = useState<AddressInput | null>(null);
	const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
	const [picks, setPicks] = useState<Record<string, string>>({});
	const [quote, setQuote] = useState<SplitQuoteView | null>(null);
	const [changed, setChanged] = useState(false);
	const [accepted, setAccepted] = useState(false);
	const [addressError, setAddressError] = useState<AddressField | null>(null);
	const [rejected, setRejected] = useState(false);
	const [idempotencyKey] = useState(() => crypto.randomUUID());

	const requestQuote = (
		nextAddress: AddressInput,
		method: PaymentMethod,
		nextPicks: Record<string, string>,
		fromChange: boolean,
	) =>
		quoteMutation.mutate(
			{
				address: nextAddress,
				paymentMethod: method,
				deliveryByGroup: nextPicks,
				locale,
			},
			{
				onSuccess: (fresh) => {
					// A flat answer means the server left split mode mid-checkout; the cart refetch re-renders the single-shop flow.
					if (!isSplitQuote(fresh)) {
						void queryClient.invalidateQueries({ queryKey: cartKey() });
						return;
					}
					setQuote(fresh);
					setChanged(fromChange);
					setAccepted(false);
				},
				onError: (error: ApiError) => {
					if (error.code === ERROR_CODES.checkoutAddressInvalid) {
						setQuote(null);
						setRejected(true);
						setAddressError(addressFieldOf(error));
					}
				},
			},
		);

	const onAddress = (next: AddressInput) => {
		setAddress(next);
		setAddressError(null);
		setRejected(false);
		requestQuote(next, paymentMethod, picks, false);
	};
	const onMethod = (method: PaymentMethod) => {
		setPaymentMethod(method);
		if (address) requestQuote(address, method, picks, false);
	};
	const onPick = (groupKey: string, optionId: string) => {
		const next = { ...picks, [groupKey]: optionId };
		setPicks(next);
		if (address) requestQuote(address, paymentMethod, next, false);
	};

	const onPlace = () => {
		if (!address || !quote || !accepted) return;
		place.mutate(
			{
				address,
				paymentMethod,
				deliveryByGroup: picks,
				locale,
				quoteHash: quote.quoteHash,
				termsAccepted: true,
				idempotencyKey,
				groupKeys: quote.groups.map((group) => group.groupKey),
			},
			{
				onSuccess: (placed) =>
					router.push(
						`/checkout/group/${encodeURIComponent(placed.checkoutGroup)}`,
					),
				onError: (error) => {
					if (error.code !== ERROR_CODES.checkoutQuoteChanged) return;
					// The 409 is a fresh summary the buyer must see and accept again.
					requestQuote(address, paymentMethod, picks, true);
				},
			},
		);
	};

	if (!address || rejected) {
		return (
			<div className="space-y-6">
				<h1 className="font-bold text-2xl text-[#0F172A]">
					{tRoot("Checkout.title")}
				</h1>
				<AddressStep
					initial={address}
					launchCities={launchCities}
					shopCity={null}
					method="seller_delivery"
					rejectedField={addressError}
					rejection={
						quoteMutation.error?.code === ERROR_CODES.checkoutAddressInvalid
							? quoteMutation.error
							: null
					}
					onSubmit={onAddress}
				/>
			</div>
		);
	}

	const methodPicker = protectedPaymentEnabled ? (
		<PaymentMethodPicker
			method={paymentMethod}
			fee={null}
			onChoose={onMethod}
		/>
	) : null;

	if (quoteMutation.isPending && !quote) {
		return (
			<div className="space-y-6">
				{methodPicker}
				<p className="flex items-center gap-2 text-[#64748B] text-sm">
					<LoaderCircle className="h-4 w-4 animate-spin" />
					{tRoot("Checkout.loadingQuote")}
				</p>
			</div>
		);
	}

	if (!quote) {
		return (
			<div className="space-y-4">
				{methodPicker}
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(quoteMutation.error, tRoot)}
				</p>
				<div className="flex gap-3">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={() => setAddress(null)}
					>
						{tRoot("Checkout.back")}
					</Button>
					<Button
						type="button"
						className="min-h-11"
						onClick={() => requestQuote(address, paymentMethod, picks, false)}
					>
						{tRoot("Checkout.retryQuote")}
					</Button>
				</div>
			</div>
		);
	}

	const nothingToPlace = quote.groups.length === 0;
	const busy = quoteMutation.isPending || place.isPending;
	const placeError =
		place.error?.code === ERROR_CODES.checkoutQuoteChanged ? null : place.error;

	return (
		<div className="space-y-6">
			<h1 className="font-bold text-2xl text-[#0F172A]">
				{tRoot("Checkout.title")}
			</h1>
			{methodPicker}
			{changed ? (
				<div
					role="alert"
					className="flex gap-3 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-4"
				>
					<AlertTriangle className="h-5 w-5 shrink-0 text-[#B45309]" />
					<div>
						<p className="font-semibold text-[#92400E]">
							{tRoot("Checkout.quoteChanged")}
						</p>
						<p className="text-[#92400E] text-sm">
							{tRoot("Checkout.quoteChangedBody")}
						</p>
					</div>
				</div>
			) : null}
			{quote.unavailableGroups.length > 0 ? (
				<ul
					className="space-y-2"
					aria-label={tRoot("CheckoutGroup.unavailableHeading")}
				>
					{quote.unavailableGroups.map((entry) => (
						<li
							key={entry.groupKey}
							className="rounded-xl bg-red-50 px-4 py-3 text-red-700 text-sm"
						>
							{tRoot(`CheckoutGroup.${unavailableReasonKey(entry.reason)}`)}
						</li>
					))}
				</ul>
			) : null}
			{quote.groups.map((group) => (
				<GroupReview
					key={group.groupKey}
					group={group}
					picks={picks}
					onPick={onPick}
					disabled={busy}
				/>
			))}
			{nothingToPlace ? null : (
				<>
					<div className="flex items-center justify-between rounded-2xl bg-[#F8FAFC] px-5 py-4">
						<span className="font-semibold text-[#0F172A]">
							{tRoot("CheckoutGroup.grandTotal")}
						</span>
						<span className="font-bold text-[#0F172A] text-xl">
							{formatOrderMoney(quote.grandTotal, locale)}
						</span>
					</div>
					<div className="flex items-start gap-3">
						<input
							id="accept-group-terms"
							type="checkbox"
							className="mt-1 h-5 w-5"
							checked={accepted}
							onChange={(event) => setAccepted(event.target.checked)}
						/>
						<Label
							htmlFor="accept-group-terms"
							className="font-normal text-sm leading-relaxed"
						>
							{tRoot("CheckoutGroup.acceptTerms")}
						</Label>
					</div>
				</>
			)}
			{placeError || quoteMutation.error ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(placeError ?? quoteMutation.error, tRoot)}
				</p>
			) : null}
			<div className="flex gap-3">
				<Button
					type="button"
					variant="outline"
					className="min-h-12"
					onClick={() => setAddress(null)}
				>
					{tRoot("Checkout.back")}
				</Button>
				<Button
					type="button"
					className="min-h-12 flex-1 bg-[#1E40AF] text-base hover:bg-[#1E3A8A]"
					disabled={nothingToPlace || !accepted || busy}
					onClick={onPlace}
				>
					{place.isPending && (
						<LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
					)}
					{paymentMethod === "mobile_money"
						? tRoot("CheckoutGroup.placeAll")
						: tRoot("CheckoutGroup.placeAllCod")}
				</Button>
			</div>
		</div>
	);
}
