import { Smartphone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** Shop creation needs a verified phone; the server refuses without one. */
export function PhoneGate({ returnTo }: { returnTo: string }) {
	const t = useTranslations("ShopCreate");
	const href = `/settings?returnTo=${encodeURIComponent(returnTo)}#phone`;

	return (
		<div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-5">
			<div className="flex items-start gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white">
					<Smartphone className="h-5 w-5 text-[#1E40AF]" />
				</div>
				<div className="space-y-2">
					<p className="font-semibold text-[#0F172A]">{t("gateTitle")}</p>
					<p className="text-[#334155] text-sm">{t("gateBody")}</p>
					<Link
						href={href}
						className="inline-flex h-10 items-center rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
					>
						{t("gateCta")}
					</Link>
					<p className="text-[#64748B] text-xs">{t("gatePrivacy")}</p>
				</div>
			</div>
		</div>
	);
}
