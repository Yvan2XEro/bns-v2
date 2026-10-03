import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { PayClient } from "./pay-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Payments");
	return { title: t("pay_title"), robots: { index: false, follow: false } };
}

/**
 * The operator-choice screen: reached from the checkout confirmation page and
 * from the order detail page, never as an order action — payment keys off
 * `paymentStatus`, not `availableActions` (see `~/lib/order-actions.ts`).
 */
export default async function PayPage({
	params,
}: {
	params: Promise<{ orderId: string }>;
}) {
	const { orderId } = await params;
	const user = await getAuthUser();
	if (!user) {
		redirect(
			`/auth/login?redirect=${encodeURIComponent(`/checkout/${orderId}/pay`)}`,
		);
	}

	return (
		<div className="container mx-auto max-w-xl px-4 py-8 sm:px-6">
			<PayClient orderId={orderId} />
		</div>
	);
}
