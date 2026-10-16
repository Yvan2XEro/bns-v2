import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	buildSetupSteps,
	checklistMode,
	launchActions,
	onboardingStorageKeys,
	pickSellerTip,
	type ShopOnboardingFacts,
	sellerHomeStage,
} from "../../../api/src/contracts/sellerOnboarding";
import { api } from "../lib/api";

export const shopOnboardingKey = (shopId: string) =>
	["shops", shopId, "onboarding"] as const;

/** `GET /api/shops/{id}/onboarding`: the facts the seller home's stage is read from. */
export function useShopOnboarding(shopId: string | undefined) {
	return useQuery({
		queryKey: shopOnboardingKey(shopId ?? ""),
		queryFn: () =>
			api.get<ShopOnboardingFacts>(`/api/shops/${shopId}/onboarding`),
		enabled: Boolean(shopId),
	});
}

/**
 * Per-device dismissals: the finished checklist and the tips already read.
 * A lost value only brings a card back, never hides a step still needed —
 * the contract refuses to hide an unfinished checklist.
 */
export function useSellerHomeDismissals(shopId: string | undefined) {
	const [checklist, setChecklist] = useState(false);
	const [tips, setTips] = useState<string[]>([]);

	useEffect(() => {
		if (!shopId) return;
		const keys = onboardingStorageKeys(shopId);
		let alive = true;
		AsyncStorage.multiGet([keys.checklist, keys.tips])
			.then(([[, checklistValue], [, tipsValue]]) => {
				if (!alive) return;
				setChecklist(checklistValue === "1");
				try {
					const parsed: unknown = tipsValue ? JSON.parse(tipsValue) : [];
					setTips(
						Array.isArray(parsed)
							? parsed.filter((k): k is string => typeof k === "string")
							: [],
					);
				} catch {
					setTips([]);
				}
			})
			.catch(() => {
				// A preference: losing it only brings a card back.
			});
		return () => {
			alive = false;
		};
	}, [shopId]);

	const dismissChecklist = useCallback(() => {
		if (!shopId) return;
		setChecklist(true);
		AsyncStorage.setItem(onboardingStorageKeys(shopId).checklist, "1").catch(
			() => {
				// A preference: losing it only brings a card back.
			},
		);
	}, [shopId]);

	const dismissTip = useCallback(
		(key: string) => {
			if (!shopId) return;
			setTips((current) => {
				const next = current.includes(key) ? current : [...current, key];
				AsyncStorage.setItem(
					onboardingStorageKeys(shopId).tips,
					JSON.stringify(next),
				).catch(() => {
					// A preference: losing it only brings a card back.
				});
				return next;
			});
		},
		[shopId],
	);

	return { checklist, tips, dismissChecklist, dismissTip };
}

/**
 * Everything the seller home derives from the facts, through the shared
 * contract. Refetched whenever the screen regains focus, so a step completed
 * elsewhere is ticked on the way back.
 */
export function useSellerHome(shopId: string | undefined) {
	const query = useShopOnboarding(shopId);
	const dismissals = useSellerHomeDismissals(shopId);
	const { refetch } = query;
	useFocusEffect(
		useCallback(() => {
			if (shopId) void refetch();
		}, [shopId, refetch]),
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
			mode: checklistMode(stage, steps, dismissals.checklist),
			actions: stage === "launch" ? launchActions(facts) : [],
			tip: pickSellerTip(stage, facts, dismissals.tips),
		};
	}, [facts, dismissals.checklist, dismissals.tips]);

	return { query, model, ...dismissals };
}
