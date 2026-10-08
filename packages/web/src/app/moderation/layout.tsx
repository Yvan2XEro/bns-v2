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
export default async function ModerationLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const res = await serverFetch("/api/users/me");
	const body: { user?: Pick<User, "role"> | null } = res.ok
		? await res.json()
		: {};
	if (!isModerator(body.user)) notFound();

	const t = await getTranslations("ModerationDisputes");
	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<nav className="mb-6 flex gap-4 text-sm">
				<Link
					href="/moderation/verification"
					className="text-[#1E40AF] hover:underline"
				>
					{t("navVerification")}
				</Link>
				<Link
					href="/moderation/disputes"
					className="text-[#1E40AF] hover:underline"
				>
					{t("navDisputes")}
				</Link>
			</nav>
			{children}
		</div>
	);
}
