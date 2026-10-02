import type { ReactNode } from "react";
import { Label } from "~/components/ui/label";

export const SELECT_CLASS =
	"flex h-11 w-full rounded-xl border border-[#DBEAFE] bg-[#F8FAFF] px-4 text-[#0F172A] text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/20";

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
			{hint && <p className="text-[#64748B] text-xs">{hint}</p>}
			{error && (
				<p role="alert" className="text-red-600 text-xs">
					{error}
				</p>
			)}
		</div>
	);
}
