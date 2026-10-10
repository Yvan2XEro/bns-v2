"use client";

import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useReducer } from "react";
import { ActivityDetails } from "~/components/seller/team/activity-details";
import { ActivityFilters } from "~/components/seller/team/activity-filters";
import { ActivityTable } from "~/components/seller/team/activity-table";
import { useMyShop } from "~/hooks/use-my-shop";
import { useShopActivity } from "~/hooks/use-shop-activity";
import { useShopTeam } from "~/hooks/use-shop-team";
import { resolveErrorMessage } from "~/lib/apiError";
import { canSeeCost } from "~/lib/shop-roles";
import type {
	ShopActivityAction,
	ShopActivityTargetType,
	ShopActivityView,
} from "~/types";

interface ActivityState {
	actor?: string;
	action?: ShopActivityAction;
	targetType?: ShopActivityTargetType;
	openEntry: ShopActivityView | null;
}

const initialState: ActivityState = { openEntry: null };

function reducer(
	state: ActivityState,
	patch: Partial<ActivityState>,
): ActivityState {
	return { ...state, ...patch };
}

function ActivitySkeleton() {
	return (
		<div className="space-y-2">
			{[0, 1, 2, 3].map((i) => (
				<div key={i} className="h-12 animate-pulse rounded-xl bg-[#F1F5F9]" />
			))}
		</div>
	);
}

function ActivityError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	const t = useTranslations("shopActivity");
	return (
		<div
			role="alert"
			className="flex flex-col items-center rounded-2xl border border-[#E2E8F0] bg-white px-6 py-12 text-center"
		>
			<WifiOff aria-hidden="true" className="h-8 w-8 text-[#94A3B8]" />
			<p className="mt-3 font-semibold text-[#0F172A]">{message}</p>
			<button
				type="button"
				onClick={onRetry}
				className="mt-4 h-10 rounded-lg bg-[#1E40AF] px-4 font-semibold text-sm text-white hover:bg-[#1E3A8A]"
			>
				{t("retry")}
			</button>
		</div>
	);
}

/**
 * The team's activity log: who did what, filterable by member, action and
 * target. Pagination is the infinite query's own `fetchNextPage` behind a
 * "load more" button — never a `fetch` in `useEffect`.
 */
export function ActivityClient({ shopId }: { shopId: string }) {
	const t = useTranslations();
	const tActivity = useTranslations("shopActivity");
	const [state, patch] = useReducer(reducer, initialState);
	const mine = useMyShop();
	const team = useShopTeam(shopId);
	const query = useShopActivity(shopId, {
		actor: state.actor,
		action: state.action,
		targetType: state.targetType,
	});

	const entries = (query.data?.pages ?? []).flatMap((page) => page.docs);
	const canViewCost = canSeeCost(mine.data?.role ?? null);

	return (
		<div className="space-y-5">
			<h1 className="font-bold text-2xl text-[#0F172A]">
				{tActivity("title")}
			</h1>

			<ActivityFilters
				value={{
					actor: state.actor,
					action: state.action,
					targetType: state.targetType,
				}}
				members={team.data?.members ?? []}
				onChange={(next) => patch(next)}
			/>

			{query.isPending ? (
				<ActivitySkeleton />
			) : query.isError ? (
				<ActivityError
					message={resolveErrorMessage(query.error, t)}
					onRetry={() => void query.refetch()}
				/>
			) : (
				<ActivityTable
					entries={entries}
					onOpenEntry={(entry) => patch({ openEntry: entry })}
					hasNextPage={Boolean(query.hasNextPage)}
					isFetchingNextPage={query.isFetchingNextPage}
					onLoadMore={() => void query.fetchNextPage()}
				/>
			)}

			<ActivityDetails
				entry={state.openEntry}
				canSeeCost={canViewCost}
				onClose={() => patch({ openEntry: null })}
			/>
		</div>
	);
}
