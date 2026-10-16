"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shopOnboardingKey } from "~/lib/query-keys";
import { apiGet } from "~/lib/shop-api";
import {
	buildSetupSteps,
	checklistMode,
	launchActions,
	onboardingStorageKeys,
	pickSellerTip,
	type ShopOnboardingFacts,
	sellerHomeStage,
} from "../../../api/src/contracts/sellerOnboarding";

function readStorage(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string) {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// Private mode or blocked storage: the card simply comes back next time.
	}
}

/**
 * The seller home's model through the shared contract. Refetched when the tab
 * regains focus, so a step finished in another tab is ticked on return.
 */
export function useSellerHome(shopId: string) {
	const query = useQuery({
		queryKey: shopOnboardingKey(shopId),
		queryFn: () =>
			apiGet<ShopOnboardingFacts>(
				`/api/shops/${encodeURIComponent(shopId)}/onboarding`,
			),
		refetchOnWindowFocus: true,
	});
	const keys = useMemo(() => onboardingStorageKeys(shopId), [shopId]);
	const [checklistDismissed, setChecklistDismissed] = useState(false);
	const [tipsDismissed, setTipsDismissed] = useState<string[]>([]);

	useEffect(() => {
		setChecklistDismissed(readStorage(keys.checklist) === "1");
		try {
			const parsed: unknown = JSON.parse(readStorage(keys.tips) ?? "[]");
			setTipsDismissed(
				Array.isArray(parsed)
					? parsed.filter((k): k is string => typeof k === "string")
					: [],
			);
		} catch {
			setTipsDismissed([]);
		}
	}, [keys]);

	const dismissChecklist = useCallback(() => {
		setChecklistDismissed(true);
		writeStorage(keys.checklist, "1");
	}, [keys]);

	const dismissTip = useCallback(
		(tip: string) => {
			setTipsDismissed((current) => {
				const next = current.includes(tip) ? current : [...current, tip];
				writeStorage(keys.tips, JSON.stringify(next));
				return next;
			});
		},
		[keys],
	);

	const facts = query.data;
	const model = useMemo(() => {
		if (!facts) return null;
		const steps = buildSetupSteps(facts);
		const stage = sellerHomeStage(facts, steps);
		return {
			facts,
			steps,
			stage,
			mode: checklistMode(stage, steps, checklistDismissed),
			actions: stage === "launch" ? launchActions(facts) : [],
			tip: pickSellerTip(stage, facts, tipsDismissed),
		};
	}, [facts, checklistDismissed, tipsDismissed]);

	return { query, model, dismissChecklist, dismissTip };
}
