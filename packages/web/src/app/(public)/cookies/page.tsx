import { Cookie } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Cookies");
	return {
		title: t("title"),
		description:
			"En savoir plus sur l'utilisation des cookies sur Buy'N'Sellem.",
		robots: { index: true, follow: false },
	};
}

export default async function CookiePolicyPage() {
	const t = await getTranslations("Cookies");

	return (
		<div className="min-h-screen bg-canvas">
			<section className="relative overflow-hidden bg-brand-fill py-12">
				<div className="pattern-dots-light absolute inset-0" />
				<div className="pattern-diagonal absolute inset-0" />
				<div className="-left-20 absolute top-10 h-60 w-60 rounded-full bg-brand-bright/20 blur-3xl" />
				<div className="-right-20 absolute bottom-10 h-48 w-48 rounded-full bg-[#F59E0B]/15 blur-3xl" />
				<div className="container relative mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
					<Cookie className="mx-auto mb-4 h-10 w-10 text-white/80" />
					<h1 className="font-extrabold text-3xl text-white">{t("title")}</h1>
					<p className="mt-2 text-blue-100">{t("lastUpdated")}</p>
				</div>
			</section>

			<div className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
				<div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
					<div className="prose prose-sm max-w-none text-ink-mid [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:font-bold [&_h2]:text-ink [&_h2]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-ink [&_li]:mb-1 [&_p]:mb-3 [&_p]:leading-relaxed [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-line [&_td]:px-4 [&_td]:py-2 [&_th]:border [&_th]:border-line [&_th]:bg-canvas [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
						<h2>{t("whatAre")}</h2>
						<p>{t("whatAreDesc")}</p>

						<h2>{t("weUse")}</h2>

						<table>
							<thead>
								<tr>
									<th>{t("cookie")}</th>
									<th>{t("purpose")}</th>
									<th>{t("duration")}</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>
										<code className="rounded bg-subtle px-1 text-xs">
											payload-token
										</code>
									</td>
									<td>{t("authPurpose")}</td>
									<td>{t("sessionDuration")}</td>
								</tr>
							</tbody>
						</table>

						<h3>{t("essential")}</h3>
						<p>{t("essentialDesc")}</p>
						<ul>
							<li>{t("authCookie")}</li>
						</ul>

						<h3>{t("notUse")}</h3>
						<p>{t("notUseIntro")}</p>
						<ul>
							<li>{t("notUse1")}</li>
							<li>{t("notUse2")}</li>
							<li>{t("notUse3")}</li>
							<li>{t("notUse4")}</li>
						</ul>

						<h2>{t("localStorage")}</h2>
						<p>{t("localStorageDesc")}</p>

						<h2>{t("managing")}</h2>
						<p>{t("managingDesc")}</p>
						<ul>
							<li>{t("chrome")}</li>
							<li>{t("firefox")}</li>
							<li>{t("safari")}</li>
							<li>{t("edge")}</li>
						</ul>

						<h2>{t("updates")}</h2>
						<p>{t("updatesDesc")}</p>

						<h2>{t("contactTitle")}</h2>
						<p>{t("contactDesc", { email: "privacy@buynsellem.com" })}</p>
					</div>
				</div>
			</div>
		</div>
	);
}
