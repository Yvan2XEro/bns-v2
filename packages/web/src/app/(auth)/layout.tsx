import { MessageCircle, ShieldCheck, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MarketScene } from "~/components/auth/market-scene";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";

/**
 * The auth shell: no site header, footer or tab bar — only the logo back to
 * the site, the language select and, from xl, a brand panel beside the card.
 */
export default function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = useTranslations("AuthShell");
	const trust = [
		{ Icon: ShieldCheck, text: t("trustShops") },
		{ Icon: Wallet, text: t("trustPayment") },
		{ Icon: MessageCircle, text: t("trustChat") },
	];

	return (
		<div className="relative isolate min-h-screen overflow-hidden bg-[#F5F7FD]">
			<div
				aria-hidden="true"
				className="-z-10 pointer-events-none absolute inset-0"
			>
				<div className="auth-blob -top-40 -left-32 absolute h-[34rem] w-[34rem] rounded-full bg-[#DBEAFE] opacity-70 blur-3xl" />
				<div
					className="auth-blob -right-40 absolute top-1/3 h-[30rem] w-[30rem] rounded-full bg-[#FEF3C7] opacity-60 blur-3xl"
					style={{ animationDelay: "-7s" }}
				/>
				<div
					className="auth-blob -bottom-48 absolute left-1/3 h-[28rem] w-[28rem] rounded-full bg-[#E0E7FF] opacity-60 blur-3xl"
					style={{ animationDelay: "-14s" }}
				/>
			</div>

			<div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
				<div className="flex items-center justify-between py-4 sm:py-6">
					<Link
						href="/"
						aria-label={t("backToSite")}
						className="flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
					>
						<Image
							src="/logo.png"
							alt=""
							width={36}
							height={36}
							className="h-9 w-9 object-contain"
							priority
						/>
						<span className="font-bold font-heading text-[#0F172A] text-lg">
							Buy<span className="text-[#F59E0B]">&apos;N&apos;</span>Sellem
						</span>
					</Link>
					<LocaleSwitcher className="bg-white/70 ring-1 ring-[#E2E8F0] backdrop-blur" />
				</div>

				<main className="flex flex-1 items-start justify-center gap-10 py-4 sm:items-center sm:py-10 xl:gap-16">
					<aside className="hidden max-w-[26rem] flex-1 xl:block">
						<MarketScene className="w-full max-w-[24rem]" />
						<h2 className="mt-8 font-bold font-heading text-[#0F172A] text-[30px] leading-tight tracking-tight">
							{t("panelTitle")}
						</h2>
						<p className="mt-3 text-[#475569] text-base leading-relaxed">
							{t("panelBody")}
						</p>
						<ul className="mt-6 space-y-3">
							{trust.map(({ Icon, text }) => (
								<li
									key={text}
									className="flex items-center gap-3 text-[#334155] text-sm"
								>
									<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#1E40AF] shadow-sm ring-1 ring-[#E2E8F0]">
										<Icon aria-hidden="true" className="h-[18px] w-[18px]" />
									</span>
									{text}
								</li>
							))}
						</ul>
					</aside>
					{children}
				</main>

				<nav
					aria-label={t("legal")}
					className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-6 text-[#64748B] text-xs"
				>
					<Link href="/help" className="hover:text-[#0F172A]">
						{t("help")}
					</Link>
					<Link href="/terms" className="hover:text-[#0F172A]">
						{t("terms")}
					</Link>
					<Link href="/privacy" className="hover:text-[#0F172A]">
						{t("privacy")}
					</Link>
				</nav>
			</div>
		</div>
	);
}
