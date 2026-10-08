"use client";

import { useTranslations } from "next-intl";
import { useReturnAction } from "~/hooks/use-returns";
import { resolveErrorMessage } from "~/lib/apiError";
import { sellerReturnActions } from "~/lib/seller-return-actions";
import type { ReturnCaseView } from "../../../../../api/src/contracts/returns";
import { ReturnInspectionForm } from "./return-inspection-form";
import { ReturnRefundProofForm } from "./return-refund-proof-form";

export function SellerReturnActions({ view }: { view: ReturnCaseView }) {
	const t = useTranslations("Returns");
	const tRoot = useTranslations();
	const action = useReturnAction();
	const actions = sellerReturnActions(view.allowedActions);
	if (!actions.length) return null;
	return (
		<section className="space-y-4 rounded-2xl border border-[#E2E8F0] bg-white p-5">
			<h2 className="font-semibold text-[#0F172A]">{t("sellerActions")}</h2>
			<div className="flex flex-wrap gap-2">
				{(["pickup", "receive"] as const)
					.filter((item) => actions.includes(item))
					.map((item) => (
						<button
							key={item}
							type="button"
							disabled={action.isPending}
							onClick={() => action.mutate({ caseId: view.id, action: item })}
							className="min-h-11 rounded-xl bg-[#1E40AF] px-4 font-medium text-sm text-white disabled:opacity-50"
						>
							{t(`action.${item}`)}
						</button>
					))}
			</div>
			{actions.includes("inspect") ? (
				<ReturnInspectionForm view={view} />
			) : null}
			{actions.includes("refund_proof") ? (
				<ReturnRefundProofForm view={view} />
			) : null}
			{action.isError ? (
				<p role="alert" className="text-red-700 text-sm">
					{resolveErrorMessage(action.error, tRoot)}
				</p>
			) : null}
		</section>
	);
}
