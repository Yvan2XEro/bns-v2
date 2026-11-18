import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { GroupClient } from "./group-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("CheckoutGroup");
	return { title: t("groupTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutGroupPage({
	params,
}: {
	params: Promise<{ group: string }>;
}) {
	const { group } = await params;
	const user = await getAuthUser();
	if (!user) {
		redirect(
			`/auth/login?redirect=${encodeURIComponent(`/checkout/group/${group}`)}`,
		);
	}

	return (
		<div className="container mx-auto max-w-xl px-4 py-8 sm:px-6">
			<GroupClient group={group} />
		</div>
	);
}
