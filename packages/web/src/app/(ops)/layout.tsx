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

	const tShell = await getTranslations("Moderation");
	const name = body.user?.name ?? body.user?.email ?? "";
	return (
		<div className="min-h-screen bg-canvas lg:flex">
			<aside className="border-[#1E293B] border-b bg-[#0F172A] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
				<div className="p-4">
					<p className="font-bold font-heading text-sm text-white">
						{tShell("shell.title")}
					</p>
					<p className="text-[#94A3B8] text-xs">{tShell("shell.subtitle")}</p>
				</div>
				<OpsNav />
				<div className="hidden lg:mt-auto lg:block">
					<p className="m-3 rounded-lg bg-white/5 p-3 text-[#CBD5E1] text-xs">
						{tShell("shell.auditNotice")}
					</p>
					<div className="flex items-center gap-3 border-[#1E293B] border-t px-4 py-3">
						<span
							aria-hidden="true"
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1E40AF] font-bold text-white text-xs"
						>
							{name.slice(0, 1).toUpperCase()}
						</span>
						<p className="min-w-0 truncate text-[#CBD5E1] text-xs">
							{tShell("shell.signedInAs", { name })}
						</p>
					</div>
				</div>
				<div className="px-2 pb-2">
					<LocaleSwitcher />
				</div>
			</aside>
			<div className="min-w-0 flex-1">
				<div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">{children}</div>
				<p className="px-4 pb-4 text-ink-muted text-xs lg:hidden">
					{tShell("shell.signedInAs", { name })}
				</p>
			</div>
		</div>
	);
}
