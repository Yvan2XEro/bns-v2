"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
	useCreateRiderLink,
	useRevokeRiderLink,
} from "~/hooks/use-shop-shipments";
import { resolveErrorMessage } from "~/lib/apiError";
import { riderLinkState } from "~/lib/shipment-panel";
import type { ShopShipmentView } from "../../../../../../api/src/contracts/shipments";

/**
 * The link is texted to the rider and its URL comes back once: it is shown
 * here from the create answer and not stored anywhere that could show it
 * again. Sending again rotates it, which revokes the previous one.
 */
export function RiderLinkCard({
	shopId,
	orderId,
	shipment,
	now,
}: {
	shopId: string;
	orderId: string;
	shipment: ShopShipmentView;
	now: Date;
}) {
	const t = useTranslations("SellerShipments");
	const tRoot = useTranslations();
	const create = useCreateRiderLink(shopId, orderId);
	const revoke = useRevokeRiderLink(shopId, orderId);
	const state = riderLinkState(shipment.riderLink, now);
	const url = create.data?.url;
	const error = create.error ?? revoke.error;

	return (
		<div className="space-y-2 rounded-xl border border-[#E2E8F0] p-3 text-sm">
			<p className="font-medium text-[#0F172A]">
				{t("linkTitle")} — {t(`linkState.${state}`)}
			</p>
			{url && (
				<div className="space-y-1">
					<p className="text-[#64748B] text-xs">{t("linkShownOnce")}</p>
					<div className="flex items-center gap-2">
						<input
							readOnly
							aria-label={t("linkUrl")}
							value={url}
							className="h-10 min-w-0 flex-1 rounded-lg border border-[#CBD5E1] px-3 text-xs"
						/>
						<Button
							variant="outline"
							className="min-h-11"
							onClick={() => void navigator.clipboard.writeText(url)}
						>
							<Copy aria-hidden /> {t("linkCopy")}
						</Button>
					</div>
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					className="min-h-11"
					disabled={create.isPending}
					onClick={() => create.mutate(shipment.id)}
				>
					{state === "none" ? t("linkSend") : t("linkResend")}
				</Button>
				{state === "active" && (
					<Button
						variant="outline"
						className="min-h-11"
						disabled={revoke.isPending}
						onClick={() => revoke.mutate(shipment.id)}
					>
						{t("linkRevoke")}
					</Button>
				)}
			</div>
			{error && (
				<p role="alert" className="text-red-700 text-xs">
					{resolveErrorMessage(error, tRoot)}
				</p>
			)}
		</div>
	);
}
