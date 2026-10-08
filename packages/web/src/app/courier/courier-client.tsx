"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { Button } from "~/components/ui/button";
import { useAuth } from "~/hooks/use-auth";
import {
	useCourierMembers,
	useCourierShipments,
} from "~/hooks/use-courier-space";
import { ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import {
	COURIER_TABS,
	type CourierTab,
	dispatcherCourierIds,
} from "~/lib/courier-space";
import { cn } from "~/lib/utils";
import { CourierRow } from "./courier-row";

export function CourierClient() {
	const t = useTranslations("Courier");
	const tRoot = useTranslations();
	const { user } = useAuth();
	const [tab, setTab] = useState<CourierTab>("all");
	const shipments = useCourierShipments(tab);
	const members = useCourierMembers(shipments.isSuccess);
	const dispatcherOf = dispatcherCourierIds(members.data ?? []);

	if (shipments.error?.code === ERROR_CODES.shipmentNotAssigned) {
		return (
			<div
				role="alert"
				className="mx-auto max-w-md space-y-2 px-4 py-16 text-center"
			>
				<h1 className="font-bold text-[#0F172A] text-xl">
					{t("notMemberTitle")}
				</h1>
				<p className="text-[#475569] text-sm">{t("notMemberBody")}</p>
			</div>
		);
	}

	const rows = shipments.data?.pages.flatMap((page) => page.rows) ?? [];

	return (
		<div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("title")}</h1>
			<nav aria-label={t("tabsLabel")} className="flex gap-1 overflow-x-auto">
				{COURIER_TABS.map((entry) => (
					<button
						key={entry}
						type="button"
						aria-pressed={tab === entry}
						onClick={() => setTab(entry)}
						className={cn(
							"min-h-11 shrink-0 rounded-lg px-4 font-medium text-sm",
							tab === entry
								? "bg-[#EFF6FF] text-[#1E40AF]"
								: "text-[#334155] hover:bg-[#F8FAFC]",
						)}
					>
						{t(`tab.${entry}`)}
					</button>
				))}
			</nav>
			{shipments.isPending && <LoadingRows rows={4} />}
			{shipments.isError && (
				<LoadError
					title={`${t("loadError")} — ${resolveErrorMessage(shipments.error, tRoot)}`}
					onRetry={() => void shipments.refetch()}
				/>
			)}
			{shipments.isSuccess && rows.length === 0 && (
				<p className="rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center text-[#64748B] text-sm">
					{t("empty")}
				</p>
			)}
			<ul className="space-y-3">
				{rows.map((row) => (
					<CourierRow
						key={row.id}
						row={row}
						dispatcherOf={dispatcherOf}
						members={members.data ?? []}
						userId={user?.id ?? null}
					/>
				))}
			</ul>
			{shipments.hasNextPage && (
				<Button
					variant="outline"
					className="min-h-11"
					disabled={shipments.isFetchingNextPage}
					onClick={() => void shipments.fetchNextPage()}
				>
					{t("loadMore")}
				</Button>
			)}
		</div>
	);
}
