"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
	type Crumb,
	WorkspaceTopBar,
} from "~/components/workspace/workspace-top-bar";
import { useAppConfig } from "~/hooks/use-app-config";
import { useMyShop } from "~/hooks/use-my-shop";
import { isSectionActive, OPS_SECTIONS } from "~/lib/moderation-console";
import { shopEntryFor } from "~/lib/shop-entry";

/** The moderation top bar: the shared workspace bar with the moderation trail. */
export function OpsTopBar({ bell }: { bell: ReactNode }) {
	const t = useTranslations("ModerationConsole");
	const tShell = useTranslations("Moderation.shell");
	const pathname = usePathname() ?? "/moderation";
	const { shopsEnabled } = useAppConfig();
	const { data: myShop, error } = useMyShop();
	const entry = shopEntryFor(myShop, shopsEnabled, Boolean(error));
	const section = OPS_SECTIONS.find(({ href }) =>
		isSectionActive(pathname, href),
	);

	const crumbs: Crumb[] = [
		{ label: tShell("title"), href: "/moderation" },
		...(section && section.key !== "queue"
			? [{ label: t(`nav.${section.key}`), href: section.href }]
			: []),
	];

	return (
		<WorkspaceTopBar
			crumbs={crumbs}
			bell={bell}
			shopEntry={
				entry
					? {
							href: entry.href,
							...(myShop?.shop?.name ? { shopName: myShop.shop.name } : {}),
						}
					: null
			}
		/>
	);
}
