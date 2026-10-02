import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isConfirmationRequired } from "~/lib/checkout-form";
import { getAuthUser } from "~/lib/server-api";
import { ConfirmationClient } from "./confirmation-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Checkout");
	return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * `?c=` carries the placement response's `confirmationRequired`, so the
 * right outcome renders before the order loads; the order's own
 * `confirmation.required` takes over once it has.
 */
export default async function CheckoutConfirmationPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ c?: string | string[] }>;
}) {
	const [{ id }, { c }] = await Promise.all([params, searchParams]);
	const user = await getAuthUser();
	if (!user) {
		redirect(
			`/auth/login?redirect=${encodeURIComponent(`/checkout/confirmation/${id}`)}`,
		);
	}

	return (
		<div className="container mx-auto max-w-xl px-4 py-8 sm:px-6">
			<ConfirmationClient
				orderId={id}
				placedHint={isConfirmationRequired(c) ? c : null}
			/>
		</div>
	);
}
