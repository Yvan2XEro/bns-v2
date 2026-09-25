import { MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicShop } from "~/types";

function digits(phone: string): string {
	return phone.replace(/[^\d]/g, "");
}

/** Each button exists only when the shop filled the matching business contact. */
export function ShopContactButtons({
	contact,
}: {
	contact: PublicShop["contact"];
}) {
	const t = useTranslations("Shop");
	if (!contact.whatsapp && !contact.phone) return null;

	return (
		<div className="flex flex-wrap gap-2">
			{contact.whatsapp && (
				<a
					href={`https://wa.me/${digits(contact.whatsapp)}`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
				>
					<MessageCircle className="h-4 w-4" />
					{t("whatsapp")}
				</a>
			)}
			{contact.phone && (
				<a
					href={`tel:${contact.phone.replace(/\s/g, "")}`}
					className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 font-semibold text-[#0F172A] text-sm hover:border-[#1E40AF]"
				>
					<Phone className="h-4 w-4" />
					{t("call")}
				</a>
			)}
		</div>
	);
}
