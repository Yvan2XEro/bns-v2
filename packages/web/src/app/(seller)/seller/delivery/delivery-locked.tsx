import { getTranslations } from "next-intl/server";

export async function DeliveryLocked() {
	const t = await getTranslations("SellerDelivery");
	return (
		<div
			role="alert"
			className="rounded-2xl border border-line bg-surface p-8 text-center text-ink-muted text-sm"
		>
			{t("noAccess")}
		</div>
	);
}
