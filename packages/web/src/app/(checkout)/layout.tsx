import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Header } from "~/components/layout/header";

export default async function CheckoutLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const t = await getTranslations("Checkout");
	return (
		<div className="flex min-h-screen flex-col">
			<Header novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER} />
			<div className="border-[#E2E8F0] border-b bg-white">
				<div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
					<Link
						href="/cart"
						className="inline-flex items-center gap-2 text-[#1E40AF] text-sm hover:underline"
					>
						<ArrowLeft aria-hidden="true" className="h-4 w-4" />
						{t("shell.backToCart")}
					</Link>
					<span className="inline-flex items-center gap-1.5 text-[#64748B] text-sm">
						<Lock aria-hidden="true" className="h-3.5 w-3.5" />
						{t("shell.secure")}
					</span>
				</div>
			</div>
			<main className="flex-1 bg-[#F8FAFC]">{children}</main>
			<footer className="border-[#E2E8F0] border-t bg-white py-4 text-center text-[#94A3B8] text-xs">
				{t("shell.trust")}
			</footer>
		</div>
	);
}
