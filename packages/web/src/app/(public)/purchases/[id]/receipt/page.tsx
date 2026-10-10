import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { orderActionPath } from "~/lib/order-actions";
import { serverFetch } from "~/lib/server-api";
import { receiptBody } from "../../purchase-view";
import { ReceiptActions } from "./receipt-actions";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Purchases");
	return { title: t("receiptTitle") };
}

/**
 * `GET /api/orders/{id}/receipt` authenticates on the Payload session
 * cookie and answers HTML. A plain link to it would open in a tab that may
 * not carry the session and get a bare 401 JSON body; fetching it here, with
 * the caller's cookie forwarded by `serverFetch`, renders it in the site's
 * own print layout instead, and the download is that same document. The
 * path comes from `order-actions.ts` rather than the hook's
 * `orderReceiptUrl`: that module is `"use client"`, so its exports cannot be
 * called from a Server Component.
 */
export default async function ReceiptPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const t = await getTranslations("Purchases");
	const locale = (await getLocale()) === "en" ? "en" : "fr";
	const response = await serverFetch(
		`${orderActionPath("receipt", id)}?lang=${locale}`,
		{
			headers: { Accept: "text/html" },
		},
	);

	if (response.status === 401) {
		redirect(
			`/auth/login?redirect=${encodeURIComponent(`/purchases/${id}/receipt`)}`,
		);
	}
	if (response.status === 404) notFound();
	if (!response.ok) {
		return (
			<p role="alert" className="mx-auto max-w-3xl px-4 py-12 text-center">
				{t("receiptUnavailable")}
			</p>
		);
	}

	const html = await response.text();

	return (
		<div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
			<style>{`@media print {
	body * { visibility: hidden; }
	#order-receipt, #order-receipt * { visibility: visible; }
	#order-receipt { position: absolute; inset: 0 auto auto 0; width: 100%; }
}`}</style>
			<ReceiptActions orderId={id} html={html} />
			<article
				id="order-receipt"
				className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-[#111] [&_h1]:mb-4 [&_h1]:font-bold [&_h1]:text-2xl [&_p]:my-1 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border-[#ddd] [&_td]:border-b [&_td]:px-2 [&_td]:py-1 [&_th]:border-[#ddd] [&_th]:border-b [&_th]:px-2 [&_th]:py-1 [&_th]:text-left"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: the API's own receipt, every interpolated value escaped by `renderReceiptHtml`
				dangerouslySetInnerHTML={{ __html: receiptBody(html) }}
			/>
		</div>
	);
}
