import { FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function TermsPage() {
	const t = await getTranslations("Terms");

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<FileText className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">{t("title")}</h1>
					<p className="mt-2 text-blue-100">{t("lastUpdated")}</p>
				</div>
			</section>

			<div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8">
					<div className="prose prose-sm max-w-none text-[#475569] [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-bold [&_h2]:text-[#0F172A] [&_h2]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-[#0F172A] [&_li]:mb-1 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
						<h2>{t("acceptance")}</h2>
						<p>{t("acceptanceDesc")}</p>

						<h2>{t("eligibility")}</h2>
						<p>{t("eligibilityDesc")}</p>

						<h2>{t("accounts")}</h2>
						<ul>
							<li>{t("account1")}</li>
							<li>{t("account2")}</li>
							<li>{t("account3")}</li>
							<li>{t("account4")}</li>
						</ul>

						<h2>{t("listings")}</h2>
						<h3>{t("sellers")}</h3>
						<ul>
							<li>{t("seller1")}</li>
							<li>{t("seller2")}</li>
							<li>{t("seller3")}</li>
							<li>{t("seller4")}</li>
						</ul>

						<h3>{t("buyers")}</h3>
						<ul>
							<li>{t("buyer1")}</li>
							<li>{t("buyer2")}</li>
						</ul>

						<h2>{t("prohibited")}</h2>
						<p>{t("prohibitedIntro")}</p>
						<ul>
							<li>{t("prohibited1")}</li>
							<li>{t("prohibited2")}</li>
							<li>{t("prohibited3")}</li>
							<li>{t("prohibited4")}</li>
							<li>{t("prohibited5")}</li>
							<li>{t("prohibited6")}</li>
						</ul>

						<h2>{t("boost")}</h2>
						<p>{t("boostDesc")}</p>

						<h2>{t("content")}</h2>
						<p>{t("contentDesc")}</p>

						<h2>{t("liability")}</h2>
						<p>{t("liabilityDesc")}</p>

						<h2>{t("termination")}</h2>
						<p>{t("terminationDesc")}</p>

						<h2>{t("changes")}</h2>
						<p>{t("changesDesc")}</p>

						<h2>{t("law")}</h2>
						<p>{t("lawDesc")}</p>

						<h2>{t("contactTitle")}</h2>
						<p>{t("contactDesc", { email: "legal@buynsellem.com" })}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
