import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Toaster } from "sonner";
import { NotificationInbox } from "~/components/layout/notification-inbox";
import { OpsSidebar } from "~/components/ops/ops-nav";
import { OpsTopBar } from "~/components/ops/ops-top-bar";
import { WorkspacePageMetaProvider } from "~/components/workspace/page-meta";
import { isModerator } from "~/lib/moderation-verification";
import { novuInbox } from "~/lib/novu";
import { serverFetch } from "~/lib/server-api";
import type { User } from "~/types";

/**
 * Gates every `/moderation/*` screen. `notFound()`, not a redirect or a 403:
 * the moderation surface's existence is not advertised to anyone below
 * moderator rank. Never checks the verification feature flag — the reviewer
 * routes ignore it entirely, so this gate must not either.
 *
 * The frame is the workspace shell the seller space also uses (sidebar, top
 * bar with trail, alerts and account menu), so both get every improvement.
 */
export default async function OpsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const res = await serverFetch("/api/users/me");
	const body: { user?: Pick<User, "role"> | null } = res.ok
		? await res.json()
		: {};
	if (!isModerator(body.user)) notFound();

	const t = await getTranslations("Nav");
	const novu = novuInbox();
	return (
		<div className="min-h-screen bg-canvas lg:flex">
			<Toaster richColors position="top-center" />
			<OpsSidebar />
			<div className="min-w-0 flex-1">
				<WorkspacePageMetaProvider>
					<OpsTopBar
						bell={
							novu ? (
								<NotificationInbox
									novu={novu}
									label={t("alerts")}
									tone="text-ink-muted hover:bg-subtle hover:text-ink"
								/>
							) : null
						}
					/>
					<div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
						{children}
					</div>
				</WorkspacePageMetaProvider>
			</div>
		</div>
	);
}
