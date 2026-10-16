"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { VariantSelector } from "~/components/listing/variant-selector";
import { useAppConfig } from "~/hooks/use-app-config";
import { type DeliveryLineInput, decideBuyBox } from "~/lib/buy-box";
import { showsProtectionBadge } from "~/lib/payment-disclosure";
import type { VerificationBadge } from "~/lib/verification";
import { BuyActions } from "./buy-actions";
import { ListingPerks } from "./listing-perks";
import { ProtectionBadge } from "./protection-badge";

export interface BuyBoxProps {
	listingId: string;
	productId: string;
	shop: { id: string; restricted: boolean } | null;
	orderable: boolean | null | undefined;
	ownShop: boolean;
	productAvailable: boolean | null;
	signedIn: boolean;
	codAllowed: boolean;
	pickupAllowed: boolean;
	delivery: DeliveryLineInput;
	handlingHours: number | null;
	/** The product's price or range, shown until a variant is selected. */
	priceFallback: string;
	/** "Ask the shop", placed under the order actions as in the design. */
	ask: ReactNode;
	/** The server's own, expiry-aware badge for this listing's shop; null for a classified ad. */
	shopBadge: VerificationBadge | null;
}

/**
 * The listing's buy box. Every outcome but `buy` renders the variant
 * selector exactly as the page had it before ordering, so a listing that
 * cannot be ordered looks as it always did.
 */
export function BuyBox(props: BuyBoxProps) {
	const t = useTranslations("BuyBox");
	const { ordersEnabled, protectedPaymentEnabled } = useAppConfig();
	const decision = decideBuyBox({
		ordersEnabled,
		orderable: props.orderable,
		shop: props.shop,
		ownShop: props.ownShop,
		productAvailable: props.productAvailable,
		signedIn: props.signedIn,
	});

	const badge = showsProtectionBadge(
		protectedPaymentEnabled,
		props.shopBadge,
	) && <ProtectionBadge />;

	const asToday = (
		<VariantSelector
			productId={props.productId}
			priceFallback={props.priceFallback}
			codAllowed={props.codAllowed}
			pickupAllowed={props.pickupAllowed}
		/>
	);
	const ask = props.ask && <div className="mt-3">{props.ask}</div>;

	if (decision.kind === "hidden")
		return (
			<>
				{asToday}
				{badge}
				{ask}
			</>
		);

	if (decision.kind === "restricted") {
		return (
			<>
				{asToday}
				{badge}
				<div className="mt-4 flex items-start gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm">
					<Clock
						aria-hidden="true"
						className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]"
					/>
					<div>
						<p className="font-semibold text-[#92400E]">
							{t("restrictedTitle")}
						</p>
						<p className="text-[#78350F]">{t("restrictedBody")}</p>
					</div>
				</div>
				{ask}
			</>
		);
	}

	return (
		<>
			<VariantSelector
				productId={props.productId}
				priceFallback={props.priceFallback}
				codAllowed={false}
				pickupAllowed={false}
			>
				{(variant) => (
					<BuyActions
						listingId={props.listingId}
						shopId={props.shop?.id ?? null}
						variant={variant}
						signedIn={decision.signedIn}
					/>
				)}
			</VariantSelector>
			{badge}
			{ask}
			<div className="mt-4">
				<ListingPerks
					listingId={props.listingId}
					estimatesEligible={Boolean(props.shop && !props.shop.restricted)}
					delivery={props.delivery}
					handlingHours={props.handlingHours}
					codAllowed={props.codAllowed}
				/>
			</div>
		</>
	);
}
