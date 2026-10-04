import type { PayloadRequest } from "payload";
import { ERROR_CODES } from "./errors";
import { ServiceError } from "./serviceError";

export type ResaleAdjustSource = "dispute" | "cod_refusal";

export interface ResaleAdjustMeta {
	source: ResaleAdjustSource;
	disputeId?: string;
}

export interface ResaleParties {
	supplierShopId: string;
	resellerShopId: string;
	purchaseOrder: string;
}

export interface ResaleAdjuster {
	adjustResellerCommission(
		req: PayloadRequest,
		purchaseOrder: string,
		delta: number,
		meta: ResaleAdjustMeta,
	): Promise<void>;
}

export interface AdjustCall {
	purchaseOrder: string;
	delta: number;
	meta: ResaleAdjustMeta;
}

export class FakeResaleAdjuster implements ResaleAdjuster {
	private calls: AdjustCall[] = [];

	async adjustResellerCommission(
		_req: PayloadRequest,
		purchaseOrder: string,
		delta: number,
		meta: ResaleAdjustMeta,
	): Promise<void> {
		this.calls.push({ purchaseOrder, delta, meta });
	}

	journal(): AdjustCall[] {
		return [...this.calls];
	}

	clear(): void {
		this.calls = [];
	}
}

let adjuster: ResaleAdjuster | undefined;

export function registerResaleAdjuster(a: ResaleAdjuster): () => void {
	adjuster = a;
	return () => {
		if (adjuster === a) adjuster = undefined;
	};
}

export function getResaleAdjuster(): ResaleAdjuster {
	if (adjuster) return adjuster;
	throw new ServiceError(
		ERROR_CODES.badRequest,
		500,
		"resale adjuster unregistered — P8 not shipped",
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

function relationshipId(value: unknown): string | null {
	if (typeof value === "string" && value.length > 0) return value;
	const id = record(value)?.id;
	return typeof id === "string" && id.length > 0 ? id : null;
}

export function resaleParties(value: unknown): ResaleParties | null {
	const order = record(value);
	const snapshot = record(order?.resale);
	const supplier = relationshipId(
		snapshot?.supplierShopId ?? order?.supplierShop,
	);
	const reseller = relationshipId(
		snapshot?.resellerShopId ?? order?.resellerShop,
	);
	const po = relationshipId(snapshot?.purchaseOrder ?? order?.purchaseOrder);
	if (supplier && reseller && po) {
		return {
			supplierShopId: supplier,
			resellerShopId: reseller,
			purchaseOrder: po,
		};
	}
	return null;
}

function normalizePhone(phone: string | null | undefined): string {
	if (!phone) return "";
	return phone.replace(/\s+/g, "");
}

export function collusionMatch(
	buyerPhone: string | null | undefined,
	memberPhones: string[],
): boolean {
	const normalizedBuyer = normalizePhone(buyerPhone);
	if (!normalizedBuyer) return false;
	for (const p of memberPhones) {
		if (normalizePhone(p) === normalizedBuyer) return true;
	}
	return false;
}
