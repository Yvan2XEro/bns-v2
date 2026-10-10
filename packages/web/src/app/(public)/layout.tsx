import { CategoryBar } from "~/components/layout/category-bar";
import { Footer } from "~/components/layout/footer";
import { Header } from "~/components/layout/header";
import { serverFetch } from "~/lib/server-api";
import type { Category } from "~/types";

async function getCategories(): Promise<Category[]> {
	try {
		const res = await serverFetch("/api/public/categories?depth=1");
		if (!res.ok) return [];
		const data = await res.json();
		return data.categories || [];
	} catch {
		return [];
	}
}

export default async function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const categories = await getCategories();
	return (
		<div className="relative flex min-h-screen flex-col">
			<Header novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER} />
			<CategoryBar categories={categories} />
			<main className="flex-1">{children}</main>
			<Footer />
		</div>
	);
}
