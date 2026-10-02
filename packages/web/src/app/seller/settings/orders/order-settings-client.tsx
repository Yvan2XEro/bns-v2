"use client";

import { useTranslations } from "next-intl";
import { LoadError, LoadingRows } from "~/components/seller/load-states";
import { useOrderSettings } from "~/hooks/use-order-settings";
import { resolveErrorMessage } from "~/lib/apiError";
import { capsNotice } from "~/lib/order-settings-form";
import { CapsNotice } from "./caps-notice";
import { OrderSettingsForm } from "./order-settings-fields";

export function OrderSettingsClient({
	shopId,
	canEdit,
}: {
	shopId: string;
	canEdit: boolean;
}) {
	const t = useTranslations("Billing");
	const tRoot = useTranslations();
	const settings = useOrderSettings(shopId);

	if (settings.isPending) return <LoadingRows rows={5} />;
	if (settings.isError) {
		return (
			<LoadError
				title={`${t("settingsLoadError")} — ${resolveErrorMessage(settings.error, tRoot)}`}
				onRetry={() => void settings.refetch()}
			/>
		);
	}

	const view = settings.data;
	const caps = capsNotice(view);

	return (
		<div className="max-w-2xl space-y-5">
			<h1 className="font-bold text-2xl text-[#0F172A]">
				{t("orderSettingsTitle")}
			</h1>
			{caps && <CapsNotice caps={caps} />}
			{view.cityDefaultFee === null && (
				<p className="rounded-2xl bg-[#FFFBEB] p-4 text-[#92400E] text-sm">
					{t("launchCityNotice")}
				</p>
			)}
			{!canEdit && (
				<p className="text-[#64748B] text-sm">{t("settingsReadOnly")}</p>
			)}
			<OrderSettingsForm shopId={shopId} view={view} canEdit={canEdit} />
		</div>
	);
}
