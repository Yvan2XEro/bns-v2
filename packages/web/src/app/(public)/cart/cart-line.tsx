"use client";

import { ImageOff, Minus, Plus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { cartLineState, quantityStepper } from "~/lib/cart-lines";
import { formatXaf } from "~/lib/order-money";
import { cn } from "~/lib/utils";
import type { CartLineView } from "~/types/order";

export function CartLine({
	line,
	locale,
	busy,
	onQuantity,
	onRemove,
}: {
	line: CartLineView;
	locale: "fr" | "en";
	busy: boolean;
	onQuantity: (quantity: number) => void;
	onRemove: () => void;
}) {
	const t = useTranslations("Cart");
	const state = cartLineState(line);
	const stepper = quantityStepper(line);
	const quantityId = `cart-quantity-${line.id}`;
	const stepButton =
		"inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#DBEAFE] bg-white text-[#0F172A] hover:bg-[#EFF6FF] disabled:pointer-events-none disabled:opacity-40";

	return (
		<li
			className={cn(
				"flex gap-4 rounded-2xl border bg-white p-4",
				state === "unavailable"
					? "border-red-200 bg-red-50/40"
					: "border-[#E2E8F0]",
			)}
		>
			<div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
				{line.imageUrl ? (
					<Image
						src={line.imageUrl}
						alt={line.title}
						fill
						sizes="80px"
						className={cn(
							"object-cover",
							state === "unavailable" && "opacity-50 grayscale",
						)}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-[#94A3B8]">
						<ImageOff className="h-6 w-6" aria-hidden />
					</div>
				)}
			</div>

			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="truncate font-semibold text-[#0F172A]">
							{line.title}
						</p>
						{line.variantLabel ? (
							<p className="text-[#64748B] text-sm">{line.variantLabel}</p>
						) : null}
					</div>
					<p className="shrink-0 font-semibold text-[#0F172A]">
						{formatXaf(line.lineSubtotal, locale)}
					</p>
				</div>

				{state === "unavailable" ? (
					<p className="font-medium text-red-600 text-sm">{t("unavailable")}</p>
				) : null}
				{state === "price_changed" ? (
					<p className="text-amber-700 text-sm">
						{t("priceChanged")}{" "}
						<span className="text-[#64748B]">
							{t("priceWas", { price: formatXaf(line.priceAtAdd, locale) })}
						</span>
					</p>
				) : null}

				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<label htmlFor={quantityId} className="text-[#64748B] text-sm">
							{t("quantity")}
						</label>
						<button
							type="button"
							className={stepButton}
							aria-label={t("decrease", { title: line.title })}
							aria-controls={quantityId}
							disabled={busy || !stepper.canDecrease}
							onClick={() => onQuantity(line.quantity - 1)}
						>
							<Minus className="h-4 w-4" aria-hidden />
						</button>
						<output
							id={quantityId}
							aria-live="polite"
							className="min-w-8 text-center font-semibold text-[#0F172A]"
						>
							{line.quantity}
						</output>
						<button
							type="button"
							className={stepButton}
							aria-label={t("increase", { title: line.title })}
							aria-controls={quantityId}
							disabled={busy || !stepper.canIncrease}
							onClick={() => onQuantity(line.quantity + 1)}
						>
							<Plus className="h-4 w-4" aria-hidden />
						</button>
					</div>

					<button
						type="button"
						className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-red-600 text-sm hover:bg-red-50 disabled:opacity-40"
						aria-label={t("removeItem", { title: line.title })}
						disabled={busy}
						onClick={onRemove}
					>
						<Trash2 className="h-4 w-4" aria-hidden />
						{t("remove")}
					</button>
				</div>

				{stepper.atMax ? (
					<p className="text-[#64748B] text-xs">{t("maxQuantity")}</p>
				) : null}
			</div>
		</li>
	);
}
