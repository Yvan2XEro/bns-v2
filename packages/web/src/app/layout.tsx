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

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://buynsellem.com";

export const metadata: Metadata = {
	metadataBase: new URL(WEB_URL),
	title: {
		default: "Buy'N'Sellem — Achetez et vendez près de chez vous",
		template: "%s | Buy'N'Sellem",
	},
	description:
		"La marketplace locale pour acheter et vendre facilement. Trouvez de bonnes affaires près de chez vous.",
	openGraph: {
		siteName: "Buy'N'Sellem",
		locale: "fr_FR",
		type: "website",
		url: WEB_URL,
		images: [
			{
				url: "/og-default.png",
				width: 1200,
				height: 630,
				alt: "Buy'N'Sellem — Marketplace local",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		site: "@buynsellem",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: { index: true, follow: true, "max-image-preview": "large" },
	},
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

	const organizationJsonLd = {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "Buy'N'Sellem",
		url: WEB_URL,
		logo: `${WEB_URL}/logo.png`,
		description:
			"La marketplace locale pour acheter et vendre facilement près de chez vous.",
	};

	return (
		<html lang={locale}>
			<head>
				<script
					type="application/ld+json"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: structured data
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(organizationJsonLd),
					}}
				/>
			</head>
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
