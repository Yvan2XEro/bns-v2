"use client";

import { ChevronDown, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { type ShopTheme, shopThemeVars } from "~/lib/shop-theme";
import type { PublicShop } from "~/types";

function digits(phone: string): string {
	return phone.replace(/[^\d]/g, "");
}

/**
 * One "Contacter" button whose menu lists only the business channels the shop
 * filled. A shop conversation still needs a listing (`/api/conversations/start`),
 * so there is no "write to the shop" entry here yet.
 */
export function ShopContactButtons({
	contact,
	theme,
}: {
	contact: PublicShop["contact"];
	theme?: ShopTheme;
}) {
	const t = useTranslations("ShopPage");
	if (!contact.whatsapp && !contact.phone) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--shop-accent,#1E40AF)] px-[18px] font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--shop-accent,#1E40AF)] focus-visible:outline-offset-2"
				>
					<MessageSquare className="h-4 w-4" />
					{t("contact")}
					<ChevronDown className="h-4 w-4 opacity-80" />
				</button>
			</DropdownMenuTrigger>
			{/* Portalled out of the shop's scope, so it carries the colours itself. */}
			<DropdownMenuContent
				align="end"
				className="min-w-52 [&_[role=menuitem]:focus]:bg-[var(--shop-accent-soft)] [&_[role=menuitem]:focus]:text-[var(--shop-accent-text)]"
				style={theme ? shopThemeVars(theme) : undefined}
			>
				{contact.whatsapp && (
					<DropdownMenuItem asChild>
						<a
							href={`https://wa.me/${digits(contact.whatsapp)}`}
							target="_blank"
							rel="noopener noreferrer"
							className="cursor-pointer"
						>
							<MessageCircle className="mr-2 h-4 w-4 text-[#15803D]" />
							{t("contactWhatsapp")}
						</a>
					</DropdownMenuItem>
				)}
				{contact.phone && (
					<DropdownMenuItem asChild>
						<a
							href={`tel:${contact.phone.replace(/\s/g, "")}`}
							className="cursor-pointer"
						>
							<Phone className="mr-2 h-4 w-4" />
							<span>{t("contactCall")}</span>
							<span className="ml-auto pl-3 text-[#64748B] text-xs">
								{contact.phone}
							</span>
						</a>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
