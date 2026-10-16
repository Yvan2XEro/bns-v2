import type { ReactNode } from "react";
import { Label } from "~/components/ui/label";

export const SELECT_CLASS =
	"flex h-11 w-full rounded-xl border border-brand-tint bg-canvas px-4 text-ink text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bright/20";

export function Field({
	id,
	label,
	error,
	hint,
	children,
}: {
	id: string;
	label: string;
	error?: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{hint && <p className="text-ink-muted text-xs">{hint}</p>}
			{error && (
				<p role="alert" className="text-red-600 text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
