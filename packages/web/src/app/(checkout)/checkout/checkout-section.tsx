import { Check } from "lucide-react";
import type { ReactNode } from "react";

/** One numbered block of the single checkout page: address, delivery, payment. */
export function CheckoutSection({
	number,
	title,
	subtitle,
	done,
	action,
	children,
}: {
	number: number;
	title: string;
	subtitle?: string;
	done: boolean;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-5 sm:px-6">
			<header className="flex items-center gap-3">
				<span
					aria-hidden
					className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold text-sm ${
						done ? "bg-[#1E40AF] text-white" : "bg-[#EFF6FF] text-[#1E40AF]"
					}`}
				>
					{done ? <Check className="h-4 w-4" /> : number}
				</span>
				<div className="min-w-0 flex-1">
					<h2 className="font-bold text-[#0F172A] text-lg">
						{number}. {title}
					</h2>
					{subtitle ? (
						<p className="text-[#64748B] text-sm">{subtitle}</p>
					) : null}
				</div>
				{action}
			</header>
			{children}
		</section>
	);
}
