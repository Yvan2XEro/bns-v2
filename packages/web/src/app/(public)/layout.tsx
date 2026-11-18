import { PublicFrame } from "~/components/layout/public-frame";

export default function PublicLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <PublicFrame>{children}</PublicFrame>;
}
