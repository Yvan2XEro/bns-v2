"use client";

import { BadgeCheck, Ban, KeyRound, LoaderCircle, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { useAppConfig } from "~/hooks/use-app-config";
import { useCart } from "~/hooks/use-cart";
import { useCheckoutQuote, usePlaceOrder } from "~/hooks/use-checkout";
import { useMarketPhone } from "~/hooks/use-market-phone";
import { ERROR_CODES } from "~/lib/apiError";
import {
	addressFieldOf,
	canPlaceOrder,
	checkoutReducer,
	DISTRICTS,
	initialCheckoutState,
	placeOrderBody,
} from "~/lib/checkout-form";
import { cartLinesOf, isSplitCart } from "~/lib/checkout-group-flow";
import { reusableAddress } from "~/lib/checkout-prefill";
import type {
	AddressInput,
	DeliveryOption,
	LaunchCityOption,
	PaymentMethod,
	QuoteResponse,
} from "~/types/order";
import { AddressStep } from "./address-step";
import { CheckoutSection } from "./checkout-section";
import { CheckoutSummary } from "./checkout-summary";
import { DeliveryOptions } from "./delivery-step";
import { GroupCheckout } from "./group-checkout";
import { PaymentMethodPicker } from "./payment-method-picker";
import { PreContractPanel } from "./pre-contract-panel";
import { useLastAddress } from "./use-last-address";

function EditLink({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="min-h-11 font-semibold text-[#1E40AF] text-sm hover:underline"
		>
			{label}
		</button>
	);
}

function AddressCard({
	address,
	launchCities,
	fromLastOrder,
}: {
	address: AddressInput;
	launchCities: LaunchCityOption[];
	fromLastOrder: boolean;
}) {
	const t = useTranslations("Checkout");
	const city =
		launchCities.find((c) => c.key === address.city)?.label ?? address.city;
	const district =
		address.districtOther ??
		DISTRICTS[address.city]?.find((d) => d.key === address.district)?.label ??
		address.district;

	return (
		<div className="flex items-start gap-3 rounded-xl border-2 border-[#1E40AF] bg-[#EFF6FF] p-4">
			<MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#1E40AF]" />
			<div className="min-w-0 space-y-0.5">
				<div className="flex flex-wrap items-center gap-2">
					<p className="font-bold text-[#0F172A]">{address.recipientName}</p>
					{fromLastOrder ? (
						<span className="rounded-full bg-[#DBEAFE] px-2 py-0.5 font-semibold text-[#1E40AF] text-[11px]">
							{t("lastUsedAddress")}
						</span>
					) : null}
				</div>
				<p className="text-[#0F172A] text-sm">
					{district}, {city}
					{address.landmark ? ` — ${address.landmark}` : ""}
				</p>
				<p className="text-[#64748B] text-sm">{address.phone}</p>
			</div>
		</div>
	);
}

function SafetyReminders() {
	const t = useTranslations("Checkout");
	const items = [
		{ icon: BadgeCheck, text: t("safetyMoney") },
		{ icon: Ban, text: t("safetyDeposit") },
		{ icon: KeyRound, text: t("safetyCode") },
	];
	return (
		<ul className="flex flex-col gap-2 rounded-lg bg-[#F8FAFC] px-3.5 py-2.5 text-[#334155] text-[13px] sm:flex-row sm:flex-wrap sm:gap-x-7">
			{items.map(({ icon: Icon, text }) => (
				<li key={text} className="flex items-center gap-1.5">
					<Icon aria-hidden className="h-4 w-4 shrink-0 text-[#15803D]" />
					{text}
				</li>
			))}
		</ul>
	);
}

/**
 * One page: address, delivery and payment as sections, the summary beside
 * them. Choosing a delivery option (or a payment method once one is chosen)
 * asks the server for the quote; the summary only ever shows that quote's
 * amounts, and placement sends exactly what it priced.
 */
export function CheckoutClient() {
	const t = useTranslations("Checkout");
	const locale = useLocale() === "en" ? "en" : "fr";
	const router = useRouter();
	const { ordersEnabled, launchCities, protectedPaymentEnabled } =
		useAppConfig();
	const cart = useCart(ordersEnabled);
	const quote = useCheckoutQuote();
	const place = usePlaceOrder();
	const phoneRule = useMarketPhone();
	const lastAddress = useLastAddress();
	const [state, dispatch] = useReducer(checkoutReducer, null, () =>
		initialCheckoutState(crypto.randomUUID()),
	);
	const [fromLastOrder, setFromLastOrder] = useState(false);
	// Only the latest quote request may land: a slower answer for an option
	// the buyer has already moved away from must not replace the newer one.
	const quoteSeq = useRef(0);

	const singleCart =
		cart.data && !isSplitCart(cart.data) ? cart.data : undefined;
	const servedCity = (() => {
		const shopCity = singleCart?.shop?.city ?? null;
		return launchCities.some((c) => c.key === shopCity) ? shopCity : null;
	})();

	const prefillApplied = useRef(false);
	useEffect(() => {
		if (prefillApplied.current || !lastAddress.settled || !singleCart) return;
		prefillApplied.current = true;
		if (!lastAddress.values || state.address) return;
		const ready = reusableAddress(lastAddress.values, {
			cityKeys: launchCities.map((c) => c.key),
			servedCity,
			phonePattern: phoneRule.pattern,
		});
		if (ready) {
			dispatch({ type: "addressSubmitted", address: ready });
			setFromLastOrder(true);
		}
	}, [
		lastAddress.settled,
		lastAddress.values,
		singleCart,
		state.address,
		launchCities,
		servedCity,
		phoneRule.pattern,
	]);

	if (!ordersEnabled)
		return <p className="text-[#334155]">{t("ordersClosed")}</p>;
	// Placement empties the cart before the confirmation page has loaded.
	if (cart.isPending || place.isSuccess) {
		return (
			<LoaderCircle className="mx-auto h-6 w-6 animate-spin text-[#64748B]" />
		);
	}
	if (!cart.data || cartLinesOf(cart.data).length === 0) {
		return (
			<div className="space-y-4 text-center">
				<p className="text-[#334155]">{t("emptyCart")}</p>
				<Button asChild className="min-h-11">
					<Link href="/cart">{t("goToCart")}</Link>
				</Button>
			</div>
		);
	}

	if (isSplitCart(cart.data)) {
		return <GroupCheckout launchCities={launchCities} />;
	}
	const cartView = cart.data;

	const requestQuote = (
		address: AddressInput,
		option: DeliveryOption,
		method: PaymentMethod,
		onQuote: (fresh: QuoteResponse) => void,
	) => {
		const seq = ++quoteSeq.current;
		quote.mutate(
			{
				address,
				deliveryOptionId: option.optionId,
				paymentMethod: method,
				locale,
			},
			{
				onSuccess: (fresh) => {
					if (seq === quoteSeq.current) onQuote(fresh);
				},
				onError: (error) => {
					if (seq !== quoteSeq.current) return;
					if (error.code === ERROR_CODES.checkoutAddressInvalid) {
						dispatch({ type: "addressRejected", field: addressFieldOf(error) });
					}
				},
			},
		);
	};

	const chooseOption = (
		option: DeliveryOption,
		address: AddressInput | null = state.address,
	) => {
		if (!address) return;
		dispatch({ type: "optionChosen", option });
		// An address accepted under pickup rules may lack the landmark delivery needs.
		if (option.method !== "pickup" && !address.landmark) {
			dispatch({ type: "addressRejected", field: "landmark" });
			return;
		}
		requestQuote(address, option, state.paymentMethod, (fresh) =>
			dispatch({ type: "quoteLoaded", quote: fresh }),
		);
	};

	const submitAddress = (address: AddressInput) => {
		// Same rule as the reducer: an option survives only within the same city.
		const kept =
			state.option && state.address?.city === address.city
				? state.option
				: null;
		// A quote still in flight priced the old address.
		quoteSeq.current += 1;
		dispatch({ type: "addressSubmitted", address });
		setFromLastOrder(false);
		if (kept) chooseOption(kept, address);
	};

	// Switching method re-prices the order (the protection fee is the server's
	// to compute, never this screen's), so it asks for a fresh quote the same
	// way picking a different delivery option does.
	const choosePaymentMethod = (method: PaymentMethod) => {
		dispatch({ type: "paymentMethodChosen", method });
		if (state.step !== "review" || !state.address || !state.option) return;
		requestQuote(state.address, state.option, method, (fresh) =>
			dispatch({ type: "quoteLoaded", quote: fresh }),
		);
	};

	// `checkout.quoteChanged` is answered with a new quote, never a retry: the
	// buyer must see, and tick for, the summary that will actually be placed.
	const placeOrder = () => {
		const body = placeOrderBody(state, locale);
		if (!body) return;
		place.mutate(body, {
			onSuccess: (placed) =>
				router.push(
					body.paymentMethod === "mobile_money"
						? `/checkout/${encodeURIComponent(placed.orderId)}/pay`
						: `/checkout/confirmation/${encodeURIComponent(placed.orderId)}?c=${placed.confirmationRequired}`,
				),
			onError: (error) => {
				if (error.code !== ERROR_CODES.checkoutQuoteChanged) return;
				if (!state.address || !state.option) return;
				requestQuote(
					state.address,
					state.option,
					state.paymentMethod,
					(fresh) => dispatch({ type: "quoteChanged", quote: fresh }),
				);
			},
		});
	};

	const editingAddress = state.step === "address" || !state.address;
	const itemCount = cartView.lines
		.filter((line) => line.available)
		.reduce((sum, line) => sum + line.quantity, 0);
	const quoteError =
		quote.error?.code === ERROR_CODES.checkoutAddressInvalid
			? null
			: quote.error;

	return (
		<div className="space-y-5">
			<header className="space-y-1">
				<h1 className="font-extrabold text-[#0F172A] text-[28px] tracking-tight">
					{t("pageTitle")}
				</h1>
				<p className="text-[#64748B] text-sm">{t("pageSubtitle")}</p>
			</header>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
				<div className="space-y-4">
					<CheckoutSection
						number={1}
						title={t("sectionAddress")}
						subtitle={t("sectionAddressHint")}
						done={!editingAddress}
						action={
							editingAddress ? null : (
								<EditLink
									label={t("edit")}
									onClick={() => dispatch({ type: "goTo", step: "address" })}
								/>
							)
						}
					>
						{!editingAddress && state.address ? (
							<AddressCard
								address={state.address}
								launchCities={launchCities}
								fromLastOrder={fromLastOrder}
							/>
						) : lastAddress.settled ? (
							<AddressStep
								initial={state.address ?? lastAddress.values}
								launchCities={launchCities}
								shopCity={cartView.shop?.city ?? null}
								method={state.option?.method ?? "seller_delivery"}
								rejectedField={state.addressError}
								rejection={
									quote.error?.code === ERROR_CODES.checkoutAddressInvalid
										? quote.error
										: null
								}
								onSubmit={submitAddress}
							/>
						) : (
							<LoaderCircle className="mx-auto h-5 w-5 animate-spin text-[#64748B]" />
						)}
					</CheckoutSection>

					<CheckoutSection
						number={2}
						title={t("sectionDelivery")}
						subtitle={t("sectionDeliveryHint", {
							count: itemCount,
							shop: cartView.shop?.name ?? "",
						})}
						done={state.step === "review" && state.option !== null}
					>
						{state.address ? (
							<DeliveryOptions
								address={state.address}
								selectedId={state.option?.optionId ?? null}
								paymentMethod={state.paymentMethod}
								disabled={editingAddress}
								onChoose={(option) => chooseOption(option)}
							/>
						) : (
							<p className="text-[#64748B] text-sm">
								{t("deliveryNeedsAddress")}
							</p>
						)}
					</CheckoutSection>

					<CheckoutSection
						number={3}
						title={t("sectionPayment")}
						subtitle={
							state.paymentMethod === "mobile_money"
								? t("sectionPaymentHintProtected")
								: t("sectionPaymentHintCod")
						}
						done={state.quote !== null}
					>
						<PaymentMethodPicker
							embedded
							codOnly={!protectedPaymentEnabled}
							method={state.paymentMethod}
							fee={
								state.quote?.summary.paymentMethod === "mobile_money"
									? state.quote.summary.amounts.buyerProtectionFee
									: null
							}
							onChoose={choosePaymentMethod}
						/>
						<SafetyReminders />
					</CheckoutSection>

					{state.quote ? (
						<div
							id="pre-contract"
							className="scroll-mt-24 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-5 sm:px-6"
						>
							<PreContractPanel
								contract={state.quote.preContract}
								language={state.contractLocale ?? locale}
								onLanguage={(next) =>
									dispatch({ type: "contractLocale", locale: next })
								}
							/>
						</div>
					) : null}
				</div>

				<CheckoutSummary
					cart={cartView}
					quote={state.quote}
					previousQuote={state.previousQuote}
					quoting={quote.isPending}
					quoteError={quoteError}
					onRetryQuote={
						state.option && !editingAddress
							? () => state.option && chooseOption(state.option)
							: null
					}
					accepted={state.accepted}
					onAccept={(accepted) => dispatch({ type: "accepted", accepted })}
					canPlace={canPlaceOrder(state)}
					placing={place.isPending}
					placeError={
						place.error?.code === ERROR_CODES.checkoutQuoteChanged
							? null
							: place.error
					}
					onPlace={placeOrder}
				/>
			</div>
		</div>
	);
}
