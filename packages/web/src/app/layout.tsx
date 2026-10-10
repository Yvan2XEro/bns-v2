import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { QueryProvider } from "~/components/query-provider";
import { AppConfigProvider } from "~/hooks/use-app-config";
import { AuthProvider } from "~/hooks/use-auth";
import { ChatProvider } from "~/hooks/use-chat-client";
import { type AppConfig, EMPTY_APP_CONFIG } from "~/lib/app-config";
import { serverFetch } from "~/lib/server-api";

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
		if (!res.ok) return EMPTY_APP_CONFIG;
		return { ...EMPTY_APP_CONFIG, ...(await res.json()) };
	} catch {
		return EMPTY_APP_CONFIG;
	}
}

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const [locale, messages, config] = await Promise.all([
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
					<QueryProvider>
						<AppConfigProvider initialConfig={config}>
							<AuthProvider>
								<ChatProvider>{children}</ChatProvider>
							</AuthProvider>
						</AppConfigProvider>
					</QueryProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
