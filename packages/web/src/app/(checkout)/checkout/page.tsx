import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { CheckoutClient } from "./checkout-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Checkout");
	return { title: t("title"), robots: { index: false, follow: false } };
}

// The middleware's protected list does not name /checkout, so the page gates itself.
export default async function CheckoutPage() {
	const user = await getAuthUser();
	if (!user)
		redirect(`/auth/login?redirect=${encodeURIComponent("/checkout")}`);

	return (
		<div className="container mx-auto max-w-2xl px-4 py-8 sm:px-6">
			<CheckoutClient />
		</div>
	);
}
