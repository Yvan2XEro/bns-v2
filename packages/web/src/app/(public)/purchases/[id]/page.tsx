import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { PurchaseClient } from "./purchase-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Purchases");
	return { title: t("title") };
}

export default async function PurchasePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!(await getAuthUser())) {
		redirect(`/auth/login?redirect=${encodeURIComponent(`/purchases/${id}`)}`);
	}
	return <PurchaseClient orderId={id} />;
}
