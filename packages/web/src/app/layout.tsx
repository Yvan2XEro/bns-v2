import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "~/components/layout/header";
import { AuthProvider } from "~/hooks/use-auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Marketplace - Buy & Sell Near You",
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
			<body className={inter.className}>
				<AuthProvider>
					<div className="relative flex min-h-screen flex-col">
						<Header />
						<main className="flex-1">{children}</main>
						<footer className="border-t py-6 md:py-0">
							<div className="container mx-auto flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
								<p className="text-center text-muted-foreground text-sm leading-loose md:text-left">
									Built with Next.js. The marketplace platform.
								</p>
							</div>
						</footer>
					</div>
				</AuthProvider>
			</body>
		</html>
	);
}
