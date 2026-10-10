"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRiderView } from "~/hooks/use-rider-link";
import { riderErrorScreen } from "~/lib/rider-page";
import { RiderProblem } from "./invalid-link";
import { RiderActions } from "./rider-actions";
import { RiderDetails } from "./rider-details";

export function RiderClient({ token }: { token: string }) {
	const t = useTranslations("Rider");
	const view = useRiderView(token);
	const [delivered, setDelivered] = useState(false);

	if (delivered) {
		return (
			<output className="block space-y-2 py-16 text-center">
				<h1 className="font-bold text-[#166534] text-xl">
					{t("deliveredTitle")}
				</h1>
				<p className="text-[#475569] text-sm">{t("deliveredBody")}</p>
			</output>
		);
	}
	if (view.isPending) {
		return (
			<div className="space-y-3 py-6">
				<div className="h-24 animate-pulse rounded-2xl bg-[#F1F5F9]" />
				<div className="h-40 animate-pulse rounded-2xl bg-[#F1F5F9]" />
			</div>
		);
	}
	if (view.isError) {
		return (
			<RiderProblem
				screen={riderErrorScreen(view.error)}
				onRetry={() => void view.refetch()}
			/>
		);
	}
	return (
		<div className="space-y-4">
			<RiderDetails view={view.data} />
			<RiderActions
				token={token}
				allowed={view.data.allowedActions}
				onDelivered={() => setDelivered(true)}
			/>
		</div>
	);
}
