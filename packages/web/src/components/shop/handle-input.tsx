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
		? "text-ok-ink"
		: status === "checking" || status === "idle"
			? "text-ink-muted"
			: "text-bad-ink";

	return (
		<div className="space-y-1.5">
			<div
				className={cn(
					"flex h-11 items-center overflow-hidden rounded-lg border bg-surface focus-within:border-brand-line",
					accepted
						? "border-[#86EFAC]"
						: rejected
							? "border-[#FCA5A5]"
							: "border-line",
				)}
			>
				<span className="shrink-0 border-line border-r bg-canvas px-3 text-ink-muted text-sm">
					buynsellem.com/s/
				</span>
				<input
					id="shop-handle"
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(slugifyHandle(event.target.value))}
					className="h-full min-w-0 flex-1 px-3 font-semibold text-ink text-sm outline-none disabled:bg-canvas"
					autoComplete="off"
					spellCheck={false}
					aria-invalid={rejected}
					aria-describedby="shop-handle-status"
				/>
				<span className="px-3">
					{status === "checking" && (
						<LoaderCircle className="h-4 w-4 animate-spin text-ink-faint" />
					)}
					{accepted && <Check className="h-4 w-4 text-ok" />}
					{rejected && <X className="h-4 w-4 text-bad" />}
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
