"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useSupplierResaleProducts } from "~/hooks/use-resale";
import { resolveErrorMessage } from "~/lib/apiError";

export function ResaleOfferedClient({ shopId }: { shopId: string }) {
	const t = useTranslations("SellerResaleOffered");
	const tRoot = useTranslations();
	const query = useSupplierResaleProducts(shopId);
	const error = query.error
		? resolveErrorMessage(query.error, tRoot, t("loadError"))
		: null;
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
						className="min-h-11 rounded-lg border border-[#B45309] bg-[#FFFBEB] px-4 py-3 font-semibold text-[#92400E] text-sm"
						href="/seller/resale/offered"
						aria-current="page"
					>
						{t("title")}
					</Link>
					<Link
						className="min-h-11 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 font-semibold text-[#334155] text-sm"
						href="/seller/resale/resellers"
					>
						{t("resellers")}
					</Link>
					<Link
						className="min-h-11 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 font-semibold text-[#334155] text-sm"
						href="/seller/resale/purchase-orders"
					>
						{t("purchaseOrders")}
					</Link>
				</nav>
			</header>
			{error ? (
				<p
					role="alert"
					className="rounded-lg bg-red-50 p-3 text-red-800 text-sm"
				>
					{error}
				</p>
			) : null}
			{query.isPending ? <LoadingRows /> : null}
			{query.isError ? (
				<LoadError
					title={t("loadError")}
					onRetry={() => void query.refetch()}
				/>
			) : null}
			{query.data?.products.length === 0 ? (
				<p className="rounded-2xl border border-[#CBD5E1] border-dashed bg-white px-6 py-14 text-center font-medium text-[#475569]">
					{t("empty")}
				</p>
			) : null}
			<div className="grid gap-4">
				{query.data?.products.map((product) => (
					<article
						key={product.productId}
						className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5"
					>
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div>
								<h2 className="font-bold text-[#0F172A]">{product.title}</h2>
								<p className="mt-1 text-[#64748B] text-sm">
									{t("productStats", {
										resellers: product.resellerCount,
										units: product.unitsDelivered30d,
									})}
								</p>
							</div>
							<Link
								href={`/seller/catalogue/${encodeURIComponent(product.productId)}`}
								className="inline-flex min-h-11 items-center rounded-lg bg-[#0F172A] px-4 font-semibold text-sm text-white"
							>
								{t("editProduct")}
							</Link>
						</div>
						{product.pendingEffectiveAt ? (
							<p className="rounded-lg bg-amber-50 p-3 text-amber-900 text-sm">
								{t("pendingIncrease", {
									date: new Intl.DateTimeFormat(undefined, {
										dateStyle: "medium",
										timeStyle: "short",
									}).format(new Date(product.pendingEffectiveAt)),
								})}
							</p>
						) : null}
						<div className="overflow-x-auto">
							<table className="w-full min-w-[680px] text-left text-sm">
								<thead className="border-[#E2E8F0] border-b text-[#64748B]">
									<tr>
										<th className="py-3 pr-4">{t("variant")}</th>
										<th className="py-3 pr-4">{t("supplierPrice")}</th>
										<th className="py-3 pr-4">{t("minimum")}</th>
										<th className="py-3 pr-4">{t("suggested")}</th>
										<th className="py-3">{t("resellerPrices")}</th>
									</tr>
								</thead>
								<tbody>
									{product.variants.map((variant) => (
										<tr key={variant.id} className="border-[#F1F5F9] border-b">
											<th
												scope="row"
												className="py-3 pr-4 font-semibold text-[#0F172A]"
											>
												{variant.sku || t("defaultVariant")}
											</th>
											<td className="py-3 pr-4">
												{money(variant.supplierPrice)}
											</td>
											<td className="py-3 pr-4">
												{money(variant.minRetailPrice)}
											</td>
											<td className="py-3 pr-4">
												{money(variant.suggestedRetailPrice)}
											</td>
											<td className="py-3">
												{variant.resellerPrices.length
													? variant.resellerPrices.map(money).join(" · ")
													: "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

function money(amount: number | null) {
	return amount === null
		? "—"
		: new Intl.NumberFormat(undefined, {
				style: "currency",
				currency: "XAF",
				maximumFractionDigits: 0,
			}).format(amount);
}
