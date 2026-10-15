"use client";

import { MapPin, MessageCircle, Share2, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { shopTheme, shopThemeVars } from "~/lib/shop-theme";
import { shopUrl } from "~/lib/shop-url";
import { cn } from "~/lib/utils";
import type { MyShop } from "~/types";
import { LevelBadge } from "./level-badge";
import type { ShopProfileDraft } from "./profile-form";
import { ShopInitials } from "./shop-initials";

type Device = "desktop" | "mobile";

const BANNER_PATTERN =
	"bg-[var(--shop-header-bg)] bg-[length:16px_16px] bg-[radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)]";

/**
 * The public page's header as the draft would render it, beside the settings
 * form. A static picture: none of its buttons act, and the rating, product
 * count and badge are the shop's stored ones, which the form cannot change.
 */
export function ShopPagePreview({
	shop,
	draft,
	categoryNames,
}: {
	shop: MyShop;
	draft: ShopProfileDraft;
	categoryNames: string[];
}) {
	const tPreview = useTranslations("ShopSettingsPreview");
	const tShop = useTranslations("Shop");
	const locale = useLocale();
	const [device, setDevice] = useState<Device>("desktop");
	const mobile = device === "mobile";
	const name = draft.name.trim() || shop.name;
	const url = shopUrl(shop.handle).replace(/^https?:\/\//, "");

	return (
		<section
			aria-label={tPreview("title")}
			className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white"
		>
			<div className="flex items-center justify-between gap-3 border-[#E2E8F0] border-b px-[18px] py-3.5">
				<h2 className="font-bold text-[#0F172A] text-base">
					{tPreview("title")}
				</h2>
				<fieldset className="flex gap-1 rounded-lg bg-[#F1F5F9] p-[3px]">
					<legend className="sr-only">{tPreview("device")}</legend>
					{(["desktop", "mobile"] as const).map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={device === value}
							onClick={() => setDevice(value)}
							className={cn(
								"flex h-7 items-center rounded-md px-2.5 font-semibold text-xs",
								device === value
									? "bg-white text-[#1E40AF] shadow-[0_1px_3px_rgba(15,23,42,0.12)]"
									: "text-[#475569]",
							)}
						>
							{tPreview(value)}
						</button>
					))}
				</fieldset>
			</div>
			<div className="bg-[#F1F5F9] p-4">
				<div
					aria-hidden="true"
					data-shop-theme={draft.brandColor ?? undefined}
					style={shopThemeVars(shopTheme(draft.brandColor))}
					className={cn(
						"mx-auto overflow-hidden bg-white shadow-[0_8px_24px_rgba(15,23,42,0.1)]",
						mobile
							? "w-[300px] rounded-[22px] border-[#0F172A] border-[6px]"
							: "rounded-[10px]",
					)}
				>
					{!mobile && (
						<div className="flex h-[30px] items-center gap-1.5 border-[#E2E8F0] border-b bg-[#F8FAFC] px-2.5">
							<span className="h-2 w-2 rounded-full bg-[#E2E8F0]" />
							<span className="h-2 w-2 rounded-full bg-[#E2E8F0]" />
							<span className="mx-[30px] flex h-[18px] flex-1 items-center justify-center truncate rounded-[5px] border border-[#E2E8F0] bg-white text-[#64748B] text-[11px]">
								{url}
							</span>
						</div>
					)}
					<div
						className={cn(
							"w-full",
							mobile ? "h-[90px]" : "h-[120px]",
							BANNER_PATTERN,
						)}
					>
						{draft.bannerUrl && (
							// biome-ignore lint/performance/noImgElement: a fresh upload's object URL or stored media
							<img
								src={draft.bannerUrl}
								alt=""
								className="h-full w-full object-cover"
							/>
						)}
					</div>
					<div className="flex flex-col gap-2.5 px-[18px] pb-[18px]">
						<div
							className={cn(
								"-mt-9 flex gap-3.5",
								mobile ? "flex-col items-start" : "items-end",
							)}
						>
							<ShopInitials
								name={name}
								logoUrl={draft.logoUrl}
								className="h-[76px] w-[76px] rounded-[20px] border-4 border-white bg-[var(--shop-header-bg)] font-extrabold text-[26px] text-[var(--shop-header-fg)] shadow-[0_4px_12px_rgba(15,23,42,0.18)]"
							/>
							{!mobile && (
								<div className="ml-auto flex gap-2 pb-1">
									<span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--shop-accent)] px-3 font-semibold text-[var(--shop-on-accent)] text-xs">
										<MessageCircle className="h-3.5 w-3.5" />
										{tPreview("contact")}
									</span>
									<span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 font-semibold text-[#0F172A] text-xs">
										<Share2 className="h-3.5 w-3.5" />
										{tPreview("share")}
									</span>
								</div>
							)}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<span className="break-words font-extrabold text-[#0F172A] text-xl">
								{name}
							</span>
							<LevelBadge badge={shop.badge} size="sm" />
						</div>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#64748B] text-xs">
							{shop.totalReviews > 0 && (
								<span className="flex items-center gap-1">
									<Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
									<strong className="text-[#0F172A]">
										{shop.rating.toLocaleString(locale, {
											maximumFractionDigits: 1,
										})}
									</strong>
									({tShop("reviews", { count: shop.totalReviews })})
								</span>
							)}
							<span>
								{tShop("products", { count: shop.publishedListingCount })}
							</span>
							{draft.city && (
								<span className="flex items-center gap-1">
									<MapPin className="h-3.5 w-3.5 text-[#F59E0B]" />
									{draft.city}
								</span>
							)}
						</div>
						{draft.description.trim() && (
							<p className="line-clamp-3 text-[#334155] text-[13px] leading-5">
								{draft.description}
							</p>
						)}
						{categoryNames.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{categoryNames.map((category) => (
									<span
										key={category}
										className="rounded-full bg-[var(--shop-accent-soft)] px-2.5 py-0.5 font-medium text-[var(--shop-accent-text)] text-xs"
									>
										{category}
									</span>
								))}
							</div>
						)}
					</div>
				</div>
				<p className="mt-3 text-[#64748B] text-xs">{tPreview("shareNote")}</p>
			</div>
		</section>
	);
}
