"use client";

import { Check, Info, Lock, PauseCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useCurrencyCode, useOrderMoney } from "~/hooks/use-order-money";
import {
	useAcceptResaleTerms,
	useCurrentResaleTerms,
	useSaveSupplierResaleSettings,
	useSupplierResaleSettings,
} from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatOrderDate } from "~/lib/order-money";
import {
	commissionOf,
	resaleHref,
	type SupplierResaleSettingsInput,
} from "~/lib/resale-hub";
import { cn } from "~/lib/utils";
import {
	isMinResellerLevel,
	RESALE_MIN_RESELLER_LEVELS,
	type SupplierResaleSettingsView,
} from "../../../../../../../../api/src/contracts/resale";
import {
	initials,
	richText,
	TermsAcceptance,
} from "../../catalogue/resale-catalogue-client";

type VariantDraft = SupplierResaleSettingsInput["variants"][number];

function draftOf(
	view: SupplierResaleSettingsView,
): SupplierResaleSettingsInput {
	return {
		enabled: view.enabled,
		approvalRequired: view.approvalRequired,
		handlingHours: view.handlingHours,
		codAccepted: view.codAccepted,
		resellerNotes: view.resellerNotes,
		minResellerLevel: view.minResellerLevel,
		variants: view.variants.map((variant) => ({
			id: variant.id,
			enabled: variant.enabled,
			supplierPrice: variant.supplierPrice ?? Number.NaN,
			minRetailPrice: variant.minRetailPrice ?? Number.NaN,
			suggestedRetailPrice: variant.suggestedRetailPrice ?? Number.NaN,
		})),
	};
}

function variantValid(variant: VariantDraft): boolean {
	const { supplierPrice, minRetailPrice, suggestedRetailPrice } = variant;
	return (
		[supplierPrice, minRetailPrice, suggestedRetailPrice].every(
			(value) => Number.isSafeInteger(value) && value >= 1,
		) &&
		minRetailPrice >= supplierPrice &&
		suggestedRetailPrice >= minRetailPrice
	);
}

export function ProductResaleClient({
	shopId,
	shopName,
	productId,
}: {
	shopId: string;
	shopName: string;
	productId: string;
}) {
	const t = useTranslations("SellerResaleProduct");
	const query = useSupplierResaleSettings(productId);
	if (query.isPending) return <LoadingRows />;
	if (query.isError || !query.data) {
		return (
			<LoadError title={t("loadError")} onRetry={() => void query.refetch()} />
		);
	}
	return (
		<Editor
			key={`${query.data.productId}:${query.dataUpdatedAt}`}
			shopId={shopId}
			shopName={shopName}
			view={query.data}
		/>
	);
}

