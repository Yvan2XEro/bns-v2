import {
	AlertTriangle,
	Ban,
	CheckCircle,
	Eye,
	MapPin,
	MessageCircle,
	Shield,
	Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function SafetyPage() {
	const t = await getTranslations("Safety");

	const tips = [
		{
			icon: MapPin,
			title: t("meetPublic"),
			desc: t("meetPublicDesc"),
			color: "bg-blue-50 text-[#1E40AF]",
		},
		{
			icon: Eye,
			title: t("inspectBefore"),
			desc: t("inspectBeforeDesc"),
			color: "bg-emerald-50 text-emerald-700",
		},
		{
			icon: Ban,
			title: t("neverAdvance"),
			desc: t("neverAdvanceDesc"),
			color: "bg-red-50 text-red-600",
		},
		{
			icon: Users,
			title: t("bringSomeone"),
			desc: t("bringSomeoneDesc"),
			color: "bg-amber-50 text-amber-700",
		},
		{
			icon: MessageCircle,
			title: t("keepOnPlatform"),
			desc: t("keepOnPlatformDesc"),
			color: "bg-purple-50 text-purple-700",
		},
		{
			icon: AlertTriangle,
			title: t("trustInstincts"),
			desc: t("trustInstinctsDesc"),
			color: "bg-orange-50 text-orange-700",
		},
	];

	const redFlags = [
		t("redFlag1"),
		t("redFlag2"),
		t("redFlag3"),
		t("redFlag4"),
		t("redFlag5"),
		t("redFlag6"),
		t("redFlag7"),
		t("redFlag8"),
	];

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<Shield className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">{t("title")}</h1>
					<p className="mt-2 text-blue-100">{t("subtitle")}</p>
				</div>
			</section>

			<div className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="grid gap-4 sm:grid-cols-2">
					{tips.map((tip) => (
						<div
							key={tip.title}
							className="rounded-xl border border-[#E2E8F0] bg-white p-5"
						>
							<div
								className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${tip.color}`}
							>
								<tip.icon className="h-5 w-5" />
							</div>
							<h3 className="font-semibold text-[#0F172A]">{tip.title}</h3>
							<p className="mt-1 text-[#64748B] text-sm leading-relaxed">
								{tip.desc}
							</p>
						</div>
					))}
				</div>

				<div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6">
					<h2 className="flex items-center gap-2 font-bold text-lg text-red-700">
						<AlertTriangle className="h-5 w-5" />
						{t("redFlags")}
					</h2>
					<ul className="mt-4 space-y-2">
						{redFlags.map((flag) => (
							<li
								key={flag}
								className="flex items-start gap-2 text-red-700 text-sm"
							>
								<Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								{flag}
							</li>
						))}
					</ul>
				</div>

				<div className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
					<h2 className="flex items-center gap-2 font-bold text-emerald-700 text-lg">
						<CheckCircle className="h-5 w-5" />
						{t("ifWrong")}
					</h2>
					<ul className="mt-4 space-y-2 text-emerald-700 text-sm">
						<li>1. {t("wrong1")}</li>
						<li>2. {t("wrong2")}</li>
						<li>3. {t("wrong3")}</li>
						<li>4. {t("wrong4")}</li>
						<li>5. {t("wrong5")}</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
