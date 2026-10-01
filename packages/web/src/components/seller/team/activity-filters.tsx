"use client";

import { useTranslations } from "next-intl";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	ACTIVITY_ACTIONS,
	ACTIVITY_TARGET_TYPES,
	activityActionGroup,
	activityLabelKey,
} from "~/lib/shop-activity";
import type {
	ShopActivityAction,
	ShopActivityTargetType,
	TeamMemberView,
} from "~/types";

export interface ActivityFilterValue {
	actor?: string;
	action?: ShopActivityAction;
	targetType?: ShopActivityTargetType;
}

/** Radix `Select` has no "unset" value, so an explicit sentinel stands in for it. */
const ANY = "__any__";

/** Groups the 24 actions by their own prefix, in `ACTIVITY_ACTIONS`' order. */
function groupedActions(): Array<{
	group: string;
	actions: ShopActivityAction[];
}> {
	const groups: Array<{ group: string; actions: ShopActivityAction[] }> = [];
	for (const action of ACTIVITY_ACTIONS) {
		const group = activityActionGroup(action);
		const last = groups.at(-1);
		if (last?.group === group) last.actions.push(action);
		else groups.push({ group, actions: [action] });
	}
	return groups;
}

export function ActivityFilters({
	value,
	members,
	onChange,
}: {
	value: ActivityFilterValue;
	members: TeamMemberView[];
	onChange: (patch: Partial<ActivityFilterValue>) => void;
}) {
	const t = useTranslations();
	const tActivity = useTranslations("shopActivity");

	return (
		<div className="flex flex-wrap items-center gap-3">
			<Select
				value={value.actor ?? ANY}
				onValueChange={(next) =>
					onChange({ actor: next === ANY ? undefined : next })
				}
			>
				<SelectTrigger className="w-[200px]">
					<SelectValue placeholder={tActivity("filterActor")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ANY}>{tActivity("filterAny")}</SelectItem>
					{members.map((member) => (
						<SelectItem key={member.id} value={member.userId}>
							{member.name ?? member.userId}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<Select
				value={value.action ?? ANY}
				onValueChange={(next) =>
					onChange({
						action: next === ANY ? undefined : (next as ShopActivityAction),
					})
				}
			>
				<SelectTrigger className="w-[240px]">
					<SelectValue placeholder={tActivity("filterAction")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ANY}>{tActivity("filterAny")}</SelectItem>
					{groupedActions().map(({ group, actions }) => (
						<SelectGroup key={group}>
							<SelectLabel>{t(`shopActivity.groups.${group}`)}</SelectLabel>
							{actions.map((action) => (
								<SelectItem key={action} value={action}>
									{t(activityLabelKey(action))}
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>

			<Select
				value={value.targetType ?? ANY}
				onValueChange={(next) =>
					onChange({
						targetType:
							next === ANY ? undefined : (next as ShopActivityTargetType),
					})
				}
			>
				<SelectTrigger className="w-[200px]">
					<SelectValue placeholder={tActivity("filterTarget")} />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ANY}>{tActivity("filterAny")}</SelectItem>
					{ACTIVITY_TARGET_TYPES.map((targetType) => (
						<SelectItem key={targetType} value={targetType}>
							{t(`shopActivity.targets.${targetType}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
