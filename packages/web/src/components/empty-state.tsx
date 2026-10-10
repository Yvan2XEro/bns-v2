import Link from "next/link";
import type { ReactNode } from "react";
import {
	Auth,
	Boost,
	Empty,
	Favorites,
	NoListings,
	NoMessages,
	NotFound,
	Searching,
	Sell,
} from "./illustrations";

const ILLUSTRATION_MAP = {
	empty: Empty,
	searching: Searching,
	favorites: Favorites,
	messages: NoMessages,
	sell: Sell,
	auth: Auth,
	boost: Boost,
	listings: NoListings,
	notFound: NotFound,
} as const;

export type EmptyStateIllustration = keyof typeof ILLUSTRATION_MAP;

interface EmptyStateProps {
	illustration?: EmptyStateIllustration;
	title: string;
	subtitle?: string;
	ctaLabel?: string;
	ctaHref?: string;
	onCta?: () => void;
	/** Replaces the default call to action when it needs more than a label. */
	actions?: ReactNode;
	size?: number;
	as?: "h1" | "h2" | "p";
	className?: string;
}

const CTA =
	"inline-flex items-center rounded-xl bg-[#1E40AF] px-7 py-3 font-semibold text-sm text-white transition-colors hover:bg-[#1E3A8A]";

export function EmptyState({
	illustration = "empty",
	title,
	subtitle,
	ctaLabel,
	ctaHref,
	onCta,
	actions,
	size = 200,
	as: Title = "h2",
	className = "",
}: EmptyStateProps) {
	const Illustration = ILLUSTRATION_MAP[illustration];
	return (
		<div
			className={`ill-entrance flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
		>
			<div className="mb-5">
				<Illustration color="#1E40AF" size={size} />
			</div>
			<Title className="max-w-[420px] font-bold text-[#0F172A] text-lg">
				{title}
			</Title>
			{subtitle && (
				<p className="mt-2 max-w-[420px] text-[#64748B] text-sm leading-5">
					{subtitle}
				</p>
			)}
			{actions ? (
				<div className="mt-6 flex flex-wrap justify-center gap-3">
					{actions}
				</div>
			) : ctaLabel && ctaHref ? (
				<Link href={ctaHref} className={`mt-6 ${CTA}`}>
					{ctaLabel}
				</Link>
			) : ctaLabel && onCta ? (
				<button type="button" onClick={onCta} className={`mt-6 ${CTA}`}>
					{ctaLabel}
				</button>
			) : null}
		</div>
	);
}
