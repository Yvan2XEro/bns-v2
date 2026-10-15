"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { helpLinks } from "~/lib/nav";
import { LocaleSwitcher } from "./locale-switcher";

/** The thin navy band above the main bar: trust line, selling, help, language. */
export function UtilityBar({ sellHref }: { sellHref: string }) {
	const t = useTranslations("Nav");
	return (
		<div className="hidden bg-[#0F172A] text-[#CBD5E1] text-xs md:block">
			<div className="container mx-auto flex h-8 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
				<p className="truncate">{t("trustLine")}</p>
				<div className="flex shrink-0 items-center gap-1">
					<Link
						href={sellHref}
						className="rounded px-2 py-1 font-semibold text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]"
					>
						{t("sellOnPlatform")}
					</Link>
					<HelpMenu />
					<LocaleSwitcher tone="dark" className="h-7" />
				</div>
			</div>
		</div>
	);
}

export function HelpMenu() {
	const t = useTranslations("Nav");
	const links = helpLinks();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger className="flex items-center gap-1 rounded px-2 py-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD] data-[state=open]:text-white">
				{t("help")}
				<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-64 rounded-xl border-[#E2E8F0] bg-white p-1.5 text-[#0F172A]"
			>
				<HelpItems links={links} />
				<DropdownMenuSeparator className="bg-[#E2E8F0]" />
				<DropdownMenuItem asChild className="cursor-pointer rounded-lg">
					<Link href="/help">{t("helpCenter")}</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function HelpItems({ links }: { links: ReturnType<typeof helpLinks> }) {
	const t = useTranslations("Nav");
	return links.map((link) => {
		const external = link.href.startsWith("http");
		return (
			<DropdownMenuItem
				key={link.key}
				asChild
				className="cursor-pointer rounded-lg"
			>
				<Link
					href={link.href}
					{...(external
						? { target: "_blank", rel: "noopener noreferrer" }
						: {})}
				>
					{t(link.key)}
					{external && (
						<ExternalLink aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
					)}
				</Link>
			</DropdownMenuItem>
		);
	});
}
