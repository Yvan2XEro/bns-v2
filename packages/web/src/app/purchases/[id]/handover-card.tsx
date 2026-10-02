"use client";

import { LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
	type OrderAction,
	useRegenerateHandoverCode,
} from "~/hooks/use-order-actions";
import { resolveErrorMessage } from "~/lib/apiError";
import type { OrderView } from "~/types/order";
import { handoverCardState } from "../purchase-view";

/**
 * The plaintext code exists in two places only: the SMS sent at shipping,
 * and the answer to a regeneration. So the large digits appear once the
 * buyer regenerates; before that, the card says where the code went.
 */
export function HandoverCard({
	order,
	actions,
}: {
	order: OrderView;
	actions: readonly OrderAction[];
}) {
	const t = useTranslations("Purchases");
	const tRoot = useTranslations();
	const regenerate = useRegenerateHandoverCode({ orderId: order.id });
	const state = handoverCardState(order, actions);
	const code = regenerate.data?.code;

	return (
		<section className="space-y-3 rounded-2xl border-2 border-[#1E40AF] bg-[#EFF6FF] p-5">
			<h2 className="font-semibold text-[#0F172A]">{t("handoverTitle")}</h2>

			{code && !state.locked ? (
				<div>
					<p className="text-[#334155] text-sm">{t("handoverYourCode")}</p>
					<p
						className="font-bold font-mono text-5xl text-[#0F172A] tracking-[0.4em]"
						aria-live="polite"
					>
						{code}
					</p>
				</div>
			) : (
				!state.locked && (
					<p className="text-[#334155] text-sm">{t("handoverSentBySms")}</p>
				)
			)}

			<p className="font-medium text-[#92400E] text-sm">{t("handoverBody")}</p>

			{state.locked && (
				<div className="space-y-1 rounded-xl bg-white p-3 text-sm">
					<p className="flex items-center gap-2 font-semibold text-red-700">
						<LockKeyhole aria-hidden /> {t("handoverLocked")}
					</p>
					{state.showFallbacks && (
						<>
							<p className="text-[#334155]">{t("handoverFallbacksIntro")}</p>
							<ul className="list-disc space-y-0.5 pl-5 text-[#334155]">
								<li>{t("handoverFallbackConfirm")}</li>
								<li>{t("handoverFallbackSeller")}</li>
							</ul>
						</>
					)}
				</div>
			)}

			<p className="text-[#64748B] text-xs">
				{t("handoverRegenerateLeft", { count: state.regenerationsLeft })}
			</p>

			{state.canRegenerate && (
				<Button
					variant="outline"
					className="min-h-11"
					disabled={regenerate.isPending}
					onClick={() => regenerate.mutate()}
				>
					{t("handoverRegenerate")}
				</Button>
			)}
			{regenerate.isError && (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(regenerate.error, tRoot)}
				</p>
			)}
		</section>
	);
}
