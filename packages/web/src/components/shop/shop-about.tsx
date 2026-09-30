import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import type { PublicShop } from "~/types";
import { LegalBlock } from "./legal-block";

export function ShopAbout({
	shop,
	locale,
}: {
	shop: PublicShop;
	locale: string;
}) {
	const t = useTranslations("Shop");
	const memberSince = new Date(shop.owner.memberSince).toLocaleDateString(
		locale,
		{ month: "long", year: "numeric" },
	);

	return (
		<aside className="space-y-4">
			{shop.description && (
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
					<h2 className="font-bold text-[#0F172A]">{t("about")}</h2>
					<p className="mt-2 whitespace-pre-wrap text-[#334155] text-sm leading-relaxed">
						{shop.description}
					</p>
				</div>
			)}
			{shop.categories.length > 0 && (
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
					<h2 className="font-bold text-[#0F172A]">{t("categories")}</h2>
					<div className="mt-3 flex flex-wrap gap-2">
						{shop.categories.map((category) => (
							<span
								key={category.id}
								className="rounded-full bg-[#EFF6FF] px-3 py-1 font-medium text-[#1E40AF] text-xs"
							>
								{category.name}
							</span>
						))}
					</div>
				</div>
			)}
			<LegalBlock legal={shop.legal} />
			<Link
				href={`/profile/${shop.owner.id}`}
				className="flex items-center gap-3 rounded-xl border border-[#E2E8F0] bg-white p-5 hover:border-[#93C5FD]"
			>
				<Avatar className="h-11 w-11">
					<AvatarImage src={shop.owner.avatar?.url ?? undefined} />
					<AvatarFallback className="bg-[#1E40AF] text-white">
						{shop.owner.name.charAt(0)}
					</AvatarFallback>
				</Avatar>
				<div>
					<p className="text-[#94A3B8] text-xs">{t("ownedBy")}</p>
					<p className="font-semibold text-[#0F172A] text-sm">
						{shop.owner.name}
					</p>
					<p className="text-[#64748B] text-xs">
						{t("memberSince", { date: memberSince })}
					</p>
				</div>
			</Link>
		</aside>
	);
}
