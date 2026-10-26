import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Header } from "~/components/layout/header";
import { novuInbox } from "~/lib/novu";

export default async function CheckoutLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = await getTranslations("Checkout");
	return (
		<div className="flex min-h-screen flex-col">
			<Header novu={novuInbox()} />
			<div className="border-line border-b bg-surface">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
					<Link
						href="/cart"
						className="inline-flex items-center gap-2 text-brand text-sm hover:underline"
					>
						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						{t("shell.backToCart")}
					</Link>
					<span className="inline-flex items-center gap-1.5 text-ink-muted text-sm">
						<Lock aria-hidden="true" className="h-3.5 w-3.5" />
						{t("shell.secure")}
					</span>
				</div>
			</div>
			<main className="flex-1 bg-canvas">{children}</main>
			<footer className="border-line border-t bg-surface py-4 text-center text-ink-faint text-xs">
				{t("shell.trust")}
			</footer>
		</div>
	);
}
