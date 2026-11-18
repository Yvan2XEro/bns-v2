import { getTranslations } from "next-intl/server";

export async function PaymentsLocked() {
	const t = await getTranslations("Payments");
	return (
		<div
			role="alert"
			className="rounded-2xl border border-line bg-surface p-8 text-center text-ink-muted text-sm"
		>
			{t("seller_noAccess")}
		</div>
	);
}
