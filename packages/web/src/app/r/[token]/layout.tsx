import type { Metadata } from "next";
import { LocaleSwitcher } from "~/components/layout/locale-switcher";

/** The token is a credential: the page is never indexed and sends no referrer. */
export const metadata: Metadata = {
	robots: { index: false, follow: false },
	referrer: "no-referrer",
};

export default function RiderLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-8">
			<div className="flex items-center justify-between py-3">
				<span className="font-bold text-[#0F172A]">
					Buy<span className="text-[#F59E0B]">&apos;N&apos;</span>Sellem
				</span>
				<LocaleSwitcher />
			</div>
			{children}
		</div>
	);
}
