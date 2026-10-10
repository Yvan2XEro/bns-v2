import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
			<aside className="border-[#E2E8F0] border-b bg-white lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
				<div className="p-4">
					<p className="font-bold text-[#0F172A] text-sm">
						{tShell("shell.title")}
					</p>
					<p className="text-[#64748B] text-xs">{tShell("shell.subtitle")}</p>
				</div>
				<nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col">
					{entries.map((entry) => (
						<Link
							key={entry.href}
							href={entry.href}
							className="shrink-0 rounded-lg px-3 py-2 font-medium text-[#334155] text-sm hover:bg-[#F8FAFC]"
						>
							{entry.label}
						</Link>
					))}
				</nav>
				<p className="hidden p-4 text-[#94A3B8] text-xs lg:block">
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
