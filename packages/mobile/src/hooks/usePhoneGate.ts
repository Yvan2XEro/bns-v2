import { router } from "expo-router";
import { useCallback } from "react";
import { useAuth } from "@/src/lib/auth";
import {
	missingProof,
	type TrustAction,
} from "../../../api/src/contracts/accountTrust";

/**
 * Asks for a verified phone before an action that needs one
 * (contracts/accountTrust.ts), instead of after the server refuses it.
 * `requirePhone(action)` is true when the action may go ahead; otherwise it
 * opens the verification screen and the person taps again once verified.
 */
export function usePhoneGate() {
	const { user } = useAuth();
	const requirePhone = useCallback(
		(action: TrustAction): boolean => {
			if (missingProof(user, action) !== "phone") return true;
			router.push({ pathname: "/verify-phone", params: { action } });
			return false;
		},
		[user],
	);
	return { requirePhone };
}
