"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Search, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useDebouncedValue } from "~/hooks/use-debounced-value";
import {
	useAcceptResaleTerms,
	useCreateResaleListing,
	useCurrentResaleTerms,
	useRequestResaleLink,
	useResaleCatalogue,
} from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";
import { formatXaf } from "~/lib/order-money";
import type {
	CreateResaleListingInput,
	ResaleCatalogueProduct,
} from "../../../../../../../api/src/contracts/resale";

const priceSchema = z.object({
	prices: z.array(
		z.object({
			variantId: z.string().min(1),
			price: z.number().int().positive(),
		}),
	),
});
type PriceValues = z.infer<typeof priceSchema>;

export function ResaleCatalogueClient({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleCatalogue");
	const tRoot = useTranslations();
	const locale = useLocale().startsWith("fr") ? "fr" : "en";
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebouncedValue(search, 250);
	const catalogue = useResaleCatalogue(shopId, debouncedSearch);
	const termsError = catalogue.error?.code === "resale.termsNotAccepted";
	const terms = useCurrentResaleTerms("reseller");
	const acceptTerms = useAcceptResaleTerms(shopId);
	const createListing = useCreateResaleListing(shopId);
	const requestLink = useRequestResaleLink(shopId);
	const error =
		catalogue.error ??
		createListing.error ??
		requestLink.error ??
		acceptTerms.error;
	const errorMessage = error
		? resolveErrorMessage(error, tRoot, t("actionFailed"))
		: null;
	const products = catalogue.data?.products ?? [];

	return (
		<section className="space-y-6">
			<header className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="font-semibold text-[#B45309] text-xs uppercase tracking-[0.18em]">
						BuyNSellem · Resale
					</p>
					<h1 className="mt-2 font-bold text-2xl text-[#0F172A]">
						{t("title")}
					</h1>
					<p className="mt-1 max-w-2xl text-[#64748B] text-sm">
						{t("description")}
					</p>
				</div>
				<nav aria-label={t("navigation")} className="flex flex-wrap gap-2">
					<Link
						href="/seller/resale/suppliers"
						className="inline-flex min-h-11 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#334155] text-sm hover:bg-[#F8FAFC]"
					>
						{t("suppliers")}
					</Link>
					<Link
						href="/seller/resale/purchase-orders"
						className="inline-flex min-h-11 items-center rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#334155] text-sm hover:bg-[#F8FAFC]"
					>
						{t("purchaseOrders")}
					</Link>
				</nav>
			</header>

			<label className="relative block max-w-lg">
				<span className="sr-only">{t("search")}</span>
				<Search
					aria-hidden="true"
					className="absolute top-3 left-3 h-4 w-4 text-[#94A3B8]"
				/>
				<input
					type="search"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					maxLength={120}
					placeholder={t("search")}
					className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-white pr-3 pl-9 text-sm outline-none focus:border-[#B45309] focus:ring-2 focus:ring-[#FDE68A]"
				/>
			</label>

			{errorMessage ? (
				<p
					role="alert"
					className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"
				>
					{errorMessage}
				</p>
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
					t={t}
				/>
			) : null}
			{catalogue.isPending ? <LoadingRows /> : null}
			{catalogue.isError && !termsError ? (
				<LoadError
					title={t("loadError")}
					onRetry={() => void catalogue.refetch()}
				/>
			) : null}
			{catalogue.data && products.length === 0 ? (
				<p className="rounded-2xl border border-[#CBD5E1] border-dashed bg-white px-6 py-14 text-center font-medium text-[#475569]">
					{search.trim() ? t("emptySearch") : t("empty")}
				</p>
			) : null}
			<div className="grid gap-4 xl:grid-cols-2">
				{products.map((product) => (
					<ProductCard
						key={product.productId}
						product={product}
						locale={locale}
						t={t}
						isCreating={createListing.isPending}
						isRequesting={requestLink.isPending}
						onCreate={(input) => createListing.mutate(input)}
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
		</section>
	);
}

function ProductCard({
	product,
	locale,
	t,
	isCreating,
	isRequesting,
	onCreate,
	onRequest,
}: {
	product: ResaleCatalogueProduct;
	locale: "fr" | "en";
	t: ReturnType<typeof useTranslations<"SellerResaleCatalogue">>;
	isCreating: boolean;
	isRequesting: boolean;
	onCreate: (input: CreateResaleListingInput) => void;
	onRequest: () => void;
}) {
	const imageUrl = firstImageUrl(product);
	const mustRequest =
		product.approvalRequired && product.linkStatus !== "approved";
	const requestPending = product.linkStatus === "requested";
	const form = useForm<PriceValues>({
		resolver: zodResolver(priceSchema),
		defaultValues: {
			prices: product.variants.map((variant) => ({
				variantId: variant.id,
				price: variant.suggestedRetailPrice ?? variant.minRetailPrice ?? 1,
			})),
		},
	});
	const submit = form.handleSubmit((values) => {
		const belowMinimum = values.prices.findIndex((price) => {
			const variant = product.variants.find(
				(entry) => entry.id === price.variantId,
			);
			return (
				variant?.minRetailPrice !== null &&
				variant?.minRetailPrice !== undefined &&
				price.price < variant.minRetailPrice
			);
		});
		if (belowMinimum >= 0) {
			form.setError(`prices.${belowMinimum}.price`, {
				message: t("belowMinimum"),
			});
			return;
		}
		onCreate({
			productId: product.productId,
			prices: values.prices,
			desiredStatus: "published",
		});
	});

	return (
		<article className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm">
			<div className="flex gap-4 border-[#E2E8F0] border-b p-4">
				<div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
					{imageUrl ? (
						<Image
							src={imageUrl}
							alt=""
							fill
							sizes="96px"
							className="object-cover"
						/>
					) : (
						<div className="grid h-full place-items-center text-[#94A3B8]">
							<ImageIcon aria-hidden="true" className="h-7 w-7" />
						</div>
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-start justify-between gap-2">
						<h2 className="font-bold text-[#0F172A]">{product.title}</h2>
						<span className="inline-flex items-center gap-1 rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[#475569] text-xs">
							<Store aria-hidden="true" className="h-3.5 w-3.5" />
							{product.supplier.name}
						</span>
					</div>
					{product.description ? (
						<p className="mt-1 line-clamp-2 text-[#64748B] text-sm">
							{product.description}
						</p>
					) : null}
					{product.linkStatus ? (
						<p className="mt-2 text-[#64748B] text-xs">
							{t(`link.${product.linkStatus}`)}
						</p>
					) : null}
				</div>
			</div>
			{mustRequest ? (
				<div className="p-4">
					<p className="mb-3 text-[#475569] text-sm">{t("approvalRequired")}</p>
					<button
						type="button"
						disabled={isRequesting || requestPending}
						onClick={onRequest}
						className="min-h-11 w-full rounded-xl bg-[#B45309] px-4 font-semibold text-sm text-white hover:bg-[#92400E] disabled:opacity-50"
					>
						{requestPending ? t("requestPending") : t("requestApproval")}
					</button>
				</div>
			) : (
				<form
					onSubmit={(event) => void submit(event)}
					className="space-y-3 p-4"
				>
					<div className="grid gap-2 sm:grid-cols-2">
						{product.variants.map((variant, index) => (
							<label
								key={variant.id}
								className="space-y-1 rounded-lg bg-[#F8FAFC] p-3"
							>
								<span className="block font-medium text-[#334155] text-xs">
									{optionLabel(
										variant.optionValues,
										variant.sku,
										t("variant", { index: index + 1 }),
									)}
								</span>
								{variant.supplierPrice !== undefined ? (
									<span className="block text-[#64748B] text-xs">
										{t("supplierPrice")}:{" "}
										{formatXaf(variant.supplierPrice, locale)}
									</span>
								) : null}
								<input
									type="hidden"
									{...form.register(`prices.${index}.variantId`)}
									value={variant.id}
								/>
								<span className="flex items-center gap-2">
									<input
										type="number"
										min={variant.minRetailPrice ?? 1}
										step={1}
										inputMode="numeric"
										aria-label={t("retailPrice", { variant: index + 1 })}
										{...form.register(`prices.${index}.price`, {
											valueAsNumber: true,
										})}
										className="h-10 min-w-0 flex-1 rounded-md border border-[#CBD5E1] bg-white px-2 text-sm"
									/>
									<span className="text-[#64748B] text-xs">XAF</span>
								</span>
								{form.formState.errors.prices?.[index]?.price?.message ? (
									<span role="alert" className="block text-red-700 text-xs">
										{form.formState.errors.prices[index]?.price?.message}
									</span>
								) : null}
							</label>
						))}
					</div>
					<button
						type="submit"
						disabled={isCreating}
						className="min-h-11 w-full rounded-xl bg-[#0F172A] px-4 font-semibold text-sm text-white hover:bg-[#334155] disabled:opacity-50"
					>
						{isCreating ? t("publishing") : t("publish")}
					</button>
				</form>
			)}
		</article>
	);
}

function firstImageUrl(product: ResaleCatalogueProduct): string | null {
	const image = product.images?.[0]?.image;
	if (typeof image === "string") return null;
	return image?.thumbnailURL ?? image?.url ?? null;
}

function optionLabel(
	values: unknown,
	sku: string | null,
	fallback: string,
): string {
	if (typeof values === "string" && values.trim()) return values;
	if (Array.isArray(values)) {
		const labels = values.filter(
			(value): value is string => typeof value === "string",
		);
		if (labels.length) return labels.join(" · ");
	}
	if (typeof values === "object" && values !== null) {
		const labels = Object.values(values).filter(
			(value): value is string => typeof value === "string",
		);
		if (labels.length) return labels.join(" · ");
	}
	return sku ?? fallback;
}

function richText(value: unknown): string {
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

function TermsAcceptance({
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
