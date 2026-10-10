"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { ReturnOutcomeView } from "~/components/verification/return-outcome";
import { resolveErrorMessage } from "~/lib/apiError";
import { verificationKey } from "~/lib/query-keys";
import { apiGet } from "~/lib/shop-api";
import {
	POLL_INTERVAL_MS,
	resolveReturnOutcome,
	type ShopVerificationResponse,
	shouldKeepPolling,
} from "~/lib/verification";

/**
 * Reads only the request id (and the mobile hand-off marker) from the URL.
 * Everything else — whether the request was approved, declined, anything —
 * comes from polling the server, never from a query parameter the vendor's
 * redirect could be made to carry: a `status=approved` in the URL would be a
 * forgery waiting to happen.
 */
export function ReturnClient({
	shopId,
	requestId,
	app,
}: {
	shopId: string;
	requestId: string | null;
	app: boolean;
}) {
	const t = useTranslations("Verification.return");
	const tRoot = useTranslations();
	const router = useRouter();
	const startedAt = useRef(Date.now());

	// A mobile session opened this page in a system browser. Hand control back
	// to the app first; the app's own return screen then polls.
	useEffect(() => {
		if (app && requestId) {
			window.location.replace(
				`buynsellem://seller/verification/return?request=${requestId}`,
			);
		}
	}, [app, requestId]);

	const query = useQuery({
		queryKey: verificationKey(shopId),
		queryFn: () =>
			apiGet<ShopVerificationResponse>(`/api/shops/${shopId}/verification`),
		enabled: Boolean(requestId) && !app,
		refetchInterval: (q) =>
			q.state.data &&
			shouldKeepPolling(q.state.data, 2, Date.now() - startedAt.current)
				? POLL_INTERVAL_MS
				: false,
	});

	const onRetry = () => router.replace("/seller/verification/identity");
	const onRefresh = () => {
		startedAt.current = Date.now();
		void query.refetch();
	};

	if (!requestId) {
		return (
			<div className="mx-auto max-w-md space-y-3 py-10 text-center">
				<h1 className="font-bold text-[#0F172A] text-lg">
					{t("missing.title")}
				</h1>
				<p className="text-[#64748B] text-sm">{t("missing.body")}</p>
				<Button asChild variant="outline">
					<Link href="/seller/verification">{t("backToHub")}</Link>
				</Button>
			</div>
		);
	}

	// Handing off to the app: nothing to render on this tab.
	if (app) return null;

	if (query.isError) {
		return (
			<div className="mx-auto max-w-md space-y-3 py-10 text-center">
				<p role="alert" className="text-red-600 text-sm">
					{resolveErrorMessage(query.error, tRoot)}
				</p>
				<Button variant="outline" onClick={onRefresh}>
					{tRoot("Verification.retry")}
				</Button>
			</div>
		);
	}

	const outcome = resolveReturnOutcome(
		query.data,
		Date.now() - startedAt.current,
	);

	return (
		<div className="mx-auto max-w-md space-y-6 py-10">
			<ReturnOutcomeView
				outcome={outcome}
				onRetry={onRetry}
				onRefresh={onRefresh}
			/>
			{outcome.kind !== "polling" && (
				<div className="text-center">
					<Button asChild variant="outline">
						<Link href="/seller/verification">{t("backToHub")}</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
