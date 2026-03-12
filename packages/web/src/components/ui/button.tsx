import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"bg-[#1E40AF] text-white shadow-md shadow-blue-500/20 hover:brightness-110 hover:shadow-lg hover:shadow-blue-500/30",
				destructive:
					"bg-red-50 text-red-600 hover:bg-red-100",
				outline:
					"border border-[#DBEAFE] bg-white shadow-sm hover:bg-[#EFF6FF] hover:text-[#1E40AF] hover:border-[#93C5FD]",
				secondary:
					"bg-[#EFF6FF] text-[#1E40AF] hover:bg-[#DBEAFE]",
				ghost: "hover:bg-[#F1F5F9] hover:text-[#0F172A]",
				link: "text-[#1E40AF] underline-offset-4 hover:underline",
				accent:
					"bg-[#F59E0B] text-white shadow-md shadow-amber-500/20 hover:brightness-110 hover:shadow-lg hover:shadow-amber-500/30",
			},
			size: {
				default: "h-10 px-5 py-2",
				sm: "h-9 rounded-xl px-4 text-xs",
				lg: "h-12 rounded-xl px-8 text-base",
				icon: "h-10 w-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
