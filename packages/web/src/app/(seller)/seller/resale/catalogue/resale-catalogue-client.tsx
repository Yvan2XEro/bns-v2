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
import { useCurrencyCode, useOrderMoney } from "~/hooks/use-order-money";
import {
	useAcceptResaleTerms,
	useCreateResaleListing,
	useCurrentResaleTerms,
	useRequestResaleLink,
	useResaleCatalogue,
} from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";
import {
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
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [addedTitle, setAddedTitle] = useState<string | null>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const debouncedSearch = useDebouncedValue(search, 250);
	const catalogue = useResaleCatalogue(shopId, debouncedSearch, supplier);
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
			<ol className="grid gap-4 rounded-xl border border-[#E2E8F0] bg-white px-[18px] py-3.5 md:grid-cols-3">
				{(["1", "2", "3"] as const).map((step) => (
					<li key={step} className="flex items-start gap-2.5">
						<span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-extrabold text-[#5B21B6] text-[13px]">
							{step}
						</span>
						<span className="flex flex-col gap-0.5">
							<span className="font-semibold text-[#0F172A] text-sm">
								{t(`step${step}Title`)}
							</span>
							<span className="text-[#64748B] text-[13px]">
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
				<output className="block rounded-lg bg-[#DCFCE7] p-3 font-medium text-[#166534] text-sm">
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
								className="absolute top-2.5 left-3 h-4 w-4 text-[#94A3B8]"
							/>
							<input
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								maxLength={120}
								placeholder={tCatalogue("search")}
								className="h-9 w-full rounded-full border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#DBEAFE]"
							/>
						</label>
						<button
							type="button"
							aria-pressed={codOnly}
							onClick={() => setCodOnly((value) => !value)}
							className={cn(
								"inline-flex h-8 items-center rounded-full border px-3 font-medium text-[13px]",
								codOnly
									? "border-[#0F172A] bg-[#0F172A] font-semibold text-white"
									: "border-[#E2E8F0] bg-white text-[#334155]",
							)}
						>
							{t("filterCod")}
						</button>
						{supplier ? (
							<Link
								href={resaleHref("reseller", "find")}
								className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#0F172A] bg-[#0F172A] px-3 font-semibold text-[13px] text-white"
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
						<p className="rounded-xl border border-[#CBD5E1] border-dashed bg-white px-6 py-14 text-center font-medium text-[#475569]">
							{search.trim() || codOnly
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
						<div className="rounded-xl border border-[#CBD5E1] border-dashed bg-white p-6 text-center text-[#64748B] text-sm">
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
	const imageUrl = firstImageUrl(product);
	const approved = product.linkStatus === "approved";
	const blocked =
		product.linkStatus === "suspended" || product.linkStatus === "revoked";
	const mustRequest = product.approvalRequired && !approved && !blocked;
	const requestPending = product.linkStatus === "requested";
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
				"flex flex-col overflow-hidden rounded-xl bg-white",
				selected ? "border-2 border-[#1E40AF]" : "border border-[#E2E8F0]",
			)}
		>
			<div className="relative flex h-[110px] items-center justify-center bg-[#F1F5F9] text-[#475569]">
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
				<h2 className="font-semibold text-[#0F172A] text-sm">
					{product.title}
				</h2>
				<dl className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 text-xs">
					<Stat
						label={t("supplierPrice")}
						value={
							supplierPrices.length
								? formatOrderMoney(Math.min(...supplierPrices))
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
									: t("hiddenUntilApproved")
						}
					/>
					<Stat
						label={t("resoldBy")}
						value={t("shopCount", { count: product.resellerCount ?? 0 })}
					/>
				</dl>
				<div className="flex items-center gap-1.5 border-[#F1F5F9] border-t pt-2">
					<span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-[#134E4A] font-extrabold text-[#99F6E4] text-[9px]">
						{initials(product.supplier.name)}
					</span>
					<span className="min-w-0 flex-1 truncate font-semibold text-[#334155] text-xs">
						{product.supplier.name}
					</span>
					{product.supplier.level >= 3 ? (
						<ShieldCheck
							aria-label={t("levelBadge", { level: product.supplier.level })}
							className="h-3.5 w-3.5 text-[#1E40AF]"
						/>
					) : null}
				</div>
				<span
					className={cn(
						"font-semibold text-[11px]",
						approved ? "text-[#15803D]" : "text-[#64748B]",
					)}
				>
					{approved
						? t("accessApproved")
						: blocked
							? t(`access_${product.linkStatus}`)
							: product.approvalRequired
								? t("accessOnApproval")
								: t("accessOpen")}
				</span>
				<div className="mt-auto">
					{product.inMyShop ? (
						<span className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#DCFCE7] font-semibold text-[#166534] text-[13px]">
							<Check aria-hidden="true" className="h-4 w-4" />
							{t("inMyShop")}
						</span>
					) : blocked ? null : mustRequest ? (
						<button
							type="button"
							disabled={isRequesting || requestPending}
							onClick={onRequest}
							className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] font-semibold text-[#0F172A] text-[13px] hover:bg-[#F8FAFC] disabled:opacity-60"
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
									? "bg-[#1E40AF] text-white"
									: "bg-[#EFF6FF] text-[#1E40AF] hover:bg-[#DBEAFE]",
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
			<dt className="text-[#64748B]">{label}</dt>
			<dd
				className={cn(
					"tabular-nums",
					strong
						? "font-bold text-[#0F172A] text-[15px]"
						: "font-semibold text-[#334155]",
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
			className="flex flex-col rounded-xl border border-[#E2E8F0] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
		>
			<div className="flex items-center justify-between border-[#F1F5F9] border-b px-[18px] py-4">
				<h2 id="resell-panel-title" className="font-bold text-base">
					{t("panelTitle")}
				</h2>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md p-1 text-[#64748B] hover:bg-[#F1F5F9]"
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
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#E2E8F0] text-[#334155]">
						<ImageIcon aria-hidden="true" className="h-6 w-6" />
					</div>
					<div className="flex min-w-0 flex-col gap-0.5">
						<span className="font-semibold">{product.title}</span>
						<span className="flex flex-wrap items-center gap-1.5 text-[#64748B] text-xs">
							{product.supplier.name}
							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold text-[11px]",
									product.supplier.level >= 3
										? "bg-[#1E40AF] text-white"
										: "bg-[#DBEAFE] text-[#1E40AF]",
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
										? "border-[#0F172A] bg-[#0F172A] text-white"
										: submitted && invalid(variant.id)
											? "border-red-300 text-red-700"
											: "border-[#E2E8F0] text-[#334155]",
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
						className="font-semibold text-[#334155] text-[13px]"
					>
						{t("yourPrice")}
					</label>
					<div className="flex h-[52px] items-center justify-between gap-2 rounded-[10px] border-2 border-[#1E40AF] px-3.5">
						<button
							type="button"
							onClick={() => setPrice(Math.max(1, price - 100))}
							className="rounded p-1 text-[#475569]"
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
							<span className="font-medium text-[#64748B] text-[13px]">
								{currencyCode}
							</span>
						</span>
						<button
							type="button"
							onClick={() => setPrice(price + 100)}
							className="rounded p-1 text-[#1E40AF]"
						>
							<Plus aria-hidden="true" className="h-[18px] w-[18px]" />
							<span className="sr-only">{t("increase")}</span>
						</button>
					</div>
					<span
						role={submitted && invalid(active.id) ? "alert" : undefined}
						className={cn(
							"font-semibold text-xs",
							invalid(active.id) ? "text-red-700" : "text-[#15803D]",
						)}
					>
						{t("minimumAndSuggested", {
							minimum: formatOrderMoney(active.minRetailPrice),
							suggested: formatOrderMoney(active.suggestedRetailPrice),
						})}
					</span>
				</div>
				{breakdown && typeof active.supplierPrice === "number" ? (
					<dl className="flex flex-col gap-2 rounded-[10px] bg-[#F8FAFC] px-3.5 py-3 text-sm">
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
						<div className="flex justify-between border-[#E2E8F0] border-t pt-2.5">
							<dt className="text-[#0F172A]">{t("gainPerSale")}</dt>
							<dd className="font-bold text-[#0F172A] tabular-nums">
								{formatOrderMoney(breakdown.gain)}
							</dd>
						</div>
					</dl>
				) : null}
				<ul className="flex flex-col gap-2 text-[#334155] text-[13px] leading-[18px]">
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
								className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[#16A34A]"
							/>
							{line}
						</li>
					))}
				</ul>
				<button
					type="submit"
					disabled={isCreating}
					className="h-11 rounded-lg bg-[#1E40AF] font-semibold text-[15px] text-white hover:bg-[#1E3A8A] disabled:opacity-60"
				>
					{isCreating ? t("adding") : t("addToShop")}
				</button>
				<span className="text-center text-[#94A3B8] text-xs">
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
			<dt className="text-[#64748B]">{label}</dt>
			<dd
				className={cn(
					"font-semibold tabular-nums",
					tone === "good" ? "text-[#15803D]" : "text-[#0F172A]",
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

function firstImageUrl(product: ResaleCatalogueProduct): string | null {
	const image = product.images?.[0]?.image;
	if (typeof image === "string") return null;
	return image?.thumbnailURL ?? image?.url ?? null;
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
		<section className="space-y-3 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-5">
			<h2 className="font-bold text-[#78350F]">{t("termsTitle")}</h2>
			<p className="text-[#78350F] text-sm">
				{t("termsIntro", { version: version ?? "—" })}
			</p>
			{isLoading ? (
				<p className="text-[#78350F] text-sm">{t("termsLoading")}</p>
			) : (
				<p className="max-h-48 overflow-auto whitespace-pre-wrap text-[#78350F] text-sm">
					{richText(body) || t("termsUnavailable")}
				</p>
			)}
			<button
				type="button"
				disabled={!version || isLoading || isPending}
				onClick={onAccept}
				className="min-h-11 rounded-xl bg-[#92400E] px-4 font-semibold text-sm text-white disabled:opacity-50"
			>
				{isPending ? t("acceptingTerms") : t("acceptTerms")}
			</button>
		</section>
	);
}
