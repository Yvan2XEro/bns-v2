"use client";

import { ChevronDown, MessageCircle, MessageSquare, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
}: {
	contact: PublicShop["contact"];
}) {
	const t = useTranslations("ShopPage");
	if (!contact.whatsapp && !contact.phone) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1E40AF] px-[18px] font-semibold text-sm text-white hover:bg-[#1E3A8A]"
				>
					<MessageSquare className="h-4 w-4" />
					{t("contact")}
					<ChevronDown className="h-4 w-4 opacity-80" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-52">
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
