import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { CategoryBar } from "~/components/layout/category-bar";
import { Footer } from "~/components/layout/footer";
import { Header } from "~/components/layout/header";
import { AuthProvider } from "~/hooks/use-auth";
import { serverFetch } from "~/lib/server-api";
import type { Category } from "~/types";

const dmSans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-body",
});

const outfit = Outfit({
	subsets: ["latin"],
	variable: "--font-display",
	weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
	title: "Buy'N'Sellem - Buy & Sell Near You",
	description:
		"Discover great deals on items near you. Buy and sell locally with ease.",
};

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

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const categories = await getCategories();

	return (
		<html lang="en">
			<body
				className={`${dmSans.variable} ${outfit.variable} ${dmSans.className}`}
			>
				<AuthProvider>
					<div className="relative flex min-h-screen flex-col">
						<Header novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER} />
						<CategoryBar categories={categories} />
						<main className="flex-1">{children}</main>
						<Footer />
					</div>
				</AuthProvider>
			</body>
		</html>
	);
}
