import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getMyShop } from "~/lib/server-shop";
import { ReturnClient } from "./return-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Verification.return");
	return { title: t("title") };
}

export default async function VerificationIdentityReturnPage({
	searchParams,
}: {
	searchParams: Promise<{ request?: string; app?: string }>;
}) {
	const [mine, params] = await Promise.all([getMyShop(), searchParams]);
	if (!mine?.shop) redirect("/shop/new");

	return (
		<ReturnClient
			shopId={mine.shop.id}
			requestId={params.request ?? null}
			app={params.app === "1"}
		/>
	);
}
