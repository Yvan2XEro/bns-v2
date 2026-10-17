"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "~/components/empty-state";
import {
	ConsoleHeader,
	DetailNotFound,
	MasterDetail,
} from "~/components/moderation/master-detail";
import { useUrlSelection } from "~/hooks/use-url-selection";

export type PlaceholderSection = "reports" | "risk" | "shops" | "shop" | "log";

const COPY: Record<PlaceholderSection, { title: string; subtitle: string }> = {
	reports: {
		title: "placeholder.reports.title",
		subtitle: "placeholder.reports.subtitle",
	},
	risk: {
		title: "placeholder.risk.title",
		subtitle: "placeholder.risk.subtitle",
	},
	shops: {
		title: "placeholder.shops.title",
		subtitle: "placeholder.shops.subtitle",
	},
	shop: {
		title: "placeholder.shop.title",
		subtitle: "placeholder.shop.subtitle",
	},
	log: { title: "placeholder.log.title", subtitle: "placeholder.log.subtitle" },
};

/**
 * A console section still to be built (Lots 3–4): the header and the
 * master-detail shell, with nothing listed yet. A shared `?item=` link
 * opens the panel and says the item is not listed here.
 */
export function SectionPlaceholder({
	section,
}: {
	section: PlaceholderSection;
}) {
	const t = useTranslations("ModerationConsole");
	const { selection, select } = useUrlSelection();
	return (
		<div className="space-y-5">
			<ConsoleHeader
				title={t(COPY[section].title)}
				subtitle={t(COPY[section].subtitle)}
			/>
			<MasterDetail
				open={selection !== null}
				onClose={() => select(null)}
				detail={<DetailNotFound />}
				list={
					<EmptyState
						title={t(COPY[section].title)}
						subtitle={t("placeholder.body")}
						ctaLabel={t("placeholder.toQueue")}
						ctaHref="/moderation"
						as="h2"
						size={140}
						className="rounded-xl border border-line bg-surface"
					/>
				}
			/>
		</div>
	);
}
