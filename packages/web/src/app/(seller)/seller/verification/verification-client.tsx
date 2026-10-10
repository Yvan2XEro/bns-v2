"use client";

import { AlertTriangle, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	LevelAction,
	LevelRequestCard,
} from "~/components/verification/level-action";
import { LevelLadder } from "~/components/verification/level-ladder";
import { VerificationStatusCard } from "~/components/verification/verification-status-card";
import { useMyShop } from "~/hooks/use-my-shop";
import { useShopVerification } from "~/hooks/use-verification";
import { resolveErrorMessage } from "~/lib/apiError";

function VerificationSkeleton() {
	return (
		<div className="space-y-4">
			{[0, 1, 2].map((i) => (
				<div key={i} className="h-24 animate-pulse rounded-2xl bg-[#F1F5F9]" />
			))}
		</div>
	);
}

function VerificationError({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	const t = useTranslations("Verification");
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
				{t("error.retry")}
			</button>
		</div>
	);
}

/**
 * The seller's verification hub. `view.enabled` gates only the actions that
 * would *start* something — the badge, the ladder and any in-flight request
 * render exactly the same whether the feature is on or off, so a seller
 * mid-review never sees an empty page just because the flag was paused.
 */
export function VerificationClient({ shopId }: { shopId: string }) {
	const t = useTranslations("Verification");
	const tRoot = useTranslations();
	const query = useShopVerification(shopId);
	const mine = useMyShop();
	const isOwner = mine.data?.role === "owner";

	if (query.isPending) return <VerificationSkeleton />;

	// An error is not an empty hub: P1 shipped a hook that collapsed a failure
	// into a falsy value and the screen said "nothing here".
	if (query.isError) {
		return (
			<VerificationError
				message={resolveErrorMessage(query.error, tRoot)}
				onRetry={() => void query.refetch()}
			/>
		);
	}

	const view = query.data;

	return (
		<div className="space-y-5">
			<h1 className="font-bold text-2xl text-[#0F172A]">{t("hub.title")}</h1>

			{!view.enabled && (
				<output className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
					<AlertTriangle
						aria-hidden="true"
						className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
					/>
					<p className="text-amber-900 text-sm">{t("hub.disabledBanner")}</p>
				</output>
			)}

			<VerificationStatusCard view={view} />
			<LevelLadder capabilities={view.capabilities} />

			{([2, 3] as const).map((level) => (
				<LevelRequestCard key={level} view={view} level={level} />
			))}

			{([2, 3] as const).map((level) => (
				<LevelAction key={level} view={view} level={level} isOwner={isOwner} />
			))}
		</div>
	);
}
