"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useAppConfig } from "~/hooks/use-app-config";
import { useTestAddress } from "~/hooks/use-delivery-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { DISTRICTS } from "~/lib/checkout-form";
import { unavailableHint } from "~/lib/delivery-zone-form";
import { formatXaf } from "~/lib/order-money";
import { useLocaleKey } from "../billing/use-locale-key";

const SELECT_CLASS =
	"flex h-10 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-3 text-[#0F172A] text-sm";

/** Asks the quote route what a buyer at this address would be offered; nothing is saved. */
export function TestAddress({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerDelivery");
	const tRoot = useTranslations();
	const locale = useLocaleKey();
	const { launchCities } = useAppConfig();
	const test = useTestAddress(shopId);
	const [city, setCity] = useState(launchCities[0]?.key ?? "");
	const [district, setDistrict] = useState("");
	const [subtotal, setSubtotal] = useState("10000");
	const amount = Number(subtotal);

	return (
		<section className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-semibold text-[#0F172A]">{t("testTitle")}</h2>
			<p className="text-[#64748B] text-sm">{t("testBody")}</p>
			<div className="grid gap-3 sm:grid-cols-3">
				<div className="space-y-1.5">
					<label htmlFor="test-city" className="block font-medium text-sm">
						{t("fieldCity")}
					</label>
					<select
						id="test-city"
						className={SELECT_CLASS}
						value={city}
						onChange={(e) => {
							setCity(e.target.value);
							setDistrict("");
						}}
					>
						{launchCities.map((c) => (
							<option key={c.key} value={c.key}>
								{c.label}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1.5">
					<label htmlFor="test-district" className="block font-medium text-sm">
						{t("testDistrict")}
					</label>
					<select
						id="test-district"
						className={SELECT_CLASS}
						value={district}
						onChange={(e) => setDistrict(e.target.value)}
					>
						<option value="">{t("wholeCity")}</option>
						{(DISTRICTS[city] ?? []).map((d) => (
							<option key={d.key} value={d.key}>
								{d.label}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1.5">
					<label htmlFor="test-subtotal" className="block font-medium text-sm">
						{t("testSubtotal")}
					</label>
					<Input
						id="test-subtotal"
						inputMode="numeric"
						value={subtotal}
						onChange={(e) => setSubtotal(e.target.value)}
					/>
				</div>
			</div>
			<Button
				className="min-h-11"
				disabled={test.isPending || !city || !Number.isInteger(amount)}
				onClick={() =>
					test.mutate({
						city,
						...(district ? { district } : {}),
						subtotal: amount,
					})
				}
			>
				{t("testRun")}
			</Button>
			{test.isError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(test.error, tRoot)}
				</p>
			)}
			{test.isSuccess && (
				<div aria-live="polite" className="space-y-2 text-sm">
					{test.data.options.length === 0 && (
						<p className="text-[#64748B]">
							{tRoot("Checkout.noDeliveryOptions")}
						</p>
					)}
					<ul className="space-y-1">
						{test.data.options.map((option) => (
							<li key={option.optionId} className="text-[#0F172A]">
								{t(`method.${option.method}`)} ·{" "}
								{option.fee === 0
									? tRoot("Checkout.free")
									: formatXaf(option.fee, locale)}{" "}
								· {option.etaText}
								{option.codAllowed
									? ""
									: ` · ${tRoot("Checkout.codUnavailableOption")}`}
							</li>
						))}
					</ul>
					{test.data.unavailable.map((option, index) => {
						const hint = unavailableHint(option);
						return (
							<p key={`${option.method}-${index}`} className="text-[#B45309]">
								{t(`method.${option.method}`)} —{" "}
								{tRoot(`Checkout.${hint.key}`, { amount: hint.amount })}
							</p>
						);
					})}
				</div>
			)}
		</section>
	);
}
