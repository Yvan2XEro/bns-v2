import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { MarketMotif } from "~/components/auth/market-scene";
import { cn } from "~/lib/utils";

const SURFACE =
	"auth-rise w-full rounded-[28px] bg-white/90 ring-1 ring-[#E2E8F0]/70 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(30,64,175,0.14),0_40px_80px_-40px_rgba(30,64,175,0.22)]";

/**
 * The auth card. With `social`, it splits at lg: the form on the left, the
 * provider buttons on the right behind a soft divider. Below lg the buttons
 * follow the form under an "or" rule — the form always comes first in focus
 * order.
 */
export function AuthCard({
	title,
	description,
	icon,
	social,
	footer,
	children,
}: {
	title: string;
	description?: ReactNode;
	icon?: ReactNode;
	social?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
}) {
	const t = useTranslations("Auth");
	return (
		<section
			aria-labelledby="auth-title"
			className={cn(SURFACE, social ? "max-w-md lg:max-w-[52rem]" : "max-w-md")}
		>
			<div
				className={cn(
					social && "lg:grid lg:grid-cols-[minmax(0,1fr)_auto_19rem]",
				)}
			>
				<div className="px-6 pt-8 pb-6 sm:px-10 sm:pt-10">
					{icon ?? <MarketMotif className="mb-4 h-14 w-auto xl:hidden" />}
					<h1
						id="auth-title"
						className="font-bold font-heading text-[#0F172A] text-[28px] leading-tight tracking-tight"
					>
						{title}
					</h1>
					{description && (
						<p className="mt-2 text-[#64748B] text-[15px] leading-relaxed">
							{description}
						</p>
					)}
					<div className="mt-7">{children}</div>
				</div>

				{social && (
					<>
						<div
							aria-hidden="true"
							className="relative my-10 hidden w-px bg-gradient-to-b from-transparent via-[#E2E8F0] to-transparent lg:block"
						>
							<span className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 rounded-full bg-white px-2 py-1 font-medium text-[#94A3B8] text-xs">
								{t("or")}
							</span>
						</div>
						<div className="flex flex-col justify-center px-6 pb-8 sm:px-10 lg:px-7 lg:py-10">
							<div className="mb-4 flex items-center gap-3">
								<span
									aria-hidden="true"
									className="h-px flex-1 bg-[#E2E8F0] lg:hidden"
								/>
								<p className="text-[#64748B] text-sm lg:font-medium lg:text-[#0F172A]">
									{t("orContinueWith")}
								</p>
								<span
									aria-hidden="true"
									className="h-px flex-1 bg-[#E2E8F0] lg:hidden"
								/>
							</div>
							{social}
							<p className="mt-4 text-[#64748B] text-xs leading-relaxed">
								{t("socialPrivacy")}
							</p>
						</div>
					</>
				)}
			</div>

			{footer && (
				<div className="rounded-b-[28px] border-[#EEF2F7] border-t bg-[#F8FAFF]/80 px-6 py-5 text-center text-[#475569] text-sm sm:px-10">
					{footer}
				</div>
			)}
		</section>
	);
}

/** A round soft badge for status screens (email sent, link expired). */
export function AuthStatusIcon({ children }: { children: ReactNode }) {
	return (
		<div className="auth-float mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#EFF6FF] text-[#1E40AF] ring-8 ring-[#EFF6FF]/50">
			{children}
		</div>
	);
}

/** Primary submit button in the auth style. */
export const AUTH_SUBMIT =
	"h-12 w-full rounded-2xl bg-gradient-to-r from-[#1E40AF] to-[#2563EB] font-semibold text-[15px] shadow-[0_8px_20px_-8px_rgba(30,64,175,0.55)] hover:shadow-[0_10px_24px_-8px_rgba(30,64,175,0.6)]";

export const AUTH_LINK =
	"rounded font-medium text-[#1E40AF] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]";
