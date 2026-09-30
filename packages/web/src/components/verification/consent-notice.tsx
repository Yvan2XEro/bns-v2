"use client";

import { useTranslations } from "next-intl";
import { Label } from "~/components/ui/label";

const NOTICE_KEYS = [
	"collects",
	"vendor",
	"retention",
	"rights",
	"contact",
] as const;

/**
 * The legal record itself: what is collected, who processes it and for how
 * long, before a single byte reaches the vendor. Mirrors mobile's
 * `ConsentNotice` component and its `verification.identity.consent.*` copy.
 * The checkbox is never pre-ticked — `checked` is owned by the caller's
 * form state, this component only renders the notice and reports a tap.
 */
export function ConsentNotice({
	checked,
	onToggle,
	error,
}: {
	checked: boolean;
	onToggle: (checked: boolean) => void;
	error?: string | null;
}) {
	const t = useTranslations("Verification.identity.consent");

	return (
		<div className="space-y-3 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-bold text-[#0F172A] text-base">{t("title")}</h2>
			<p className="text-[#334155] text-sm leading-relaxed">{t("intro")}</p>
			{NOTICE_KEYS.map((key) => (
				<p key={key} className="text-[#334155] text-sm leading-relaxed">
					{t(key)}
				</p>
			))}

			<div className="flex items-start gap-2 pt-2">
				<input
					id="consent-accepted"
					type="checkbox"
					className="mt-1 h-4 w-4"
					checked={checked}
					onChange={(event) => onToggle(event.target.checked)}
				/>
				<Label htmlFor="consent-accepted" className="font-normal text-sm">
					{t("checkboxLabel")}
				</Label>
			</div>

			{error && (
				<p role="alert" className="text-red-600 text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
