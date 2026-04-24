import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { CategoryBar } from "~/components/layout/category-bar";
import { Footer } from "~/components/layout/footer";
import { Header } from "~/components/layout/header";
import { type AppConfig, AppConfigProvider } from "~/hooks/use-app-config";
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

async function getPublicConfig(): Promise<AppConfig> {
	try {
		const res = await serverFetch("/api/public/config");
		if (!res.ok)
			return { stripePublishableKey: null, chatUrl: null, novuAppId: null };
		return res.json();
	} catch {
		return { stripePublishableKey: null, chatUrl: null, novuAppId: null };
	}
}

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
	const [categories, locale, messages, config] = await Promise.all([
		getCategories(),
		getLocale(),
		getMessages(),
		getPublicConfig(),
	]);

	return (
		<html lang={locale}>
			<body
				className={`${dmSans.variable} ${outfit.variable} ${dmSans.className}`}
			>
				<NextIntlClientProvider locale={locale} messages={messages}>
					<AppConfigProvider initialConfig={config}>
						<AuthProvider>
							<div className="relative flex min-h-screen flex-col">
								<Header novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER} />
								<CategoryBar categories={categories} />
								<main className="flex-1">{children}</main>
								<Footer />
							</div>
						</AuthProvider>
					</AppConfigProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
