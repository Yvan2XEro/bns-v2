import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
	const t = await getTranslations("Privacy");

	return (
		<div className="min-h-screen bg-[#F8FAFC]">
			<section className="relative overflow-hidden bg-[#1E40AF] py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-[#3B82F6]/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<Lock className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">{t("title")}</h1>
					<p className="mt-2 text-blue-100">{t("lastUpdated")}</p>
				</div>
			</section>

			<div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="rounded-xl border border-[#E2E8F0] bg-white p-6 sm:p-8">
					<div className="prose prose-sm max-w-none text-[#475569] [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-bold [&_h2]:text-[#0F172A] [&_h2]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-[#0F172A] [&_li]:mb-1 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
						<h2>{t("infoCollect")}</h2>

						<h3>{t("infoProvide")}</h3>
						<ul>
							<li>{t("accountInfo")}</li>
							<li>{t("listingData")}</li>
							<li>{t("messages")}</li>
							<li>{t("reviews")}</li>
						</ul>

						<h3>{t("infoAuto")}</h3>
						<ul>
							<li>{t("usageData")}</li>
							<li>{t("deviceInfo")}</li>
							<li>{t("locationData")}</li>
						</ul>

						<h2>{t("howUse")}</h2>
						<p>{t("howUseIntro")}</p>
						<ul>
							<li>{t("use1")}</li>
							<li>{t("use2")}</li>
							<li>{t("use3")}</li>
							<li>{t("use4")}</li>
							<li>{t("use5")}</li>
							<li>{t("use6")}</li>
							<li>{t("use7")}</li>
						</ul>

						<h2>{t("sharing")}</h2>
						<p>{t("sharingIntro")}</p>
						<ul>
							<li>{t("share1")}</li>
							<li>{t("share2")}</li>
							<li>{t("share3")}</li>
						</ul>

						<h2>{t("security")}</h2>
						<p>{t("securityDesc")}</p>

						<h2>{t("rights")}</h2>
						<p>{t("rightsIntro")}</p>
						<ul>
							<li>{t("right1")}</li>
							<li>{t("right2")}</li>
							<li>{t("right3")}</li>
							<li>{t("right4")}</li>
						</ul>

						<h2>{t("retention")}</h2>
						<p>{t("retentionDesc")}</p>

						<h2>{t("children")}</h2>
						<p>{t("childrenDesc")}</p>

						<h2>{t("thirdParty")}</h2>
						<p>{t("thirdPartyDesc")}</p>

						<h2>{t("changesTitle")}</h2>
						<p>{t("changesDesc")}</p>

						<h2>{t("contactTitle")}</h2>
						<p>{t("contactDesc", { email: "privacy@buynsellem.com" })}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
