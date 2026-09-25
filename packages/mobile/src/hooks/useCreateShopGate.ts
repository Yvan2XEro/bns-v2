import { useQuery } from "@tanstack/react-query";
import type { PhoneStatus } from "@/src/components/shop/PhoneGate";
import { phoneStatusKey } from "@/src/components/shop/PhoneGate";
import { api } from "@/src/lib/api";
import { useMyShop, useShopsEnabled } from "./useShops";

export type CreateShopGate =
	| { phase: "loading" }
	/** Signed in and already owns a shop: full access, whatever the flag says. */
	| { phase: "owner" }
	/** No shop yet and the flag is off: creation stays unreachable, deep link included. */
	| { phase: "unavailable" }
	| { phase: "phone-loading" }
	| { phase: "phone-gate"; onVerified: () => void }
	| { phase: "ready"; phone: PhoneStatus };

/**
 * Resolves which screen this route shows, in the order that matters: whether
 * the caller already owns a shop is decided before the flag is even
 * consulted, so an owner is never told shops are unavailable.
 */
export function useCreateShopGate(): CreateShopGate {
	const shopsEnabled = useShopsEnabled();
	const mine = useMyShop();
	const hasShop = Boolean(mine.data?.shop);

	const phone = useQuery({
		queryKey: phoneStatusKey,
		queryFn: () => api.get<PhoneStatus>("/api/account/phone/status"),
		enabled: shopsEnabled && !mine.isLoading && !hasShop,
	});
	if (mine.isLoading) return { phase: "loading" };
	if (hasShop) return { phase: "owner" };
	if (!shopsEnabled) return { phase: "unavailable" };
	if (phone.isLoading) return { phase: "phone-loading" };
	if (!phone.data?.isPhoneVerified) {
		return { phase: "phone-gate", onVerified: () => phone.refetch() };
	}
	return { phase: "ready", phone: phone.data };
}
