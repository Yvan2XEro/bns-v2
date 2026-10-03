import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { PendingClient } from "./pending-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Payments");
	return { title: t("pending_title"), robots: { index: false, follow: false } };
}

/**
 * Pending, failed and expired all render here, off the order's latest
 * intent status — this is also where NotchPay's hosted-checkout callback
 * redirects, so the screen must stand on `orderId` alone: `instructions` is
 * the only thing carried over from `/pay`, and only when the navigation came
 * from there.
 */
export default async function PendingPage({
	params,
	searchParams,
}: {
	params: Promise<{ orderId: string }>;
	searchParams: Promise<{ instructions?: string | string[] }>;
}) {
	const [{ orderId }, { instructions }] = await Promise.all([
		params,
		searchParams,
	]);
	const user = await getAuthUser();
	if (!user) {
		redirect(
			`/auth/login?redirect=${encodeURIComponent(`/checkout/${orderId}/pending`)}`,
		);
	}

	return (
		<div className="container mx-auto max-w-xl px-4 py-8 sm:px-6">
			<PendingClient
				orderId={orderId}
				providerInstructions={
					typeof instructions === "string" && instructions ? instructions : null
				}
			/>
		</div>
	);
}
