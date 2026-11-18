import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState } from "~/components/empty-state";

const PRIMARY =
	"inline-flex items-center rounded-xl bg-brand-fill px-5 py-2.5 font-medium text-sm text-white transition-colors hover:bg-brand-strong";
const SECONDARY =
	"inline-flex items-center rounded-xl border border-line bg-surface px-5 py-2.5 font-medium text-ink text-sm transition-colors hover:bg-canvas";

export function NotFoundLink({
	href,
	children,
	secondary = false,
}: {
	href: string;
	children: ReactNode;
	secondary?: boolean;
}) {
	return (
		<Link href={href} className={secondary ? SECONDARY : PRIMARY}>
			{children}
		</Link>
	);
}

/** The shared anatomy; each shell's not-found.tsx supplies its own words and exit. */
export function NotFoundView({
	title,
	body,
	size = 200,
	className = "min-h-[60vh]",
	children,
}: {
	title: string;
	body: string;
	size?: number;
	className?: string;
	children?: ReactNode;
}) {
	return (
		<EmptyState
			illustration="notFound"
			as="h1"
			title={title}
			subtitle={body}
			size={size}
			className={className}
			actions={children}
		/>
	);
}
