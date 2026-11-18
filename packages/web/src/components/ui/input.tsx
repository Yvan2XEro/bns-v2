import * as React from "react";
import { cn } from "~/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => {
		return (
			<input
				type={type}
				className={cn(
					"flex h-10 w-full rounded-xl border border-brand-tint bg-canvas px-4 py-2 text-ink text-sm transition-all duration-200 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-ink-faint focus-visible:scale-[1.01] focus-visible:border-brand-bright focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright/20 disabled:cursor-not-allowed disabled:opacity-50",
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
