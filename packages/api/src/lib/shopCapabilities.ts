/**
 * The single reader of what a shop's level unlocks. Every later phase calls
 * this and never compares `shop.level` itself — P4 adds its COD cap values
 * here keyed by `effectiveLevel`, P5 its payout rules, P3 its member cap.
 *
 * Expiry is a comparison at read time, not a flag a job sets, so a job that
 * has not run yet can never over-grant. Same reasoning as P1's
 * `suspensionSummary`.
 */
export interface ShopCapabilities {
	effectiveLevel: 0 | 1 | 2 | 3;
	badge: "phone" | "identity" | "business" | null;
	codOrders: boolean;
	protectedPayment: boolean;
	teamMembers: boolean;
	maxMembers: number;
	supplier: boolean;
	fasterPayouts: boolean;
	legalInfoVerified: boolean;
}

export interface CapabilityShop {
	status: string;
	level?: number | null;
	levelExpiresAt?: string | Date | null;
}

/** What a seller is told they gain by reaching the next level. */
export const CAPABILITY_UNLOCKS: Record<
	2 | 3,
	Array<keyof ShopCapabilities>
> = {
	2: ["protectedPayment", "teamMembers"],
	3: ["supplier", "fasterPayouts", "legalInfoVerified"],
};

const EMPTY: ShopCapabilities = {
	effectiveLevel: 0,
	badge: null,
	codOrders: false,
	protectedPayment: false,
	teamMembers: false,
	maxMembers: 1,
	supplier: false,
	fasterPayouts: false,
	legalInfoVerified: false,
};

const BADGES = { 1: "phone", 2: "identity", 3: "business" } as const;

function expired(value: string | Date | null | undefined, now: Date): boolean {
	if (!value) return false;
	const at = value instanceof Date ? value.getTime() : Date.parse(value);
	return Number.isFinite(at) && at <= now.getTime();
}

export function shopCapabilities(
	shop: CapabilityShop,
	now = new Date(),
): ShopCapabilities {
	if (shop.status !== "active") return { ...EMPTY };

	const stored = Number(shop.level);
	let level: 1 | 2 | 3 = stored === 3 ? 3 : stored === 2 ? 2 : 1;
	if (level >= 2 && expired(shop.levelExpiresAt, now)) level = 1;

	return {
		effectiveLevel: level,
		badge: BADGES[level],
		codOrders: true,
		protectedPayment: level >= 2,
		teamMembers: level >= 2,
		maxMembers: level === 3 ? 20 : level === 2 ? 5 : 1,
		supplier: level >= 3,
		fasterPayouts: level >= 3,
		legalInfoVerified: level >= 3,
	};
}
