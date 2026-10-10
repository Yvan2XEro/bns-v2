import { getTranslations } from "next-intl/server";

export async function BillingLocked() {
	const t = await getTranslations("Billing");
	return (
		<div
			role="alert"
			className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm"
		>
			{t("noAccess")}
		</div>
	);
}
