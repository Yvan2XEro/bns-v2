import { Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "~/lib/utils";

export interface ChecklistInput {
	hasLogo: boolean;
	productCount: number;
	personalListings: number;
	handle: string;
}

export function FirstRunChecklist({
	hasLogo,
	productCount,
	personalListings,
	handle,
}: ChecklistInput) {
	const t = useTranslations("Seller");
	const steps = [
		{
			key: "logo",
			done: hasLogo,
			title: t("checklist.logo"),
			detail: hasLogo ? t("checklist.logoDone") : t("checklist.logoTodo"),
			href: "/shop/manage",
		},
		{
			key: "product",
			done: productCount > 0,
			title: t("checklist.product"),
			detail: t("checklist.productDetail"),
			href: "/seller/catalogue/new",
		},
		{
			key: "move",
			done: personalListings === 0,
			title: t("checklist.move"),
			detail:
				personalListings === 0
					? t("checklist.moveDone")
					: t("checklist.moveDetail", { count: personalListings }),
			href: "/shop/manage?move=1",
		},
		{
			key: "share",
			done: false,
			title: t("checklist.share"),
			detail: t("checklist.shareDetail"),
			href: `/s/${handle}`,
		},
	];
	const doneCount = steps.filter((step) => step.done).length;
	// The share step can never be observed as done, so it never holds the list open.
	if (steps.slice(0, 3).every((step) => step.done)) return null;

	return (
		<div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-[#0F172A]">{t("checklist.title")}</h2>
				<span className="text-[#64748B] text-sm">
					{doneCount} / {steps.length}
				</span>
			</div>
			<ol className="mt-4 space-y-2">
				{steps.map((step, index) => (
					<li key={step.key}>
						<Link
							href={step.href}
							className="flex items-center gap-3 rounded-lg p-2 hover:bg-[#F8FAFC]"
						>
							<span
								className={cn(
									"flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
									step.done
										? "bg-[#dcfce7] text-[#166534]"
										: "bg-[#EFF6FF] text-[#1E40AF]",
								)}
							>
								{step.done ? (
									<Check aria-hidden="true" className="h-4 w-4" />
								) : (
									index + 1
								)}
							</span>
							<span className="min-w-0 flex-1">
								<span
									className={cn(
										"block font-medium text-sm",
										step.done
											? "text-[#64748B] line-through"
											: "text-[#0F172A]",
									)}
								>
									{step.title}
								</span>
								<span className="block text-[#64748B] text-xs">
									{step.detail}
								</span>
							</span>
						</Link>
					</li>
				))}
			</ol>
		</div>
	);
}