function Editor({
	shopId,
	shopName,
	view,
}: {
	shopId: string;
	shopName: string;
	view: SupplierResaleSettingsView;
}) {
	const t = useTranslations("SellerResaleProduct");
	const tCatalogue = useTranslations("SellerResaleCatalogue");
	const tRoot = useTranslations();
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const formatOrderMoney = useOrderMoney();
	const currencyCode = useCurrencyCode();
	const [draft, setDraft] = useState(() => draftOf(view));
	const [submitted, setSubmitted] = useState(false);
	const [saved, setSaved] = useState(false);
	const save = useSaveSupplierResaleSettings(shopId, view.productId);
	const terms = useCurrentResaleTerms("supplier");
	const acceptTerms = useAcceptResaleTerms(shopId, "supplier");
	const enabledVariants = draft.variants.filter((variant) => variant.enabled);
	const invalidIds = new Set(
		enabledVariants
			.filter((variant) => !variantValid(variant))
			.map((variant) => variant.id),
	);
	const noVariant = draft.enabled && enabledVariants.length === 0;
	const handlingValid =
		Number.isSafeInteger(draft.handlingHours) &&
		draft.handlingHours >= 4 &&
		draft.handlingHours <= 120;
	const levelValid = isMinResellerLevel(draft.minResellerLevel ?? null);
	const stock = view.variants.reduce<number | null>(
		(total, variant) =>
			total === null || variant.stock === null ? null : total + variant.stock,
		0,
	);
	const sample = enabledVariants.find(variantValid) ?? null;
	const error = save.error ?? acceptTerms.error;
	const errorMessage = error
		? resolveErrorMessage(error, tRoot, t("saveFailed"))
		: null;
	const blocked = !view.eligible || !view.termsAccepted;

	const patchVariant = (id: string, patch: Partial<VariantDraft>) =>
		setDraft((current) => ({
			...current,
			variants: current.variants.map((variant) =>
				variant.id === id ? { ...variant, ...patch } : variant,
			),
		}));

	const submit = (next: SupplierResaleSettingsInput) => {
		setSubmitted(true);
		setSaved(false);
		if (!levelValid) return;
		if (next.enabled && (invalidIds.size > 0 || noVariant || !handlingValid))
			return;
		save.mutate(
			{
				...next,
				resellerNotes: next.resellerNotes.trim(),
				// The API wants a full positive price triple even for a variant left out of resale.
				variants: next.variants.map((variant) => {
					if (variant.enabled || variantValid(variant)) return variant;
					const base =
						view.variants.find((row) => row.id === variant.id)?.price ?? 1;
					return {
						...variant,
						supplierPrice: Math.max(1, base),
						minRetailPrice: Math.max(1, base),
						suggestedRetailPrice: Math.max(1, base),
					};
				}),
			},
			{ onSuccess: () => setSaved(true) },
		);
	};

	return (
		<div className="space-y-[18px]">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div className="flex flex-col gap-1">
					<nav className="text-[#64748B] text-[13px]">
						<Link href="/seller/catalogue" className="hover:underline">
							{t("breadcrumbCatalogue")}
						</Link>
						<span className="mx-1.5">›</span>
						<Link
							href={`/seller/catalogue/${encodeURIComponent(view.productId)}`}
							className="hover:underline"
						>
							{view.title}
						</Link>
						<span className="mx-1.5">›</span>
						<span>{t("breadcrumbResale")}</span>
					</nav>
					<h1 className="font-extrabold text-[#0F172A] text-[28px] tracking-tight">
						{t("title", { title: view.title })}
					</h1>
					<p className="text-[#64748B] text-sm">
						{[
							view.enabled && view.enabledAt
								? t("offeredSince", {
										date: formatOrderDate(view.enabledAt, locale),
									})
								: t("notOffered"),
							t("resoldBy", { count: view.resellerCount }),
							stock === null
								? t("stockUntracked")
								: t("inStock", { count: stock }),
						].join(" · ")}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2.5">
					{view.enabled ? (
						<button
							type="button"
							disabled={save.isPending || blocked}
							onClick={() => {
								if (!window.confirm(t("confirmSuspend"))) return;
								const next = { ...draft, enabled: false };
								setDraft(next);
								submit(next);
							}}
							className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#0F172A] text-sm disabled:opacity-50"
						>
							<PauseCircle aria-hidden="true" className="h-4 w-4" />
							{t("suspend")}
						</button>
					) : null}
					<button
						type="button"
						disabled={save.isPending || blocked}
						onClick={() => submit(draft)}
						className="inline-flex h-10 items-center rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A] disabled:opacity-50"
					>
						{save.isPending ? t("saving") : t("save")}
					</button>
				</div>
			</header>

			{!view.eligible ? (
				<p className="flex gap-2 rounded-[10px] border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-3 text-[#78350F] text-sm">
					<Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
					<span>
						{t("notEligible")}{" "}
						<Link
							href="/seller/verification"
							className="font-semibold underline"
						>
							{t("seeVerification")}
						</Link>
					</span>
				</p>
			) : !view.termsAccepted ? (
				<TermsAcceptance
					body={locale === "fr" ? terms.data?.bodyFr : terms.data?.bodyEn}
					version={terms.data?.version}
					isLoading={terms.isLoading}
					isPending={acceptTerms.isPending}
					onAccept={() => {
						const version = terms.data?.version;
						if (version) acceptTerms.mutate({ version, locale });
					}}
					t={tCatalogue}
				/>
			) : null}
			{errorMessage ? (
				<p
					role="alert"
					className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"
				>
					{errorMessage}
				</p>
			) : null}
			{saved && !save.isPending ? (
				<output className="block rounded-lg bg-[#DCFCE7] p-3 text-[#166534] text-sm">
					{t("saved")}
				</output>
			) : null}
			{view.pendingEffectiveAt ? (
				<p className="rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
					{t("pendingIncrease", {
						date: formatOrderDate(view.pendingEffectiveAt, locale),
					})}
				</p>
			) : null}

			<div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
				<div className="min-w-0 space-y-[18px]">
					<section className="flex flex-wrap items-center gap-3.5 rounded-xl border border-[#E2E8F0] bg-white px-[18px] py-4">
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<h2 className="font-bold text-[17px]">{t("offerTitle")}</h2>
							<p className="text-[#64748B] text-[13px]">{t("offerBody")}</p>
						</div>
						{view.eligible ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-[#1E40AF] px-2.5 py-1 font-semibold text-white text-xs">
								<ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
								{t("businessVerified")}
							</span>
						) : null}
						<Toggle
							label={t("offerTitle")}
							checked={draft.enabled}
							disabled={blocked}
							onChange={(enabled) => setDraft({ ...draft, enabled })}
						/>
					</section>

					<section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
						<div className="flex flex-wrap items-center justify-between gap-2 border-[#F1F5F9] border-b px-[18px] py-4">
							<h2 className="font-bold text-base">{t("variantsTitle")}</h2>
							<span className="text-[#64748B] text-[13px]">
								{t("variantsOffered", {
									offered: enabledVariants.length,
									total: draft.variants.length,
								})}
							</span>
						</div>
						<div className="overflow-x-auto">
							<table className="w-full min-w-[640px] border-collapse text-left">
								<thead>
									<tr className="border-[#E2E8F0] border-b bg-[#F8FAFC] text-[#64748B] text-xs uppercase tracking-[0.4px]">
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colVariant")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colSupplierPrice")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colSuggested")}
										</th>
										<th className="px-3.5 py-2.5 font-semibold">
											{t("colMinimum")}
										</th>
									</tr>
								</thead>
								<tbody>
									{draft.variants.map((variant, index) => {
										const row = view.variants[index];
										const invalid = submitted && invalidIds.has(variant.id);
										return (
											<tr
												key={variant.id}
												className={cn(
													"border-[#F1F5F9] border-b text-sm",
													invalid && "bg-[#FEF2F2]",
												)}
											>
												<td className="px-3.5 py-2.5">
													<label className="flex items-center gap-2.5">
														<input
															type="checkbox"
															checked={variant.enabled}
															disabled={blocked}
															onChange={(event) =>
																patchVariant(variant.id, {
																	enabled: event.target.checked,
																})
															}
															className="h-[18px] w-[18px] accent-[#1E40AF]"
														/>
														<span className="flex min-w-0 flex-col">
															<span className="font-semibold text-[#0F172A]">
																{row?.label || row?.sku || t("defaultVariant")}
															</span>
															<span className="text-[#64748B] text-xs">
																{row?.stock === null || row?.stock === undefined
																	? t("stockUntracked")
																	: t("inStock", { count: row.stock })}
															</span>
														</span>
													</label>
												</td>
												{(
													[
														"supplierPrice",
														"suggestedRetailPrice",
														"minRetailPrice",
													] as const
												).map((field) => (
													<td key={field} className="px-3.5 py-2.5">
														<input
															type="number"
															inputMode="numeric"
															min={1}
															step={1}
															disabled={!variant.enabled || blocked}
															aria-label={`${t(
																field === "supplierPrice"
																	? "colSupplierPrice"
																	: field === "minRetailPrice"
																		? "colMinimum"
																		: "colSuggested",
															)} · ${row?.label || row?.sku || t("defaultVariant")}`}
															aria-invalid={invalid}
															value={
																Number.isFinite(variant[field])
																	? variant[field]
																	: ""
															}
															onChange={(event) =>
																patchVariant(variant.id, {
																	[field]: event.target.valueAsNumber,
																})
															}
															className={cn(
																"h-[34px] w-24 rounded-lg border bg-white px-2.5 font-semibold text-[#0F172A] tabular-nums disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]",
																field === "minRetailPrice"
																	? "border-[#93C5FD]"
																	: "border-[#E2E8F0]",
															)}
														/>
													</td>
												))}
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
						<div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 bg-[#F8FAFC] px-[18px] py-3 text-[#475569] text-[13px]">
							<span className="flex items-center gap-1.5">
								<Info aria-hidden="true" className="h-4 w-4" />
								{t("amountsNote", { currency: currencyCode })}
							</span>
							{sample ? (
								<span>
									{t.rich("marginLine", {
										minimum: formatOrderMoney(
											sample.minRetailPrice - sample.supplierPrice,
										),
										suggested: formatOrderMoney(
											sample.suggestedRetailPrice - sample.supplierPrice,
										),
										strong: (chunks) => (
											<strong className="text-[#0F172A] tabular-nums">
												{chunks}
											</strong>
										),
									})}
								</span>
							) : null}
						</div>
						{submitted && (invalidIds.size > 0 || noVariant) ? (
							<p role="alert" className="px-[18px] py-2 text-red-700 text-sm">
								{noVariant ? t("noVariant") : t("invalidPrices")}
							</p>
						) : null}
					</section>

					<section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
						<div className="flex flex-wrap items-center justify-between gap-2 border-[#F1F5F9] border-b px-[18px] py-4">
							<h2 className="font-bold text-base">{t("whoTitle")}</h2>
							<span className="text-[#64748B] text-[13px]">
								{t("pendingRequests", { count: view.pendingRequests })}
							</span>
						</div>
						<fieldset className="grid gap-3 px-[18px] py-3.5 sm:grid-cols-2">
							<legend className="sr-only">{t("whoTitle")}</legend>
							{([false, true] as const).map((approval) => (
								<label
									key={String(approval)}
									className={cn(
										"flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3",
										draft.approvalRequired === approval
											? "border-[#1E40AF] bg-[#EFF6FF]"
											: "border-[#E2E8F0] bg-white",
									)}
								>
									<input
										type="radio"
										name="approval"
										checked={draft.approvalRequired === approval}
										disabled={blocked}
										onChange={() =>
											setDraft({ ...draft, approvalRequired: approval })
										}
										className="mt-0.5 h-[18px] w-[18px] accent-[#1E40AF]"
									/>
									<span className="flex flex-col gap-0.5">
										<span className="font-semibold text-sm">
											{t(approval ? "approvalOn" : "approvalOff")}
										</span>
										<span className="text-[#64748B] text-[13px]">
											{t(approval ? "approvalOnBody" : "approvalOffBody")}
										</span>
									</span>
								</label>
							))}
						</fieldset>
						<div className="grid gap-3 border-[#F1F5F9] border-t px-[18px] py-3.5 sm:grid-cols-2">
							<label className="flex flex-col gap-1.5">
								<span className="font-semibold text-[#334155] text-[13px]">
									{t("handlingHours")}
								</span>
								<span className="flex items-center gap-2">
									<input
										type="number"
										inputMode="numeric"
										min={4}
										max={120}
										step={1}
										disabled={blocked}
										aria-invalid={submitted && !handlingValid}
										value={
											Number.isFinite(draft.handlingHours)
												? draft.handlingHours
												: ""
										}
										onChange={(event) =>
											setDraft({
												...draft,
												handlingHours: event.target.valueAsNumber,
											})
										}
										className="h-10 w-24 rounded-lg border border-[#E2E8F0] bg-white px-3 font-semibold tabular-nums"
									/>
									<span className="text-[#64748B] text-sm">{t("hours")}</span>
								</span>
								{submitted && !handlingValid ? (
									<span role="alert" className="text-red-700 text-xs">
										{t("handlingInvalid")}
									</span>
								) : null}
							</label>
							<div className="flex flex-col gap-1.5">
								<span className="font-semibold text-[#334155] text-[13px]">
									{t("cod")}
								</span>
								<span className="flex items-center gap-2">
									<Toggle
										label={t("cod")}
										checked={draft.codAccepted}
										disabled={blocked}
										onChange={(codAccepted) =>
											setDraft({ ...draft, codAccepted })
										}
									/>
									<span className="text-sm">
										{draft.codAccepted ? t("yes") : t("no")}
									</span>
								</span>
							</div>
							<label className="flex flex-col gap-1.5 sm:col-span-2">
								<span className="font-semibold text-[#334155] text-[13px]">
									{t("minResellerLevel")}
								</span>
								<select
									value={String(draft.minResellerLevel ?? "")}
									disabled={blocked}
									aria-invalid={submitted && !levelValid}
									onChange={(event) => {
										const value = Number(event.target.value);
										setDraft({
											...draft,
											minResellerLevel:
												event.target.value === "" || !isMinResellerLevel(value)
													? null
													: value,
										});
									}}
									className="h-10 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm sm:max-w-sm"
								>
									<option value="">{t("minResellerLevelAny")}</option>
									{RESALE_MIN_RESELLER_LEVELS.map((level) => (
										<option key={level} value={level}>
											{t(`minResellerLevel${level}`)}
										</option>
									))}
								</select>
								<span className="text-[#64748B] text-xs">
									{t("minResellerLevelHint")}
								</span>
							</label>
							<label className="flex flex-col gap-1.5 sm:col-span-2">
								<span className="font-semibold text-[#334155] text-[13px]">
									{t("resellerNotes")}
								</span>
								<textarea
									value={draft.resellerNotes}
									maxLength={1000}
									rows={3}
									disabled={blocked}
									onChange={(event) =>
										setDraft({ ...draft, resellerNotes: event.target.value })
									}
									placeholder={t("resellerNotesPlaceholder")}
									className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm"
								/>
							</label>
						</div>
					</section>

					<section className="rounded-xl border border-[#E2E8F0] bg-white">
						<div className="flex items-center justify-between border-[#F1F5F9] border-b px-[18px] py-4">
							<h2 className="font-bold text-base">{t("conditionsTitle")}</h2>
						</div>
						<ul className="flex flex-col gap-2 px-[18px] py-3.5 text-[#334155] text-sm">
							{(
								[
									"conditionShip",
									"conditionDefects",
									"conditionRefusal",
									"conditionPayout",
									"conditionHidden",
									"conditionNotice",
								] as const
							).map((key) => (
								<li key={key} className="flex gap-2">
									<Check
										aria-hidden="true"
										className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A]"
									/>
									{t(key)}
								</li>
							))}
						</ul>
						<details className="border-[#F1F5F9] border-t px-[18px] py-3 text-sm">
							<summary className="cursor-pointer font-semibold text-[#1E40AF]">
								{t("readTerms")}
							</summary>
							<p className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-[#475569]">
								{richText(
									locale === "fr" ? terms.data?.bodyFr : terms.data?.bodyEn,
								) || tCatalogue("termsUnavailable")}
							</p>
						</details>
					</section>
				</div>

				<aside className="space-y-[18px]">
					<section className="rounded-xl border border-[#E2E8F0] bg-white">
						<div className="border-[#F1F5F9] border-b px-[18px] py-4">
							<h2 className="font-bold text-base">{t("previewTitle")}</h2>
						</div>
						<div className="flex flex-col gap-2 p-[18px]">
							<span className="font-semibold text-sm">{view.title}</span>
							<dl className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-xs">
								<PreviewStat
									label={t("colSupplierPrice")}
									value={sample ? formatOrderMoney(sample.supplierPrice) : "—"}
								/>
								<PreviewStat
									label={t("colMinimum")}
									value={sample ? formatOrderMoney(sample.minRetailPrice) : "—"}
								/>
								<PreviewStat
									label={t("colSuggested")}
									value={
										sample ? formatOrderMoney(sample.suggestedRetailPrice) : "—"
									}
								/>
								<PreviewStat
									label={t("supplierStock")}
									value={stock === null ? t("stockUntracked") : String(stock)}
								/>
							</dl>
							<div className="flex items-center gap-1.5 border-[#F1F5F9] border-t pt-2">
								<span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[#134E4A] font-extrabold text-[#99F6E4] text-[9px]">
									{initials(shopName)}
								</span>
								<span className="min-w-0 flex-1 truncate font-semibold text-[#334155] text-xs">
									{shopName}
								</span>
								<ShieldCheck
									aria-hidden="true"
									className="h-3.5 w-3.5 text-[#1E40AF]"
								/>
							</div>
							<span className="font-semibold text-[#64748B] text-[11px]">
								{[
									t(draft.approvalRequired ? "approvalOn" : "approvalOff"),
									draft.codAccepted ? t("previewCod") : null,
								]
									.filter(Boolean)
									.join(" · ")}
							</span>
							<span className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] font-semibold text-[13px]">
								{draft.approvalRequired ? (
									<>
										<Lock aria-hidden="true" className="h-4 w-4" />
										{t("previewRequest")}
									</>
								) : (
									t("previewResell")
								)}
							</span>
							<p className="text-[#64748B] text-xs">{t("previewPrivacy")}</p>
						</div>
					</section>

					{sample ? (
						<ExampleCard
							price={sample.suggestedRetailPrice}
							supplierPrice={sample.supplierPrice}
							minimum={sample.minRetailPrice}
							rateBps={view.commissionRateBps}
							range={view.resellerPriceRange}
							resellers={view.resellerCount}
						/>
					) : null}
					<Link
						href={resaleHref("supplier", "offered")}
						className="block text-center font-semibold text-[#1E40AF] text-sm"
					>
						{t("backToOffered")}
					</Link>
				</aside>
			</div>
		</div>
	);
}

function ExampleCard({
	price,
	supplierPrice,
	minimum,
	rateBps,
	range,
	resellers,
}: {
	price: number;
	supplierPrice: number;
	minimum: number;
	rateBps: number;
	range: { min: number; max: number } | null;
	resellers: number;
}) {
	const t = useTranslations("SellerResaleProduct");
	const formatOrderMoney = useOrderMoney();
	const margin = price - supplierPrice;
	const commission = commissionOf(price, rateBps);
	return (
		<section className="rounded-xl border border-[#E2E8F0] bg-white">
			<div className="border-[#F1F5F9] border-b px-[18px] py-4">
				<h2 className="font-bold text-base">
					{t("exampleTitle", { price: formatOrderMoney(price) })}
				</h2>
			</div>
			<dl className="flex flex-col gap-2 px-[18px] py-3.5 text-sm">
				<Line label={t("examplePaid")} value={formatOrderMoney(price)} />
				<Line
					label={t("exampleYourShare")}
					value={formatOrderMoney(supplierPrice)}
				/>
				<Line label={t("exampleMargin")} value={formatOrderMoney(margin)} />
				<Line
					label={t("exampleCommission", {
						rate: new Intl.NumberFormat(undefined, {
							maximumFractionDigits: 2,
						}).format(rateBps / 100),
					})}
					value={`− ${formatOrderMoney(commission)}`}
				/>
				<div className="flex justify-between border-[#E2E8F0] border-t pt-2.5">
					<dt className="font-semibold">{t("exampleGain")}</dt>
					<dd className="font-bold tabular-nums">
						{formatOrderMoney(margin - commission)}
					</dd>
				</div>
			</dl>
			{range ? (
				<p className="border-[#F1F5F9] border-t px-[18px] py-3 text-[#475569] text-[13px]">
					{t("rangeLine", {
						count: resellers,
						min: formatOrderMoney(range.min),
						max: formatOrderMoney(range.max),
					})}{" "}
					{range.min < minimum ? t("rangeBelow") : t("rangeAbove")}
				</p>
			) : null}
		</section>
	);
}

function Line({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-2">
			<dt className="text-[#64748B]">{label}</dt>
			<dd className="font-semibold tabular-nums">{value}</dd>
		</div>
	);
}

function PreviewStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<dt className="text-[#64748B]">{label}</dt>
			<dd className="font-bold text-[#0F172A] text-[15px] tabular-nums">
				{value}
			</dd>
		</div>
	);
}

function Toggle({
	label,
	checked,
	disabled,
	onChange,
}: {
	label: string;
	checked: boolean;
	disabled?: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={cn(
				"relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50",
				checked ? "bg-[#1E40AF]" : "bg-[#CBD5E1]",
			)}
		>
			<span
				className={cn(
					"absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all",
					checked ? "right-[3px]" : "left-[3px]",
				)}
			/>
		</button>
	);
}
