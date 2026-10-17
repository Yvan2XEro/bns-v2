"use client";

import {
	Check,
	ImageIcon,
	Lock,
	Minus,
	Plus,
	Repeat,
	Search,
	ShieldCheck,
	X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import { useNavCategories } from "~/hooks/use-nav-categories";
import { useCurrencyCode, useOrderMoney } from "~/hooks/use-order-money";
import {
	useAcceptResaleTerms,
	useCreateResaleListing,
	useCurrentResaleTerms,
	useRequestResaleLink,
	useResaleCatalogue,
} from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";
import { navRubrics } from "~/lib/nav";
import {
	cityLabel,
	resaleGain,
	resaleHref,
	supplierStockState,
	variantOptionLabel,
} from "~/lib/resale-hub";
import { cn } from "~/lib/utils";
import type { ResaleCatalogueProduct } from "../../../../../../../api/src/contracts/resale";

type Translator = ReturnType<typeof useTranslations<"SellerResaleHub">>;

export function ResaleCatalogueClient({
	shopId,
	supplier = "",
}: {
	shopId: string;
	supplier?: string;
}) {
	const t = useTranslations("SellerResaleHub");
	const tCatalogue = useTranslations("SellerResaleCatalogue");
	const tRoot = useTranslations();
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const [search, setSearch] = useState("");
	const [codOnly, setCodOnly] = useState(false);
	const [category, setCategory] = useState("");
	const [city, setCity] = useState("");
	const rubrics = navRubrics(useNavCategories(undefined));
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addedTitle, setAddedTitle] = useState<string | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const debouncedSearch = useDebouncedValue(search, 250);
	const catalogue = useResaleCatalogue(shopId, debouncedSearch, supplier, {
		category,
		city,
	});
	const cities = catalogue.data?.shipsFromCities ?? [];
	const termsError = catalogue.error?.code === "resale.termsNotAccepted";
	const terms = useCurrentResaleTerms("reseller");
	const acceptTerms = useAcceptResaleTerms(shopId);
	const createListing = useCreateResaleListing(shopId);
	const requestLink = useRequestResaleLink(shopId);
	const error =
		(termsError ? null : catalogue.error) ??
		createListing.error ??
		requestLink.error ??
		acceptTerms.error;
	const errorMessage = error
		? resolveErrorMessage(error, tRoot, tCatalogue("actionFailed"))
		: null;
	const allProducts = catalogue.data?.products ?? [];
	const products = codOnly
		? allProducts.filter((product) => product.codAccepted === true)
		: allProducts;
	const selected =
		allProducts.find((product) => product.productId === selectedId) ?? null;
	const supplierName = supplier
		? allProducts.find((product) => product.supplier.id === supplier)?.supplier
				.name
		: undefined;

	return (
		<div className="space-y-5">
			<ol className="grid gap-4 rounded-xl border border-line bg-surface px-[18px] py-3.5 md:grid-cols-3">
				{(["1", "2", "3"] as const).map((step) => (
					<li key={step} className="flex items-start gap-2.5">
						<span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-extrabold text-[#5B21B6] text-[13px]">
							{step}
						</span>
						<span className="flex flex-col gap-0.5">
							<span className="font-semibold text-ink text-sm">
								{t(`step${step}Title`)}
							</span>
							<span className="text-[13px] text-ink-muted">
								{t(`step${step}Body`)}
							</span>
						</span>
					</li>
				))}
			</ol>

			{errorMessage ? (
				<p
					role="alert"
					className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"
				>
					{errorMessage}
				</p>
			) : null}
			{addedTitle ? (
				<output className="block rounded-lg bg-ok-soft p-3 font-medium text-ok-ink text-sm">
					{t("added", { title: addedTitle })}{" "}
					<Link
						href={resaleHref("reseller", "resold")}
						className="font-semibold underline"
					>
						{t("seeResold")}
					</Link>
				</output>
			) : null}
			{termsError ? (
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

			<div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_380px]">
				<div className="min-w-0 space-y-3.5">
					<div className="flex flex-wrap items-center gap-2">
						<label className="relative block w-full sm:w-72">
							<span className="sr-only">{tCatalogue("search")}</span>
							<Search
								aria-hidden="true"
								className="absolute top-2.5 left-3 h-4 w-4 text-ink-faint"
							/>
							<input
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								maxLength={120}
								placeholder={tCatalogue("search")}
								className="h-9 w-full rounded-full border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-[var(--shop-accent,var(--c-brand))] focus:ring-2 focus:ring-[var(--shop-accent-border,var(--c-brand-tint))]"
							/>
						</label>
						{rubrics.length > 0 ? (
							<label
								className={cn(
									"inline-flex h-8 items-center rounded-full border px-3 text-[13px]",
									category
										? "border-ink bg-night font-semibold text-white"
										: "border-line bg-surface font-medium text-ink-soft",
								)}
							>
								<span className="sr-only">{t("filterCategory")}</span>
								<select
									value={category}
									onChange={(event) => setCategory(event.target.value)}
									className="max-w-44 cursor-pointer bg-transparent outline-none"
								>
									<option value="">{t("allCategories")}</option>
									{rubrics.map((rubric) => (
										<optgroup key={rubric.id} label={rubric.name}>
											<option value={rubric.id}>{rubric.name}</option>
											{rubric.children.map((child) => (
												<option key={child.id} value={child.id}>
													{child.name}
												</option>
											))}
										</optgroup>
									))}
								</select>
							</label>
						) : null}
						{cities.map((option) => (
							<button
								key={option}
								type="button"
								aria-pressed={city === option}
								onClick={() =>
									setCity((current) => (current === option ? "" : option))
								}
								className={cn(
									"inline-flex h-8 items-center rounded-full border px-3 font-medium text-[13px]",
									city === option
										? "border-ink bg-night font-semibold text-white"
										: "border-line bg-surface text-ink-soft",
								)}
							>
								{t("shipsFrom", { city: cityLabel(option) })}
							</button>
						))}
						<button
							type="button"
							aria-pressed={codOnly}
							onClick={() => setCodOnly((value) => !value)}
							className={cn(
								"inline-flex h-8 items-center rounded-full border px-3 font-medium text-[13px]",
								codOnly
									? "border-ink bg-night font-semibold text-white"
									: "border-line bg-surface text-ink-soft",
							)}
						>
							{t("filterCod")}
						</button>
						{supplier ? (
							<Link
								href={resaleHref("reseller", "find")}
								className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ink bg-night px-3 font-semibold text-[13px] text-white"
							>
								{supplierName ?? t("filterSupplier")}
								<X aria-hidden="true" className="h-3.5 w-3.5" />
								<span className="sr-only">{t("clearFilter")}</span>
							</Link>
						) : null}
					</div>

					{catalogue.isPending ? <LoadingRows /> : null}
					{catalogue.isError && !termsError ? (
						<LoadError
							title={tCatalogue("loadError")}
							onRetry={() => void catalogue.refetch()}
						/>
					) : null}
					{catalogue.data && products.length === 0 ? (
						<p className="rounded-xl border border-line-strong border-dashed bg-surface px-6 py-14 text-center font-medium text-ink-mid">
							{search.trim() || codOnly || category || city
								? tCatalogue("emptySearch")
								: tCatalogue("empty")}
						</p>
					) : null}
					<div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
						{products.map((product) => (
							<ProductCard
								key={product.productId}
								product={product}
								selected={product.productId === selectedId}
								t={t}
								isRequesting={requestLink.isPending}
								onSelect={() => {
									setAddedTitle(null);
									setSelectedId(product.productId);
									panelRef.current?.scrollIntoView({
										behavior: "smooth",
										block: "nearest",
									});
								}}
								onRequest={() => {
									const version = terms.data?.version;
									if (version)
										requestLink.mutate({
											supplierShop: product.supplier.id,
											acceptTermsVersion: version,
											productId: product.productId,
										});
								}}
							/>
						))}
					</div>
				</div>
				<div ref={panelRef} className="lg:sticky lg:top-6">
					{selected ? (
						<ResellPanel
							key={selected.productId}
							product={selected}
							rateBps={catalogue.data?.commissionRateBps ?? null}
							isCreating={createListing.isPending}
							onClose={() => setSelectedId(null)}
							onSubmit={(prices) =>
								createListing.mutate(
									{
										productId: selected.productId,
										prices,
										desiredStatus: "published",
									},
									{
										onSuccess: () => {
											setAddedTitle(selected.title);
											setSelectedId(null);
										},
									},
								)
							}
						/>
					) : (
						<div className="rounded-xl border border-line-strong border-dashed bg-surface p-6 text-center text-ink-muted text-sm">
							{t("panelEmpty")}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function ProductCard({
	product,
	selected,
	t,
	isRequesting,
	onSelect,
	onRequest,
}: {
	product: ResaleCatalogueProduct;
	selected: boolean;
	t: Translator;
	isRequesting: boolean;
	onSelect: () => void;
	onRequest: () => void;
}) {
	const formatOrderMoney = useOrderMoney();
	const imageUrl = product.imageUrl ?? null;
	const approved = product.linkStatus === "approved";
	const blocked =
		product.linkStatus === "suspended" || product.linkStatus === "revoked";
	const mustRequest = product.approvalRequired && !approved && !blocked;
	const requestPending = product.linkStatus === "requested";
	const levelLocked = product.levelLocked === true;
	const supplierPrices = product.variants
		.map((variant) => variant.supplierPrice)
		.filter((value): value is number => typeof value === "number");
	const minimums = product.variants
		.map((variant) => variant.minRetailPrice)
		.filter((value): value is number => typeof value === "number");
	const stock = supplierStockState(
		product.variants.map((variant) => variant.supplierStock),
	);

	return (
		<article
			className={cn(
				"flex flex-col overflow-hidden rounded-xl bg-surface",
				selected
					? "border-2 border-[var(--shop-accent,var(--c-brand))]"
					: "border border-line",
			)}
		>
			<div className="relative flex h-[110px] items-center justify-center bg-subtle text-ink-mid">
				{imageUrl ? (
					<Image
						src={imageUrl}
						alt=""
						fill
						sizes="(min-width: 1280px) 260px, 50vw"
						className="object-cover"
					/>
				) : (
					<ImageIcon aria-hidden="true" className="h-10 w-10 stroke-[1.2]" />
				)}
			</div>
			<div className="flex flex-1 flex-col gap-2 p-3">
				<h2 className="font-semibold text-ink text-sm">{product.title}</h2>
				<dl className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-xs">
					<Stat
						label={t("supplierPrice")}
						value={
							supplierPrices.length
								? formatOrderMoney(Math.min(...supplierPrices))
								: levelLocked
									? "—"
									: t("hiddenUntilApproved")
						}
						strong={supplierPrices.length > 0}
					/>
					<Stat
						label={t("minimumPrice")}
						value={
							minimums.length ? formatOrderMoney(Math.min(...minimums)) : "—"
						}
						strong
					/>
					<Stat
						label={t("supplierStock")}
						value={
							stock.kind === "count"
								? String(stock.count)
								: stock.kind === "in_stock"
									? t("stockInStock")
									: levelLocked
										? "—"
										: t("hiddenUntilApproved")
						}
					/>
					<Stat
						label={t("resoldBy")}
						value={t("shopCount", { count: product.resellerCount ?? 0 })}
					/>
				</dl>
				<div className="flex items-center gap-1.5 border-subtle border-t pt-2">
					<span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[#134E4A] font-extrabold text-[#99F6E4] text-[9px]">
						{initials(product.supplier.name)}
					</span>
					<span className="min-w-0 flex-1 truncate font-semibold text-ink-soft text-xs">
						{product.supplier.name}
					</span>
					{product.supplier.level >= 3 ? (
						<ShieldCheck
							aria-label={t("levelBadge", { level: product.supplier.level })}
							className="h-3.5 w-3.5 text-[var(--shop-accent-text,var(--c-brand))]"
						/>
					) : null}
				</div>
				<span
					className={cn(
						"font-semibold text-[11px]",
						approved ? "text-ok-ink-soft" : "text-ink-muted",
					)}
				>
					{levelLocked
						? t("levelReserved", { level: product.minResellerLevel ?? 3 })
						: approved
							? t("accessApproved")
							: blocked
								? t(`access_${product.linkStatus}`)
								: product.approvalRequired
									? t("accessOnApproval")
									: t("accessOpen")}
				</span>
				<div className="mt-auto">
					{product.inMyShop ? (
						<span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ok-soft font-semibold text-[13px] text-ok-ink">
							<Check aria-hidden="true" className="h-4 w-4" />
							{t("inMyShop")}
						</span>
					) : levelLocked ? (
						<span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-subtle px-2 text-center font-semibold text-[12px] text-ink-mid">
							<Lock aria-hidden="true" className="h-4 w-4 shrink-0" />
							{t("levelReserved", { level: product.minResellerLevel ?? 3 })}
						</span>
					) : blocked ? null : mustRequest ? (
						<button
							type="button"
							disabled={isRequesting || requestPending}
							onClick={onRequest}
							className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line font-semibold text-[13px] text-ink hover:bg-canvas disabled:opacity-60"
						>
							<Lock aria-hidden="true" className="h-4 w-4" />
							{requestPending ? t("requestSent") : t("requestAccess")}
						</button>
					) : (
						<button
							type="button"
							onClick={onSelect}
							aria-pressed={selected}
							className={cn(
								"flex h-9 w-full items-center justify-center gap-1.5 rounded-lg font-semibold text-[13px]",
								selected
									? "bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)]"
									: "bg-[var(--shop-accent-soft,var(--c-brand-soft))] text-[var(--shop-accent-text,var(--c-brand))] hover:bg-[var(--shop-accent-soft,var(--c-brand-tint))]",
							)}
						>
							<Repeat aria-hidden="true" className="h-4 w-4" />
							{t("resell")}
						</button>
					)}
				</div>
			</div>
		</article>
	);
}

function Stat({
	label,
	value,
	strong = false,
}: {
	label: string;
	value: string;
	strong?: boolean;
}) {
	return (
		<div className="flex flex-col">
			<dt className="text-ink-muted">{label}</dt>
			<dd
				className={cn(
					"tabular-nums",
					strong
						? "font-bold text-[15px] text-ink"
						: "font-semibold text-ink-soft",
				)}
			>
				{value}
			</dd>
		</div>
	);
}

function ResellPanel({
	product,
	rateBps,
	isCreating,
	onClose,
	onSubmit,
}: {
	product: ResaleCatalogueProduct;
	rateBps: number | null;
	isCreating: boolean;
	onClose: () => void;
	onSubmit: (prices: Array<{ variantId: string; price: number }>) => void;
}) {
	const t = useTranslations("SellerResaleHub");
	const formatOrderMoney = useOrderMoney();
	const currencyCode = useCurrencyCode();
	const [activeId, setActiveId] = useState(product.variants[0]?.id ?? "");
	const [prices, setPrices] = useState<Record<string, number>>(() =>
		Object.fromEntries(
			product.variants.map((variant) => [
				variant.id,
				variant.suggestedRetailPrice ?? variant.minRetailPrice ?? 1,
			]),
		),
	);
	const [submitted, setSubmitted] = useState(false);
	const active =
		product.variants.find((variant) => variant.id === activeId) ??
		product.variants[0];
	if (!active) return null;
	const price = prices[active.id] ?? 0;
	const invalid = (variantId: string) => {
		const variant = product.variants.find((entry) => entry.id === variantId);
		const value = prices[variantId] ?? 0;
		if (!variant || !Number.isSafeInteger(value) || value < 1) return true;
		if (variant.minRetailPrice !== null && value < variant.minRetailPrice)
			return true;
		return (
			variant.suggestedRetailPrice !== null &&
			value > variant.suggestedRetailPrice * 2
		);
	};
	const firstInvalid = product.variants.find((variant) => invalid(variant.id));
	const setPrice = (value: number) =>
		setPrices((current) => ({ ...current, [active.id]: value }));
	const breakdown =
		typeof active.supplierPrice === "number" && rateBps !== null
			? resaleGain(price, active.supplierPrice, rateBps)
			: null;

	return (
		<section
			aria-labelledby="resell-panel-title"
			className="flex flex-col rounded-xl border border-line bg-surface shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
		>
			<div className="flex items-center justify-between border-subtle border-b px-[18px] py-4">
				<h2 id="resell-panel-title" className="font-bold text-base">
					{t("panelTitle")}
				</h2>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md p-1 text-ink-muted hover:bg-subtle"
				>
					<X aria-hidden="true" className="h-[18px] w-[18px]" />
					<span className="sr-only">{t("close")}</span>
				</button>
			</div>
			<form
				className="flex flex-col gap-4 px-[18px] py-4"
				onSubmit={(event) => {
					event.preventDefault();
					setSubmitted(true);
					if (firstInvalid) {
						setActiveId(firstInvalid.id);
						return;
					}
					onSubmit(
						product.variants.map((variant) => ({
							variantId: variant.id,
							price: prices[variant.id] ?? 0,
						})),
					);
				}}
			>
				<div className="flex items-center gap-3">
					<div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-line text-ink-soft">
						{product.imageUrl ? (
							<Image
								src={product.imageUrl}
								alt=""
								fill
								sizes="48px"
								className="object-cover"
							/>
						) : (
							<ImageIcon aria-hidden="true" className="h-6 w-6" />
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="font-semibold">{product.title}</span>
						<span className="flex flex-wrap items-center gap-1.5 text-ink-muted text-xs">
							{product.supplier.name}
							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[11px]",
									product.supplier.level >= 3
										? "bg-[var(--shop-accent,var(--c-brand-fill))] text-[var(--shop-on-accent,#FFFFFF)]"
										: "bg-[var(--shop-accent-soft,var(--c-brand-tint))] text-[var(--shop-accent-text,var(--c-brand))]",
								)}
							>
								<ShieldCheck aria-hidden="true" className="h-3 w-3" />
								{t("levelBadge", { level: product.supplier.level })}
							</span>
						</span>
					</div>
				</div>
				{product.variants.length > 1 ? (
					<fieldset className="flex flex-wrap gap-1.5">
						<legend className="sr-only">{t("variants")}</legend>
						{product.variants.map((variant, index) => (
							<button
								key={variant.id}
								type="button"
								aria-pressed={variant.id === active.id}
								onClick={() => setActiveId(variant.id)}
								className={cn(
									"h-8 rounded-full border px-3 font-medium text-xs",
									variant.id === active.id
										? "border-ink bg-night text-white"
										: submitted && invalid(variant.id)
											? "border-red-300 text-red-700"
											: "border-line text-ink-soft",
								)}
							>
								{variantOptionLabel(
									variant.optionValues,
									variant.sku,
									t("variantN", { index: index + 1 }),
								)}
							</button>
						))}
					</fieldset>
				) : null}
				<div className="flex flex-col gap-1.5">
					<label
						htmlFor="resell-price"
						className="font-semibold text-[13px] text-ink-soft"
					>
						{t("yourPrice")}
					</label>
					<div className="flex h-[52px] items-center justify-between gap-2 rounded-[10px] border-2 border-[var(--shop-accent,var(--c-brand))] px-3.5">
						<button
							type="button"
							onClick={() => setPrice(Math.max(1, price - 100))}
							className="rounded p-1 text-ink-mid"
						>
							<Minus aria-hidden="true" className="h-[18px] w-[18px]" />
							<span className="sr-only">{t("decrease")}</span>
						</button>
						<span className="flex items-baseline gap-1">
							<input
								id="resell-price"
								type="number"
								inputMode="numeric"
								min={active.minRetailPrice ?? 1}
								step={1}
								value={Number.isFinite(price) ? price : ""}
								onChange={(event) => setPrice(event.target.valueAsNumber)}
								aria-invalid={submitted && invalid(active.id)}
								className="w-28 bg-transparent text-right font-extrabold text-[22px] tabular-nums outline-none"
							/>
							<span className="font-medium text-[13px] text-ink-muted">
								{currencyCode}
							</span>
						</span>
						<button
							type="button"
							onClick={() => setPrice(price + 100)}
							className="rounded p-1 text-[var(--shop-accent-text,var(--c-brand))]"
						>
							<Plus aria-hidden="true" className="h-[18px] w-[18px]" />
							<span className="sr-only">{t("increase")}</span>
						</button>
					</div>
					<span
						role={submitted && invalid(active.id) ? "alert" : undefined}
						className={cn(
							"font-semibold text-xs",
							invalid(active.id) ? "text-red-700" : "text-ok-ink-soft",
						)}
					>
						{t("minimumAndSuggested", {
							minimum: formatOrderMoney(active.minRetailPrice),
							suggested: formatOrderMoney(active.suggestedRetailPrice),
						})}
					</span>
				</div>
				{breakdown && typeof active.supplierPrice === "number" ? (
					<dl className="flex flex-col gap-2 rounded-[10px] bg-canvas px-3.5 py-3 text-sm">
						<Row
							label={t("supplierPrice")}
							value={formatOrderMoney(active.supplierPrice)}
						/>
						<Row
							label={t("yourMargin")}
							value={`+ ${formatOrderMoney(breakdown.margin)}`}
							tone="good"
						/>
						<Row
							label={t("commission", {
								rate: new Intl.NumberFormat(undefined, {
									maximumFractionDigits: 2,
								}).format((rateBps ?? 0) / 100),
							})}
							value={`− ${formatOrderMoney(breakdown.commission)}`}
						/>
						<div className="flex justify-between border-line border-t pt-2.5">
							<dt className="text-ink">{t("gainPerSale")}</dt>
							<dd className="font-bold text-ink tabular-nums">
								{formatOrderMoney(breakdown.gain)}
							</dd>
						</div>
					</dl>
				) : null}
				<ul className="flex flex-col gap-2 text-[13px] text-ink-soft leading-[18px]">
					{[
						product.handlingHours
							? t("conditionShips", { hours: product.handlingHours })
							: t("conditionShipsDefault"),
						t("conditionDefects"),
						t("conditionRefusal"),
						t("conditionPayout"),
						...(product.codAccepted ? [t("conditionCod")] : []),
					].map((line) => (
						<li key={line} className="flex gap-2">
							<Check
								aria-hidden="true"
								className="mt-0.5 h-[15px] w-[15px] shrink-0 text-ok"
							/>
							{line}
						</li>
					))}
				</ul>
				<button
					type="submit"
					disabled={isCreating}
					className="h-11 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] font-semibold text-[15px] text-[var(--shop-on-accent,#FFFFFF)] hover:bg-[var(--shop-accent-hover,var(--c-brand-strong))] disabled:opacity-60"
				>
					{isCreating ? t("adding") : t("addToShop")}
				</button>
				<span className="text-center text-ink-faint text-xs">
					{t("stockFollows")}
				</span>
			</form>
		</section>
	);
}

function Row({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone?: "good";
}) {
	return (
		<div className="flex justify-between">
			<dt className="text-ink-muted">{label}</dt>
			<dd
				className={cn(
					"font-semibold tabular-nums",
					tone === "good" ? "text-ok-ink-soft" : "text-ink",
				)}
			>
				{value}
			</dd>
		</div>
	);
}

export function initials(name: string): string {
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? "")
			.join("") || "?"
	);
}

export function richText(value: unknown): string {
	const pieces: string[] = [];
	const visit = (node: unknown) => {
		if (!isRecord(node)) return;
		if (typeof node.text === "string" && node.text.trim())
			pieces.push(node.text.trim());
		if (Array.isArray(node.children))
			for (const child of node.children) visit(child);
	};
	if (isRecord(value) && isRecord(value.root)) visit(value.root);
	return pieces.join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function TermsAcceptance({
	body,
	version,
	isLoading,
	isPending,
	onAccept,
	t,
}: {
	body: unknown;
	version: string | undefined;
	isLoading: boolean;
	isPending: boolean;
	onAccept: () => void;
	t: ReturnType<typeof useTranslations<"SellerResaleCatalogue">>;
}) {
	return (
		<section className="space-y-3 rounded-2xl border border-warn-line bg-warn-faint p-5">
			<h2 className="font-bold text-warn-ink-strong">{t("termsTitle")}</h2>
			<p className="text-sm text-warn-ink-strong">
				{t("termsIntro", { version: version ?? "—" })}
			</p>
			{isLoading ? (
				<p className="text-sm text-warn-ink-strong">{t("termsLoading")}</p>
			) : (
				<p className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-warn-ink-strong">
					{richText(body) || t("termsUnavailable")}
				</p>
			)}
			<button
				type="button"
				disabled={!version || isLoading || isPending}
				onClick={onAccept}
				className="min-h-11 rounded-xl bg-warn-ink px-4 font-semibold text-sm text-white disabled:opacity-50"
			>
				{isPending ? t("acceptingTerms") : t("acceptTerms")}
			</button>
		</section>
	);
}
