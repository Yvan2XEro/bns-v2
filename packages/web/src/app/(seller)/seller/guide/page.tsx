import {
	ArrowRight,
	CircleHelp,
	Megaphone,
	ReceiptText,
	ShieldCheck,
	Store,
	Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GUIDE_TARGETS, whatsappShareUrl } from "~/lib/seller-home";
import { getMyShop } from "~/lib/server-shop";
import { shopUrl } from "~/lib/shop-url";
import {
	SELLER_GUIDE_SECTIONS,
	type SellerGuideSection,
} from "../../../../../../api/src/contracts/sellerOnboarding";

const ICONS: Record<SellerGuideSection, typeof Store> = {
	setup: Store,
	visibility: Megaphone,
	orders: ReceiptText,
	payments: Wallet,
	trust: ShieldCheck,
};

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SellerGuide");
	return { title: t("title") };
}

/** Pull help: read when the seller wants it, each part one click from its screen. */
export default async function SellerGuidePage() {
	const [mine, t, tHome] = await Promise.all([
		getMyShop(),
		getTranslations("SellerGuide"),
		getTranslations("SellerHome"),
	]);
	const shop = mine?.shop;
	if (!shop) redirect("/shop/new");
	const message = tHome("shareMessage", {
		shop: shop.name,
		url: shopUrl(shop.handle),
	});

	return (
		<div className="max-w-3xl space-y-5">
			<div className="space-y-1">
				<h1 className="font-extrabold text-[#0F172A] text-[28px] tracking-[-0.4px]">
					{t("title")}
				</h1>
				<p className="text-[#64748B] text-sm">{t("intro")}</p>
			</div>
			{SELLER_GUIDE_SECTIONS.map((section) => {
				const Icon = ICONS[section];
				const target = GUIDE_TARGETS[section];
				const linkClass =
					"inline-flex items-center gap-1.5 font-semibold text-[var(--shop-accent-text,#1E40AF)] text-sm hover:underline";
				const label = (
					<>
						{t(`sections.${section}.action`)}
						<ArrowRight aria-hidden="true" className="h-4 w-4" />
					</>
				);
				return (
					<section
						key={section}
						aria-labelledby={`guide-${section}`}
						className="space-y-2 rounded-xl border border-[#E2E8F0] bg-white p-5"
					>
						<div className="flex items-center gap-3">
							<span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--shop-accent-soft,#DBEAFE)] text-[var(--shop-accent-text,#1E40AF)]">
								<Icon aria-hidden="true" className="h-[18px] w-[18px]" />
							</span>
							<h2
								id={`guide-${section}`}
								className="font-bold text-[#0F172A] text-[17px]"
							>
								{t(`sections.${section}.title`)}
							</h2>
						</div>
						<p className="text-[#334155] text-sm leading-6">
							{t(`sections.${section}.body`)}
						</p>
						{target.kind === "route" ? (
							<Link href={target.href} className={linkClass}>
								{label}
							</Link>
						) : target.kind === "whatsapp" ? (
							<a
								href={whatsappShareUrl(message)}
								target="_blank"
								rel="noopener noreferrer"
								className={linkClass}
							>
								{label}
							</a>
						) : null}
					</section>
				);
			})}
			<Link
				href="/help"
				className="inline-flex items-center gap-2 font-semibold text-[var(--shop-accent-text,#1E40AF)] text-sm hover:underline"
			>
				<CircleHelp aria-hidden="true" className="h-4 w-4" />
				{t("helpCenter")}
			</Link>
		</div>
	);
}
