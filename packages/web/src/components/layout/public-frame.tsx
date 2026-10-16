import type { ComponentProps, ReactNode } from "react";
import { AppBanner } from "~/components/app-install/app-banner";
import { Footer } from "~/components/layout/footer";
import { Header } from "~/components/layout/header";
import { TabBarSpacer } from "~/components/layout/mobile-nav";
import { type NavCategory, toNavCategories } from "~/lib/nav";
import { serverFetch } from "~/lib/server-api";

async function getNavCategories(): Promise<NavCategory[] | undefined> {
	try {
		const res = await serverFetch("/api/public/categories?depth=1");
		if (!res.ok) return undefined;
		const data = await res.json();
		return toNavCategories(data.categories ?? []);
	} catch {
		return undefined;
	}
}

/** The public shell — header, page, footer — shared by `(public)` and the shop routes. */
export async function PublicFrame({
	shop,
	children,
}: {
	shop?: ComponentProps<typeof Header>["shop"];
	children: ReactNode;
}) {
	const categories = await getNavCategories();
	return (
		<div className="relative flex min-h-screen flex-col">
			<AppBanner />
			<Header
				novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER}
				categories={categories}
				shop={shop}
			/>
			<main className="flex-1">{children}</main>
			<Footer />
			<TabBarSpacer />
		</div>
	);
}
