import type { Payload, PayloadRequest } from "payload";
import { SHOP_STRIKE_KINDS } from "../collections/ShopStrikes";
import { filedCaseGates, getDisputeSettings } from "../lib/caseSettings";
import {
	commitContextOf,
	onCommit,
	RetryTransaction,
} from "../lib/transactions";
import type { ShopStrike } from "../payload-types";
import { notifyShopStrikeAdded } from "./caseNotifications";
import { isUniqueViolation } from "./shops";

export type ShopStrikeKind = ShopStrike["kind"];

export const SHOP_STRIKE_WEIGHTS = {
	dispute_lost: 1,
	refund_overdue: 2,
	counterfeit_confirmed: 3,
	no_response: 1,
	unavailable_after_confirmation: 1,
	review_extortion: 2,
} satisfies Record<ShopStrikeKind, 1 | 2 | 3>;

export function strikeWeight(kind: ShopStrikeKind): 1 | 2 | 3 {
	return SHOP_STRIKE_WEIGHTS[kind];
}

export interface AddStrikeInput {
	shop: string;
	kind: ShopStrikeKind;
	sourceType: ShopStrike["sourceType"];
	sourceId: string;
}

export async function addStrike(
	req: PayloadRequest,
	input: AddStrikeInput,
	now = new Date(),
): Promise<ShopStrike> {
	const existing = await req.payload.find({
		collection: "shop-strikes",
		where: {
			and: [
				{ shop: { equals: input.shop } },
				{ kind: { equals: input.kind } },
				{ sourceType: { equals: input.sourceType } },
				{ sourceId: { equals: input.sourceId } },
				{ status: { equals: "active" } },
			],
		},
		limit: 1,
		depth: 0,
		overrideAccess: true,
		req,
	});
	const alreadyCreated = existing.docs[0];
	if (alreadyCreated) return alreadyCreated;

	let strike: ShopStrike;
	try {
		strike = await req.payload.create({
			collection: "shop-strikes",
			req,
			overrideAccess: true,
			data: {
				shop: input.shop,
				kind: input.kind,
				weight: strikeWeight(input.kind),
				sourceType: input.sourceType,
				sourceId: input.sourceId,
				status: "active",
				expiresAt: new Date(now.getTime() + 180 * 86_400_000).toISOString(),
			},
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw new RetryTransaction(
			"a matching active shop strike was added concurrently",
		);
	}
	const notify = () => notifyShopStrikeAdded(req, strike);
	if (!onCommit(commitContextOf(req), notify)) await notify();
	return strike;
}

export interface ShopStandingView {
	activeWeight: number;
	effectsEnabled: boolean;
	restrictions: {
		codCapHalved: boolean;
		protectedCapHalved: boolean;
		protectedUnavailable: boolean;
	};
	strikes: Array<
		Pick<
			ShopStrike,
			| "id"
			| "kind"
			| "weight"
			| "status"
			| "expiresAt"
			| "sourceType"
			| "createdAt"
		>
	>;
}

export async function shopStanding(
	payload: Payload,
	shopId: string,
	now = new Date(),
): Promise<ShopStandingView> {
	const [result, settings] = await Promise.all([
		payload.find({
			collection: "shop-strikes",
			where: { shop: { equals: shopId } },
			limit: 0,
			pagination: false,
			sort: "-createdAt",
			depth: 0,
			overrideAccess: true,
		}),
		getDisputeSettings(payload),
	]);
	const strikes = result.docs.map((strike) => ({
		id: String(strike.id),
		kind: strike.kind,
		weight: strike.weight,
		status: strike.status,
		expiresAt: strike.expiresAt,
		sourceType: strike.sourceType,
		createdAt: strike.createdAt,
	}));
	const activeWeight = result.docs.reduce((sum, strike) => {
		const unexpired = Date.parse(strike.expiresAt) > now.getTime();
		return sum + (strike.status === "active" && unexpired ? strike.weight : 0);
	}, 0);
	const effectsEnabled =
		settings.strikeEffectsEnabled && filedCaseGates(settings.gates).has("G4");
	return {
		activeWeight,
		effectsEnabled,
		restrictions: {
			codCapHalved: effectsEnabled && activeWeight >= 3,
			protectedCapHalved: effectsEnabled && activeWeight >= 3,
			protectedUnavailable: effectsEnabled && activeWeight >= 5,
		},
		strikes,
	};
}

export async function revokeStrikeRow(
	req: PayloadRequest,
	strikeId: string,
	input: { revokedBy: string; note: string },
): Promise<ShopStrike> {
	const strike = await req.payload.findByID({
		collection: "shop-strikes",
		id: strikeId,
		depth: 0,
		overrideAccess: true,
		req,
	});
	if (strike.status !== "active") return strike;
	return req.payload.update({
		collection: "shop-strikes",
		id: strikeId,
		req,
		overrideAccess: true,
		data: { status: "revoked", revokedBy: input.revokedBy, note: input.note },
	});
}

export async function expireStrikes(
	payload: Payload,
	now = new Date(),
): Promise<{ expired: string[] }> {
	const { docs } = await payload.find({
		collection: "shop-strikes",
		where: {
			and: [
				{ status: { equals: "active" } },
				{ expiresAt: { less_than_equal: now.toISOString() } },
			],
		},
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
	});
	const expired: string[] = [];
	for (const strike of docs) {
		const updated = await payload.update({
			collection: "shop-strikes",
			where: {
				and: [
					{ id: { equals: String(strike.id) } },
					{ status: { equals: "active" } },
				],
			},
			overrideAccess: true,
			data: { status: "expired" },
		});
		if (updated.docs[0]?.status === "expired") {
			expired.push(String(updated.docs[0].id));
		}
	}
	return { expired };
}

export const STRIKE_KINDS = SHOP_STRIKE_KINDS;
