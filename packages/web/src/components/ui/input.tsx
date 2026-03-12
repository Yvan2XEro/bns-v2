import * as React from "react";
import { cn } from "~/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					"flex h-10 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-4 py-2 text-[#0F172A] text-sm transition-all duration-200 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-[#94A3B8] focus-visible:scale-[1.01] focus-visible:border-[#3B82F6] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/20 disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Input.displayName = "Input";

export { Input };
