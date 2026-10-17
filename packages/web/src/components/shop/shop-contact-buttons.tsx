"use client";

import {
	ChevronDown,
	Loader2,
	MessageCircle,
	MessageSquare,
	Phone,
	Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useAuth } from "~/hooks/use-auth";
import { useStartShopConversation } from "~/hooks/use-shop-inbox";
import { resolveErrorMessage } from "~/lib/apiError";
import { shopContactChannels } from "~/lib/shop-contact";
import { type ShopTheme, shopThemeVars } from "~/lib/shop-theme";
import type { PublicShop } from "~/types";

function goToSignIn() {
	window.location.href = `/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`;
}

/**
 * One "Contacter" button: writing to the shop in the app first, then only the
 * business channels the shop filled.
 */
export function ShopContactButtons({
	shopId,
	contact,
	theme,
	variant = "inline",
}: {
	shopId: string;
	contact: PublicShop["contact"];
	theme?: ShopTheme;
	/** `bar`: the full-width trigger of the sticky bottom bar on a phone. */
	variant?: "inline" | "bar";
}) {
	const bar = variant === "bar";
	const t = useTranslations("ShopPage");
	const tErrors = useTranslations();
	const router = useRouter();
	const { user, isLoading } = useAuth();
	const start = useStartShopConversation();

	function writeToShop() {
		if (!isLoading && !user) {
			goToSignIn();
			return;
		}
		start.mutate(shopId, {
			onSuccess: ({ conversationId }) => {
				router.push(`/messages?conversation=${conversationId}`);
			},
			onError: (error) => {
				if (error.status === 401) goToSignIn();
			},
		});
	}

	return (
		<div
			className={
				bar ? "flex w-full flex-col gap-1" : "inline-flex flex-col gap-1"
			}
		>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className={`${bar ? "h-11 w-full justify-center" : "h-10"} inline-flex items-center gap-2 rounded-lg bg-[var(--shop-accent,var(--c-brand-fill))] px-[18px] font-semibold text-[var(--shop-on-accent,#FFFFFF)] text-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--shop-accent,var(--c-brand))] focus-visible:outline-offset-2`}
					>
						<MessageSquare className="h-4 w-4" />
						{t("contact")}
						<ChevronDown className="h-4 w-4 opacity-80" />
					</button>
				</DropdownMenuTrigger>
				{/* Portalled out of the shop's scope, so it carries the colours itself. */}
				<DropdownMenuContent
					align={bar ? "center" : "end"}
					side={bar ? "top" : undefined}
					className="min-w-52 [&_[role=menuitem]:focus]:bg-[var(--shop-accent-soft)] [&_[role=menuitem]:focus]:text-[var(--shop-accent-text)]"
					data-shop-theme={theme?.brandColor}
					style={theme ? shopThemeVars(theme) : undefined}
				>
					{shopContactChannels(contact).map((channel) => {
						switch (channel.kind) {
							case "message":
								return (
									<DropdownMenuItem
										key="message"
										onSelect={writeToShop}
										disabled={start.isPending}
										className="cursor-pointer"
									>
										{start.isPending ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<Send className="mr-2 h-4 w-4" />
										)}
										{t("contactMessage")}
									</DropdownMenuItem>
								);
							case "whatsapp":
								return (
									<DropdownMenuItem key="whatsapp" asChild>
										<a
											href={channel.href}
											target="_blank"
											rel="noopener noreferrer"
											className="cursor-pointer"
										>
											<MessageCircle className="mr-2 h-4 w-4 text-ok-ink-soft" />
											{t("contactWhatsapp")}
										</a>
									</DropdownMenuItem>
								);
							default:
								return (
									<DropdownMenuItem key="call" asChild>
										<a href={channel.href} className="cursor-pointer">
											<Phone className="mr-2 h-4 w-4" />
											<span>{t("contactCall")}</span>
											<span className="ml-auto pl-3 text-ink-muted text-xs">
												{channel.phone}
											</span>
										</a>
									</DropdownMenuItem>
								);
						}
					})}
				</DropdownMenuContent>
			</DropdownMenu>
			{start.isError && start.error.status !== 401 && (
				<p
					role="alert"
					className={`${bar ? "" : "max-w-52"}text-red-500 text-xs`}
				>
					{resolveErrorMessage(start.error, tErrors)}
				</p>
			)}
		</div>
	);
}
