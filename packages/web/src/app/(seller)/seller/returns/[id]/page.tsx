import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReturnCaseClient } from "~/components/cases/return/return-case-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Returns");
	return { title: t("caseTitle") };
}

/** The seller surface of the split (spec §1): same case, workspace frame.
 * Auth = the /seller middleware matcher + the (seller) layout's getMyShop
 * gate — no page-level gate, unlike the buyer URL which self-gates. */
export default async function SellerReturnCasePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ReturnCaseClient caseId={id} surface="seller" />;
}
