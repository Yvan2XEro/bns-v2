import { getLocale, getTranslations } from "next-intl/server";
import { I18nClientDemo } from "~/components/demo/i18n-client-demo";
import { switchLocale } from "./actions";

export default async function I18nDemoPage() {
	const [t, locale] = await Promise.all([getTranslations("Demo"), getLocale()]);

	const next = locale === "fr" ? "en" : "fr";
	const nextLabel = locale === "fr" ? "English" : "Français";

	return (
		<div className="mx-auto max-w-2xl px-4 py-16">
			<h1 className="mb-2 font-bold text-3xl text-[#0F172A]">i18n Demo</h1>
			<p className="mb-10 text-[#64748B] text-sm">
				{t("currentLocale", { locale })}
			</p>

			{/* Server Component — traduction sans JS client */}
			<div className="mb-6 rounded-xl border border-[#10B981]/40 bg-[#ECFDF5] p-6">
				<span className="mb-3 inline-block rounded-full bg-[#10B981] px-3 py-1 font-medium text-white text-xs">
					Server Component
				</span>
				<h2 className="mb-2 font-semibold text-[#065F46] text-xl">
					{t("serverTitle")}
				</h2>
				<p className="text-[#374151]">{t("serverDescription")}</p>
			</div>

			{/* Client Component */}
			<I18nClientDemo />

			{/* Language switcher */}
			<form action={switchLocale} className="mt-10">
				<input type="hidden" name="locale" value={next} />
				<button
					type="submit"
					className="rounded-lg bg-[#1E40AF] px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-[#1E3A8A]"
				>
					{t("switchTo", { lang: nextLabel })}
				</button>
			</form>
		</div>
	);
}
