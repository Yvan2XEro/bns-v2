"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { VariantSelector } from "~/components/listing/variant-selector";
import { useAppConfig } from "~/hooks/use-app-config";
import { type DeliveryLineInput, decideBuyBox } from "~/lib/buy-box";
import { BuyActions } from "./buy-actions";

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
}

/**
 * The listing's buy box. Every outcome but `buy` renders the variant
 * selector exactly as the page had it before ordering, so a listing that
 * cannot be ordered looks as it always did.
 */
export function BuyBox(props: BuyBoxProps) {
	const t = useTranslations("BuyBox");
	const { ordersEnabled } = useAppConfig();
	const decision = decideBuyBox({
		ordersEnabled,
		orderable: props.orderable,
		shop: props.shop,
		ownShop: props.ownShop,
		productAvailable: props.productAvailable,
		signedIn: props.signedIn,
	});

	const asToday = (
		<VariantSelector
			productId={props.productId}
			codAllowed={props.codAllowed}
			pickupAllowed={props.pickupAllowed}
		/>
	);

	if (decision.kind === "hidden") return asToday;

	if (decision.kind === "restricted") {
		return (
			<>
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
				{asToday}
			</>
		);
	}

	return (
		<VariantSelector
			productId={props.productId}
			codAllowed={false}
			pickupAllowed={false}
		>
			{(variant) => (
				<BuyActions
					listingId={props.listingId}
					shopId={props.shop?.id ?? null}
					variant={variant}
					signedIn={decision.signedIn}
					delivery={props.delivery}
				/>
			)}
		</VariantSelector>
	);
}
