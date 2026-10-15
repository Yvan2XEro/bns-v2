"use client";

import { LoaderCircle, MapPin, Store, Truck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useDeliveryOptions } from "~/hooks/use-checkout";
import { useOrderMoney } from "~/hooks/use-order-money";
import { resolveErrorMessage } from "~/lib/apiError";
import type {
	AddressInput,
	DeliveryOption,
	PaymentMethod,
} from "~/types/order";

function OptionCard({
	option,
	checked,
	onSelect,
	selectable,
}: {
	option: DeliveryOption;
	checked: boolean;
	onSelect: () => void;
	selectable: boolean;
}) {
	const formatOrderMoney = useOrderMoney();
	const t = useTranslations("Checkout");
	const locale = useLocale() === "en" ? "en" : "fr";
	const id = `option-${option.optionId}`;
	const Icon = option.method === "pickup" ? Store : Truck;
	const point = option.pickupPoint;

	return (
		<label
			htmlFor={id}
			className={`flex min-h-11 cursor-pointer gap-3 rounded-2xl border p-4 ${
				checked ? "border-[#1E40AF] bg-[#EFF6FF]" : "border-[#E2E8F0]"
			} ${selectable ? "" : "cursor-not-allowed opacity-60"}`}
		>
			<input
				id={id}
				type="radio"
				name="delivery-option"
				className="mt-1 h-4 w-4"
				checked={checked}
				disabled={!selectable}
				onChange={onSelect}
			/>
			<div className="flex-1 space-y-1">
				<p className="flex items-center gap-2 font-medium text-[#0F172A]">
					<Icon className="h-4 w-4" />
					{option.method === "pickup"
						? t("pickupAtShop")
						: option.method === "courier"
							? t("courierDelivery")
							: t("sellerDelivery")}
				</p>
				<p className="flex justify-between text-[#334155] text-sm">
					<span>{t("fee")}</span>
					<span>
						{option.fee === 0
							? t("free")
							: formatOrderMoney(option.fee, locale)}
					</span>
				</p>
				<p className="text-[#64748B] text-sm">
					{t("eta", { eta: option.etaText })}
				</p>
				{option.promisedBy ? (
					<p className="text-[#64748B] text-sm">
						{t("promisedBy", {
							date: new Date(option.promisedBy).toLocaleString(locale),
						})}
					</p>
				) : null}
				{option.freeApplied && option.originalFee ? (
					<p className="text-green-700 text-sm">
						{t("freeDeliveryApplied", {
							amount: formatOrderMoney(option.originalFee, locale),
						})}
					</p>
				) : null}
				{point && (
					<div className="mt-2 rounded-xl bg-white p-3 text-sm">
						<p className="flex items-center gap-1 font-medium">
							<MapPin className="h-4 w-4" />
							{t("pickupPoint")}
						</p>
						<p>{point.address}</p>
						{point.landmark && (
							<p className="text-[#64748B]">{point.landmark}</p>
						)}
						{point.hours && (
							<p className="text-[#64748B]">
								{t("pickupHours", { hours: point.hours })}
							</p>
						)}
					</div>
				)}
				{!selectable && (
					<p className="text-[#B45309] text-sm">{t("codUnavailableOption")}</p>
				)}
			</div>
		</label>
	);
}

/**
 * The delivery options for the address, picked in place: choosing one is
 * what asks the server for the quote, so the summary beside it always shows
 * the option on screen. `disabled` while the address above is being edited,
 * since an option chosen then would be priced for the old address.
 */
export function DeliveryOptions({
	address,
	selectedId,
	onChoose,
	paymentMethod,
	disabled,
}: {
	address: AddressInput;
	selectedId: string | null;
	onChoose: (option: DeliveryOption) => void;
	paymentMethod: PaymentMethod;
	disabled: boolean;
}) {
	const t = useTranslations("Checkout");
	const tRoot = useTranslations();
	const formatOrderMoney = useOrderMoney();
	const options = useDeliveryOptions(
		address.city,
		address.district,
		paymentMethod,
	);
	const list = options.data?.options ?? [];

	return (
		<fieldset disabled={disabled} className="space-y-3 disabled:opacity-60">
			<legend className="sr-only">{t("deliveryOptions")}</legend>
			{options.isPending && (
				<p className="flex items-center gap-2 text-[#64748B] text-sm">
					<LoaderCircle className="h-4 w-4 animate-spin" />
					{t("loadingOptions")}
				</p>
			)}
			{options.error && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(options.error, tRoot)}
				</p>
			)}
			{options.isSuccess && list.length === 0 && (
				<p className="text-[#334155] text-sm">{t("noDeliveryOptions")}</p>
			)}
			<div className="grid gap-3 sm:grid-cols-2">
				{list.map((option) => (
					<OptionCard
						key={option.optionId}
						option={option}
						checked={option.optionId === selectedId}
						onSelect={() => onChoose(option)}
						selectable={paymentMethod !== "cod" || option.codAllowed}
					/>
				))}
			</div>
			{options.data?.unavailable.map((option, index) => (
				<p key={`${option.method}-${index}`} className="text-[#B45309] text-sm">
					{t(`deliveryUnavailable.${option.reason}`, {
						amount: formatOrderMoney(option.minOrderSubtotal ?? 0),
					})}
				</p>
			))}
		</fieldset>
	);
}
