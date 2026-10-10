"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAppConfig } from "~/hooks/use-app-config";
import { cn } from "~/lib/utils";

export function DeliveryTabs() {
	const t = useTranslations("SellerDelivery");
	const pathname = usePathname();
	const { couriersEnabled } = useAppConfig();
	const tabs = [
		{ href: "/seller/delivery", label: t("tabZones") },
		{ href: "/seller/delivery/locations", label: t("tabLocations") },
		...(couriersEnabled
			? [{ href: "/seller/delivery/couriers", label: t("tabCouriers") }]
			: []),
	];
	return (
		<nav aria-label={t("tabsLabel")} className="flex gap-1 overflow-x-auto">
			{tabs.map(({ href, label }) => (
				<Link
					key={href}
					href={href}
					aria-current={pathname === href ? "page" : undefined}
					className={cn(
						"flex min-h-11 shrink-0 items-center rounded-lg px-4 font-medium text-sm",
						pathname === href
							? "bg-[#EFF6FF] text-[#1E40AF]"
							: "text-[#334155] hover:bg-[#F8FAFC]",
					)}
				>
					{label}
				</Link>
			))}
		</nav>
	);
}
