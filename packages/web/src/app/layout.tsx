import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "./globals.css";
import { Header } from "~/components/layout/header";
import { Footer } from "~/components/layout/footer";
import { AuthProvider } from "~/hooks/use-auth";

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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${dmSans.variable} ${outfit.variable} ${dmSans.className}`}>
				<AuthProvider>
					<div className="relative flex min-h-screen flex-col">
						<Header />
						<main className="flex-1">{children}</main>
						<Footer />
					</div>
				</AuthProvider>
			</body>
		</html>
	);
}
