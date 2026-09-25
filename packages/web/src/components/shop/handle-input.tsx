"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HandleStatus } from "~/hooks/use-handle-availability";
import { slugifyHandle } from "~/lib/shop-handle";
import { cn } from "~/lib/utils";

const REJECTED: HandleStatus[] = ["invalid", "reserved", "taken"];

/**
 * The handle field. Availability itself belongs to `useHandleAvailability`,
 * which the owning form calls so it can gate submission on the same status.
 */
export function HandleInput({
	value,
	onChange,
	status,
	disabled,
}: {
	value: string;
	onChange: (handle: string) => void;
	status: HandleStatus;
	disabled?: boolean;
}) {
	const t = useTranslations("ShopCreate");
	const rejected = REJECTED.includes(status);
	const accepted = status === "available" || status === "current";

	const tone = accepted
		? "text-[#166534]"
		: status === "checking" || status === "idle"
			? "text-[#64748B]"
			: "text-[#991B1B]";

	return (
		<div className="space-y-1.5">
			<div
				className={cn(
					"flex h-11 items-center overflow-hidden rounded-lg border bg-white focus-within:border-[#93C5FD]",
					accepted
						? "border-[#86EFAC]"
						: rejected
							? "border-[#FCA5A5]"
							: "border-[#E2E8F0]",
				)}
			>
				<span className="shrink-0 border-[#E2E8F0] border-r bg-[#F8FAFC] px-3 text-[#64748B] text-sm">
					buynsellem.com/s/
				</span>
				<input
					id="shop-handle"
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(slugifyHandle(event.target.value))}
					className="h-full min-w-0 flex-1 px-3 font-semibold text-[#0F172A] text-sm outline-none disabled:bg-[#F8FAFC]"
					autoComplete="off"
					spellCheck={false}
					aria-invalid={rejected}
					aria-describedby="shop-handle-status"
				/>
				<span className="px-3">
					{status === "checking" && (
						<LoaderCircle className="h-4 w-4 animate-spin text-[#94A3B8]" />
					)}
					{accepted && <Check className="h-4 w-4 text-[#16A34A]" />}
					{rejected && <X className="h-4 w-4 text-[#DC2626]" />}
				</span>
			</div>
			<p
				id="shop-handle-status"
				aria-live="polite"
				className={cn("text-xs", tone)}
			>
				{status === "idle" ? "" : t(`handleStatus.${status}`)}
			</p>
		</div>
	);
}
