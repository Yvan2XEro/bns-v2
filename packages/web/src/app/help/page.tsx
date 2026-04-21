import {
	CreditCard,
	HelpCircle,
	MessageCircle,
	Package,
	Search,
	Shield,
	ShoppingBag,
	UserPlus,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function HelpPage() {
	const t = await getTranslations("Help");

	const faqs = [
		{
			question: t("faq1q"),
			answer: t("faq1a"),
		},
		{
			question: t("faq2q"),
			answer: t("faq2a"),
		},
		{
			question: t("faq3q"),
			answer: t("faq3a"),
		},
		{
			question: t("faq4q"),
			answer: t("faq4a"),
		},
		{
			question: t("faq5q"),
			answer: t("faq5a"),
		},
		{
			question: t("faq6q"),
			answer: t("faq6a"),
		},
		{
			question: t("faq7q"),
			answer: t("faq7a"),
		},
		{
			question: t("faq8q"),
			answer: t("faq8a"),
		},
	];

	const categories = [
		{
			icon: UserPlus,
			title: t("gettingStarted"),
			desc: t("gettingStartedDesc"),
			href: "/auth/register",
		},
		{
			icon: ShoppingBag,
			title: t("buying"),
			desc: t("buyingDesc"),
			href: "/search",
		},
		{
			icon: Package,
			title: t("selling"),
			desc: t("sellingDesc"),
			href: "/create",
		},
		{
			icon: CreditCard,
			title: t("boostPayments"),
			desc: t("boostPaymentsDesc"),
			href: "/profile/me/listings",
		},
		{
			icon: Shield,
			title: t("safety"),
			desc: t("safetyDesc"),
			href: "/safety",
		},
		{
			icon: MessageCircle,
			title: t("messaging"),
			desc: t("messagingDesc"),
			href: "/messages",
		},
	];

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<HelpCircle className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">{t("title")}</h1>
					<p className="mt-2 text-blue-100">{t("subtitle")}</p>
				</div>
			</section>

			<div className="container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{categories.map((cat) => (
						<Link
							key={cat.title}
							href={cat.href}
							className="group flex items-start gap-4 rounded-xl border border-[#E2E8F0] bg-white p-5 transition-all hover:border-[#93C5FD] hover:shadow-md"
						>
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#1E40AF] transition-colors group-hover:bg-[#1E40AF] group-hover:text-white">
								<cat.icon className="h-5 w-5" />
							</div>
							<div>
								<h3 className="font-semibold text-[#0F172A]">{cat.title}</h3>
								<p className="mt-0.5 text-[#64748B] text-sm">{cat.desc}</p>
							</div>
						</Link>
					))}
				</div>

				<h2 className="mb-6 font-bold text-[#0F172A] text-xl">{t("faq")}</h2>
				<div className="space-y-4">
					{faqs.map((faq) => (
						<details
							key={faq.question}
							className="group rounded-xl border border-[#E2E8F0] bg-white"
						>
							<summary className="flex cursor-pointer items-center justify-between px-5 py-4 font-semibold text-[#0F172A] text-sm [&::-webkit-details-marker]:hidden">
								{faq.question}
								<Search className="h-4 w-4 shrink-0 text-[#94A3B8] transition-transform group-open:rotate-45" />
							</summary>
							<div className="border-[#E2E8F0] border-t px-5 py-4 text-[#475569] text-sm leading-relaxed">
								{faq.answer}
							</div>
						</details>
					))}
				</div>

				<div className="mt-12 rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] p-6 text-center">
					<p className="font-semibold text-[#0F172A]">{t("stillNeedHelp")}</p>
					<p className="mt-1 text-[#64748B] text-sm">{t("supportTeam")}</p>
					<Link
						href="/contact"
						className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1E40AF] px-6 py-2.5 font-semibold text-sm text-white transition-colors hover:bg-[#1E3A8A]"
					>
						<MessageCircle className="h-4 w-4" />
						{t("contactUs")}
					</Link>
				</div>
			</div>
		</div>
	);
}
