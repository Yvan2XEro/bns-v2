import { Footer } from "~/components/layout/footer";
import { Header } from "~/components/layout/header";

export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="relative flex min-h-screen flex-col">
			<Header novuAppId={process.env.NOVU_APPLICATION_IDENTIFIER} />
			<main className="flex-1">{children}</main>
			<Footer />
		</div>
	);
}
