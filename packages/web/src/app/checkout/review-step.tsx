"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Dispatch } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { type ApiError, resolveErrorMessage } from "~/lib/apiError";
import {
	type CheckoutAction,
	type CheckoutState,
	canPlaceOrder,
	quoteDifferences,
} from "~/lib/checkout-form";
import { OrderSummary } from "./order-summary";
import { PreContractPanel } from "./pre-contract-panel";

export function ReviewStep({
	state,
	dispatch,
	quoting,
	quoteError,
	onRetryQuote,
	placing,
	placeError,
	onPlace,
}: {
	state: CheckoutState;
	dispatch: Dispatch<CheckoutAction>;
	quoting: boolean;
	quoteError: ApiError | null;
	onRetryQuote: () => void;
	placing: boolean;
	placeError: ApiError | null;
	onPlace: () => void;
}) {
	const t = useTranslations("Checkout");
	const tRoot = useTranslations();
	const pageLocale = useLocale() === "en" ? "en" : "fr";
	const { quote, previousQuote } = state;
	const goTo = (step: "address" | "delivery") =>
		dispatch({ type: "goTo", step });

	if (quoting) {
		return (
			<p className="flex items-center gap-2 text-[#64748B] text-sm">
				<LoaderCircle className="h-4 w-4 animate-spin" />
				{t("loadingQuote")}
			</p>
		);
	}
	if (!quote) {
		return (
			<div className="space-y-3">
				{quoteError && (
					<p role="alert" className="text-red-700 text-sm">
						{resolveErrorMessage(quoteError, tRoot)}
					</p>
				)}
				<div className="flex gap-3">
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						onClick={() => goTo("delivery")}
					>
						{t("back")}
					</Button>
					<Button type="button" className="min-h-11" onClick={onRetryQuote}>
						{t("retryQuote")}
					</Button>
				</div>
			</div>
		);
	}

	const changed = quoteDifferences(previousQuote, quote);
	const shop = quote.preContract.seller.name;

	return (
		<div className="space-y-6">
			{previousQuote && (
				<div
					role="alert"
					className="flex gap-3 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] p-4"
				>
					<AlertTriangle className="h-5 w-5 shrink-0 text-[#B45309]" />
					<div>
						<p className="font-semibold text-[#92400E]">{t("quoteChanged")}</p>
						<p className="text-[#92400E] text-sm">{t("quoteChangedBody")}</p>
					</div>
				</div>
			)}
			<OrderSummary
				quote={quote}
				changed={changed}
				onEditAddress={() => goTo("address")}
				onEditDelivery={() => goTo("delivery")}
			/>
			<PreContractPanel
				contract={quote.preContract}
				language={state.contractLocale ?? pageLocale}
				onLanguage={(locale) => dispatch({ type: "contractLocale", locale })}
			/>
			<div className="flex items-start gap-3">
				<input
					id="accept-pre-contract"
					type="checkbox"
					className="mt-1 h-5 w-5"
					checked={state.accepted}
					onChange={(event) =>
						dispatch({ type: "accepted", accepted: event.target.checked })
					}
				/>
				<Label
					htmlFor="accept-pre-contract"
					className="font-normal text-sm leading-relaxed"
				>
					{t("acceptPreContract", { shop })}
				</Label>
			</div>
			{(placeError || quoteError) && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(placeError ?? quoteError, tRoot)}
				</p>
			)}
			<Button
				type="button"
				className="min-h-12 w-full bg-[#1E40AF] text-base hover:bg-[#1E3A8A]"
				disabled={!canPlaceOrder(state) || placing}
				onClick={onPlace}
			>
				{placing && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
				{t("placeOrderCod")}
			</Button>
		</div>
	);
}
