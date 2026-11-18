"use client";

import { Check, LoaderCircle, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { brandColorOf } from "~/lib/shop-form";
import {
	BRAND_SWATCHES,
	dominantColor,
	PLATFORM_ACCENT,
	shopTheme,
	shopThemeVars,
} from "~/lib/shop-theme";
import { cn } from "~/lib/utils";

/** Reads the logo's pixels; refused when its host sends no CORS headers. */
async function colorFromImage(url: string): Promise<string | null> {
	const image = new Image();
	image.crossOrigin = "anonymous";
	image.src = url;
	await image.decode();
	const size = 64;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.drawImage(image, 0, 0, size, size);
	return dominantColor(context.getImageData(0, 0, size, size).data);
}

/**
 * The shop's colour: a curated row, a custom hex, or one read off the logo.
 * `value` is the text as typed ("" for the platform colour); the form's schema
 * refuses what the API's `isBrandColor` would.
 */
export function BrandColorField({
	value,
	onChange,
	invalid,
	logoUrl,
}: {
	value: string;
	onChange: (next: string) => void;
	invalid: boolean;
	logoUrl: string | null;
}) {
	const t = useTranslations("ShopBrand");
	const inputId = useId();
	const hintId = useId();
	const radioName = useId();
	const [suggesting, setSuggesting] = useState(false);
	const [suggestError, setSuggestError] = useState<string | null>(null);
	const picked = brandColorOf(value);
	const theme = shopTheme(picked);

	async function suggest() {
		if (!logoUrl) return;
		setSuggesting(true);
		setSuggestError(null);
		try {
			const color = await colorFromImage(logoUrl);
			if (color) onChange(color);
			else setSuggestError(t("suggestNone"));
		} catch {
			setSuggestError(t("suggestFailed"));
		} finally {
			setSuggesting(false);
		}
	}

	return (
		<fieldset className="space-y-3">
			<legend className="mb-1.5 font-medium text-ink text-sm">
				{t("label")}
			</legend>
			<p className="text-ink-muted text-xs">{t("hint")}</p>
			<fieldset className="flex flex-wrap gap-2">
				<legend className="sr-only">{t("swatches")}</legend>
				{BRAND_SWATCHES.map((swatch) => {
					const selected = picked === swatch;
					return (
						<label
							key={swatch}
							title={swatch}
							style={{ backgroundColor: swatch }}
							className={cn(
								"flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink",
								selected && "ring-2 ring-ink",
							)}
						>
							<input
								type="radio"
								name={radioName}
								value={swatch}
								checked={selected}
								onChange={() => onChange(swatch)}
								aria-label={swatch}
								className="sr-only"
							/>
							{selected && (
								<Check aria-hidden="true" className="h-4 w-4 text-white" />
							)}
						</label>
					);
				})}
			</fieldset>
			<div className="flex flex-wrap items-center gap-2">
				<label htmlFor={inputId} className="sr-only">
					{t("custom")}
				</label>
				<span
					aria-hidden="true"
					className="h-9 w-9 shrink-0 rounded-lg border border-line"
					style={{ backgroundColor: picked ?? PLATFORM_ACCENT }}
				/>
				<input
					id={inputId}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={t("customPlaceholder")}
					maxLength={7}
					spellCheck={false}
					autoComplete="off"
					aria-invalid={invalid}
					aria-describedby={hintId}
					className={cn(
						"h-9 w-32 rounded-lg border bg-surface px-3 font-mono text-sm uppercase focus:outline-none",
						invalid
							? "border-red-400 focus:border-red-500"
							: "border-line focus:border-brand-line",
					)}
				/>
				{logoUrl && (
					<button
						type="button"
						onClick={suggest}
						disabled={suggesting}
						className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 font-semibold text-ink text-xs hover:bg-canvas disabled:opacity-60"
					>
						{suggesting ? (
							<LoaderCircle
								aria-hidden="true"
								className="h-3.5 w-3.5 animate-spin"
							/>
						) : (
							<Wand2 aria-hidden="true" className="h-3.5 w-3.5" />
						)}
						{t("suggest")}
					</button>
				)}
				{value.trim() !== "" && (
					<button
						type="button"
						onClick={() => onChange("")}
						className="h-9 px-1 font-semibold text-ink-muted text-xs underline-offset-2 hover:underline"
					>
						{t("reset")}
					</button>
				)}
			</div>
			<p
				id={hintId}
				aria-live="polite"
				className={
					invalid || suggestError
						? "text-red-600 text-xs"
						: "text-ink-faint text-xs"
				}
			>
				{invalid ? t("invalid") : (suggestError ?? t("customHint"))}
			</p>
			<div
				aria-label={t("preview")}
				role="img"
				data-shop-theme={theme.brandColor}
				style={shopThemeVars(theme)}
				className="overflow-hidden rounded-lg border border-line bg-surface"
			>
				<div className="flex h-11 items-center bg-[var(--shop-header-bg)] px-3 font-bold text-[var(--shop-header-fg)] text-sm">
					<span>{t("previewShop")}</span>
					<span className="ml-2 font-normal text-[var(--shop-header-muted)] text-xs">
						{t("previewTagline")}
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-2 p-3">
					<span className="inline-flex h-8 items-center rounded-lg bg-[var(--shop-accent)] px-3 font-semibold text-[var(--shop-on-accent)] text-xs">
						{t("previewButton")}
					</span>
					<span className="rounded-full bg-[var(--shop-accent-soft)] px-2.5 py-1 font-medium text-[var(--shop-accent-text)] text-xs">
						{t("previewChip")}
					</span>
					<span className="font-semibold text-[var(--shop-accent-text)] text-xs underline">
						{t("previewLink")}
					</span>
				</div>
			</div>
		</fieldset>
	);
}
