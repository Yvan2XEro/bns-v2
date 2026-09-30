"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { ModerationQueue } from "~/hooks/use-moderation-verification";
import type { QueueTab } from "~/lib/moderation-verification";

const QUEUE_VALUES: Record<string, true> = {
	to_review: true,
	mine: true,
	needs_info: true,
	decided: true,
};

function isModerationQueue(value: string): value is ModerationQueue {
	return QUEUE_VALUES[value] === true;
}

/** To review / Mine / Waiting on seller / Decided — with a count badge only where one exists. */
export function QueueTabs({
	tabs,
	active,
	onChange,
}: {
	tabs: QueueTab[];
	active: ModerationQueue;
	onChange: (queue: ModerationQueue) => void;
}) {
	const t = useTranslations("Moderation");

	return (
		<Tabs
			value={active}
			onValueChange={(value) => {
				if (isModerationQueue(value)) onChange(value);
			}}
		>
			<TabsList>
				{tabs.map((tab) => (
					<TabsTrigger key={tab.key} value={tab.key}>
						{t(`tabs.${tab.key}`)}
						{tab.count !== null && (
							<span className="ml-1.5 rounded-full bg-[#DBEAFE] px-1.5 font-semibold text-[#1E40AF] text-[10px]">
								{tab.count}
							</span>
						)}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
