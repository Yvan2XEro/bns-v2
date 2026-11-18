import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DisputeThreadClient } from "~/components/cases/dispute/dispute-thread-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Disputes");
	return { title: t("title") };
}

export default async function SellerDisputePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <DisputeThreadClient disputeId={id} surface="seller" />;
}
