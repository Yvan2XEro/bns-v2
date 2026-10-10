import { getTranslations } from "next-intl/server";

export async function PaymentsLocked() {
	const t = await getTranslations("Payments");
	return (
		<div
			role="alert"
			className="rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center text-[#64748B] text-sm"
		>
			{t("seller_noAccess")}
		</div>
	);
}
