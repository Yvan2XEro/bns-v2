import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useMyShop } from "@/src/hooks/useShops";
import { verificationKeys } from "@/src/hooks/useVerification";
import { api } from "@/src/lib/api";
import { POLL_INTERVAL_MS, shouldKeepPolling } from "@/src/lib/verification";
import type { ShopVerificationResponse } from "@/src/types/api";

/**
 * Below three attempts the vendor's decline leaves `status: "draft"` (so the
 * owner can retry) — the same status a fresh, still-pending session sits
 * in. Only `kyc.status` and `kyc.attempts` tell the two apart, so this
 * outcome is checked before `shouldKeepPolling`'s generic status bucket,
 * never instead of it.
 */
const MAX_KYC_ATTEMPTS = 3;

export type ReturnOutcome =
	| { kind: "polling" }
	| { kind: "declinedRetry" }
	| { kind: "timeout" }
	| { kind: "answer"; status: string };

function resolveOutcome(
	view: ShopVerificationResponse | undefined,
	elapsedMs: number,
): ReturnOutcome {
	const request = view?.requests.level2;
	if (!request) return { kind: "polling" };

	if (
		request.status === "draft" &&
		request.kyc?.status === "declined" &&
		(request.kyc.attempts ?? 0) < MAX_KYC_ATTEMPTS
	) {
		return { kind: "declinedRetry" };
	}

	if (view && shouldKeepPolling(view, 2, elapsedMs)) {
		return { kind: "polling" };
	}

	const stillOpen =
		request.status === "draft" || request.status === "submitted";
	if (stillOpen) return { kind: "timeout" };

	return { kind: "answer", status: request.status };
}

/**
 * Polls the shop's own verification state — never the deep link's query
 * params, which are only ever handed to the vendor's redirect page and are
 * never trusted here — until the server has an answer, a decline with
 * attempts left, or the poll times out.
 */
export function useVerificationReturn() {
	const { request: requestId } = useLocalSearchParams<{ request?: string }>();
	const myShop = useMyShop();
	const shop = myShop.data?.shop;
	const startedAt = useRef(Date.now());

	const query = useQuery({
		queryKey: verificationKeys.shop(shop?.id ?? ""),
		queryFn: () =>
			api.get<ShopVerificationResponse>(`/api/shops/${shop?.id}/verification`),
		enabled: Boolean(shop?.id),
		refetchInterval: (q) => {
			const data = q.state.data;
			if (!data) return false;
			return shouldKeepPolling(data, 2, Date.now() - startedAt.current)
				? POLL_INTERVAL_MS
				: false;
		},
	});

	// The auth session can close without ever firing the redirect — the user
	// taps Done, or the system browser is dismissed. Coming back to the
	// foreground is the only signal we get in that case, so it forces one
	// refetch outside the query's own interval.
	const refetchRef = useRef(query.refetch);
	refetchRef.current = query.refetch;
	useEffect(() => {
		const subscription = AppState.addEventListener("change", (nextState) => {
			if (nextState === "active") void refetchRef.current();
		});
		return () => subscription.remove();
	}, []);

	const outcome = resolveOutcome(query.data, Date.now() - startedAt.current);

	const onRefresh = () => {
		startedAt.current = Date.now();
		void query.refetch();
	};

	return { requestId, query, outcome, onRefresh };
}
