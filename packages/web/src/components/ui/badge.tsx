import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:ring-offset-2",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-[#1E40AF] text-white shadow-sm",
				secondary:
					"border-transparent bg-[#EFF6FF] text-[#1E40AF]",
				destructive:
					"border-transparent bg-red-50 text-red-600",
				outline: "border-[#DBEAFE] text-[#475569]",
				success: "border-transparent bg-emerald-50 text-emerald-600",
				warning: "border-transparent bg-[#FEF3C7] text-[#92400E]",
				boost: "border-transparent bg-gradient-to-r from-[#F59E0B] to-[#FBBF24] text-white shadow-sm",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return (
		<div className={cn(badgeVariants({ variant }), className)} {...props} />
	);
}

export { Badge, badgeVariants };
