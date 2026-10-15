import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";
import { OpsNav } from "~/components/ops/ops-nav";
import { isModerator } from "~/lib/moderation-verification";
import { serverFetch } from "~/lib/server-api";
import type { User } from "~/types";

/**
 * Gates every `/moderation/*` screen. `notFound()`, not a redirect or a 403:
 * the moderation surface's existence is not advertised to anyone below
 * moderator rank. Never checks the verification feature flag — the reviewer
 * routes ignore it entirely, so this gate must not either.
 */
export default async function OpsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const res = await serverFetch("/api/users/me");
	const body: { user?: Pick<User, "role" | "name" | "email"> | null } = res.ok
		? await res.json()
		: {};
	if (!isModerator(body.user)) notFound();

	const [tShell, tNav] = await Promise.all([
		getTranslations("Moderation"),
		getTranslations("ModerationDisputes"),
	]);
	const entries = [
		{ href: "/moderation/verification", label: tNav("navVerification") },
		{ href: "/moderation/disputes", label: tNav("navDisputes") },
	];
	return (
		<div className="min-h-screen bg-[#F8FAFC] lg:flex">
			<aside className="border-[#1E293B] border-b bg-[#0F172A] lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
				<div className="p-4">
					<p className="font-bold text-sm text-white">
						{tShell("shell.title")}
					</p>
					<p className="text-[#94A3B8] text-xs">{tShell("shell.subtitle")}</p>
				</div>
				<OpsNav entries={entries} />
				<div className="px-2 pb-2">
					<LocaleSwitcher />
				</div>
				<p className="m-3 hidden rounded-lg bg-white/5 p-3 text-[#CBD5E1] text-xs lg:block">
					{tShell("shell.auditNotice")}
				</p>
			</aside>
			<div className="min-w-0 flex-1">
				<div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
				<p className="px-4 pb-4 text-[#94A3B8] text-xs">
					{tShell("shell.signedInAs", {
						name: body.user?.name ?? body.user?.email ?? "",
					})}
				</p>
			</div>
		</div>
	);
}
