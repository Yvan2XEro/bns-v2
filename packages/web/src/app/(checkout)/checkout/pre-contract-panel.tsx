"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ContractSnapshot } from "~/types/order";

function Section({
	title,
	lang,
	children,
}: {
	title: string;
	lang: string;
	children: ReactNode;
}) {
	return (
		<details className="group rounded-xl border border-[#E2E8F0] px-4">
			<summary className="flex min-h-11 cursor-pointer items-center font-medium text-[#0F172A]">
				{title}
			</summary>
			<div
				lang={lang}
				className="space-y-2 pb-4 text-[#334155] text-sm leading-relaxed"
			>
				{children}
			</div>
		</details>
	);
}

/**
 * The art. 15 pre-contract, read from the quote's own snapshot — the same
 * object stored on the order — in either language. Section titles follow the
 * page; the contract's text follows the toggle.
 */
export function PreContractPanel({
	contract,
	language,
	onLanguage,
}: {
	contract: ContractSnapshot;
	language: "fr" | "en";
	onLanguage: (next: "fr" | "en") => void;
}) {
	const t = useTranslations("Checkout");
	const { seller, platform, withdrawal } = contract;
	const other = language === "fr" ? "en" : "fr";

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-[#0F172A] text-lg">
					{t("preContract")}
				</h2>
				<button
					type="button"
					className="min-h-11 text-[#1E40AF] text-sm underline"
					onClick={() => onLanguage(other)}
					lang={other}
				>
					{other === "en" ? t("versionEnglish") : t("versionFrench")}
				</button>
			</div>
			<Section lang={language} title={t("sellerIdentity")}>
				<p className="font-medium">
					{seller.name} (@{seller.handle})
					{seller.city ? ` — ${seller.city}` : ""}
				</p>
				{seller.phone && <p>{t("sellerPhone", { value: seller.phone })}</p>}
				{seller.rccm && <p>{t("sellerRccm", { value: seller.rccm })}</p>}
				{seller.niu && <p>{t("sellerNiu", { value: seller.niu })}</p>}
				<p>{t("platformRole", { platform: platform.legalName })}</p>
			</Section>
			<Section lang={language} title={t("termsCod")}>
				<ul className="list-disc space-y-1 pl-5">
					{contract.terms[language].map((term) => (
						<li key={term}>{term}</li>
					))}
				</ul>
			</Section>
			<Section lang={language} title={t("withdrawalInfo")}>
				<p>{t("withdrawalDays", { days: withdrawal.days })}</p>
				<p>{withdrawal.howTo[language]}</p>
				<p>{withdrawal.costs[language]}</p>
			</Section>
			<Section lang={language} title={t("salesTerms")}>
				<p className="whitespace-pre-line">{contract.salesTerms[language]}</p>
			</Section>
			<Section lang={language} title={t("complaints")}>
				<p className="whitespace-pre-line">{contract.complaints[language]}</p>
			</Section>
		</section>
	);
}
