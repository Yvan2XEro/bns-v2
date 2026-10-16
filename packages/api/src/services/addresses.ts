import type { Payload, PayloadRequest, Where } from "payload";
import {
	addressGpsOf,
	deliveryAddressIssue,
	normalizedDeliveryAddress,
	SAVED_ADDRESS_LIMIT,
	SAVED_ADDRESS_METHOD,
	type SavedAddress,
	type SavedAddressListResponse,
	savedAddressLabelValid,
	sortSavedAddresses,
} from "../contracts/deliveryAddress";
import { marketAddressRules } from "../lib/addressRules";
import { ERROR_CODES } from "../lib/errors";
import { launchCitySeedRows } from "../lib/launchCities";
import { getMarketCities, type MarketCity } from "../lib/marketCities";
import { getMarkets } from "../lib/markets";
import { ServiceError } from "../lib/serviceError";
import { withTransaction } from "../lib/transactions";
import type { ServiceUser } from "./shops";

type Row = Record<string, unknown>;

const ADDRESS_FIELDS = [
	"recipientName",
	"phone",
	"city",
	"district",
	"districtOther",
	"landmark",
	"instructions",
	"gps",
] as const;

function invalid(field: string): ServiceError {
	return new ServiceError(ERROR_CODES.checkoutAddressInvalid, 400, undefined, {
		field,
	});
}

const notFound = () => new ServiceError(ERROR_CODES.addressNotFound, 404);

/** Every live market's active cities; the seed rows when none are configured, as checkout. */
async function addressCities(payload: Payload): Promise<MarketCity[]> {
	const markets = (await getMarkets(payload)).filter(
		(market) => market.status === "live",
	);
	const cities = (
		await Promise.all(markets.map((market) => getMarketCities(payload, market)))
	).flat();
	return cities.length > 0 ? cities : launchCitySeedRows("seed");
}

const text = (value: unknown): string | null =>
	typeof value === "string" && value ? value : null;

export function toSavedAddress(row: Row): SavedAddress {
	return {
		id: String(row.id),
		label: text(row.label),
		recipientName: String(row.recipientName ?? ""),
		phone: String(row.phone ?? ""),
		city: String(row.city ?? ""),
		district: String(row.district ?? ""),
		districtOther: text(row.districtOther),
		landmark: text(row.landmark),
		instructions: text(row.instructions),
		gps: addressGpsOf(row.gps),
		isDefault: row.isDefault === true,
		updatedAt: String(row.updatedAt ?? row.createdAt ?? ""),
	};
}

/** Validated storable fields, or a `checkout.addressInvalid` naming the field. */
async function storable(payload: Payload, raw: Row) {
	if (!savedAddressLabelValid(raw.label)) throw invalid("label");
	const issue = deliveryAddressIssue(
		raw,
		SAVED_ADDRESS_METHOD,
		marketAddressRules(await addressCities(payload)),
	);
	if (issue) throw invalid(issue);
	const address = normalizedDeliveryAddress(raw);
	const label = typeof raw.label === "string" ? raw.label.trim() : "";
	return {
		...address,
		label: label || null,
		gps: address.gps ?? { lat: null, lng: null, accuracyMeters: null },
	};
}

const ownedBy = (userId: string, extra?: Where): Where => ({
	and: [{ user: { equals: userId } }, ...(extra ? [extra] : [])],
});

async function ownRows(
	payload: Payload,
	userId: string,
	req?: PayloadRequest,
): Promise<Row[]> {
	const { docs } = await payload.find({
		collection: "addresses",
		where: ownedBy(userId),
		limit: 0,
		pagination: false,
		depth: 0,
		overrideAccess: true,
		...(req ? { req } : {}),
	});
	return docs as unknown as Row[];
}

async function ownRow(
	payload: Payload,
	userId: string,
	id: string,
	req?: PayloadRequest,
): Promise<Row> {
	const rows = await ownRows(payload, userId, req);
	const row = rows.find((candidate) => String(candidate.id) === id);
	if (!row) throw notFound();
	return row;
}

/** Leaves exactly one default among the user's rows: `preferredId` if given, else the current one, else the newest. */
async function settleDefault(
	req: PayloadRequest,
	userId: string,
	preferredId?: string,
): Promise<void> {
	const rows = sortSavedAddresses(
		(await ownRows(req.payload, userId, req)).map(toSavedAddress),
	);
	const target =
		rows.find((row) => row.id === preferredId) ??
		rows.find((row) => row.isDefault) ??
		rows[0];
	for (const row of rows) {
		const wanted = row.id === target?.id;
		if (row.isDefault === wanted) continue;
		await req.payload.update({
			collection: "addresses",
			id: row.id,
			data: { isDefault: wanted },
			depth: 0,
			overrideAccess: true,
			req,
		});
	}
}

export async function listAddresses(
	payload: Payload,
	user: ServiceUser,
): Promise<SavedAddressListResponse> {
	const rows = await ownRows(payload, user.id);
	return {
		addresses: sortSavedAddresses(rows.map(toSavedAddress)),
		limit: SAVED_ADDRESS_LIMIT,
	};
}

async function findOwn(payload: Payload, userId: string, id: string) {
	return toSavedAddress(await ownRow(payload, userId, id));
}

export async function createAddress(
	payload: Payload,
	user: ServiceUser,
	input: Row,
): Promise<SavedAddress> {
	const data = await storable(payload, input);
	const id = await withTransaction(
		payload,
		async (req) => {
			const count = await req.payload.count({
				collection: "addresses",
				where: ownedBy(user.id),
				overrideAccess: true,
				req,
			});
			if (count.totalDocs >= SAVED_ADDRESS_LIMIT)
				throw new ServiceError(ERROR_CODES.addressLimitReached, 409);
			const created = await req.payload.create({
				collection: "addresses",
				data: { ...data, user: user.id, isDefault: false },
				depth: 0,
				overrideAccess: true,
				req,
			});
			const createdId = String(created.id);
			await settleDefault(
				req,
				user.id,
				input.isDefault === true || count.totalDocs === 0
					? createdId
					: undefined,
			);
			return createdId;
		},
		{ user },
	);
	return findOwn(payload, user.id, id);
}

export async function updateAddress(
	payload: Payload,
	user: ServiceUser,
	id: string,
	input: Row,
): Promise<SavedAddress> {
	const current = await ownRow(payload, user.id, id);
	const merged: Row = { ...current, label: current.label ?? null };
	for (const key of [...ADDRESS_FIELDS, "label"] as const) {
		if (key in input) merged[key] = input[key];
	}
	const data = await storable(payload, merged);
	await withTransaction(
		payload,
		async (req) => {
			await req.payload.update({
				collection: "addresses",
				id,
				data,
				depth: 0,
				overrideAccess: true,
				req,
			});
			// `isDefault: false` alone is ignored: the book always keeps one.
			await settleDefault(
				req,
				user.id,
				input.isDefault === true ? id : undefined,
			);
		},
		{ user },
	);
	return findOwn(payload, user.id, id);
}

export async function deleteAddress(
	payload: Payload,
	user: ServiceUser,
	id: string,
): Promise<void> {
	await ownRow(payload, user.id, id);
	await withTransaction(
		payload,
		async (req) => {
			await req.payload.delete({
				collection: "addresses",
				id,
				overrideAccess: true,
				req,
			});
			await settleDefault(req, user.id);
		},
		{ user },
	);
}

const sameText = (a: unknown, b: unknown) =>
	String(a ?? "")
		.trim()
		.toLowerCase() ===
	String(b ?? "")
		.trim()
		.toLowerCase();

/**
 * « Enregistrer cette adresse » at placement: never fails the order. An
 * address already in the book is returned as is; a full book, or an address
 * the book refuses (a pickup order without a landmark), saves nothing.
 */
export async function saveCheckoutAddress(
	payload: Payload,
	user: ServiceUser,
	address: Row,
	label: unknown,
): Promise<SavedAddress | null> {
	try {
		const rows = (await ownRows(payload, user.id)).map(toSavedAddress);
		const data = await storable(payload, { ...address, label });
		const existing = rows.find(
			(row) =>
				row.city === data.city &&
				row.district === data.district &&
				row.phone === data.phone &&
				sameText(row.recipientName, data.recipientName) &&
				sameText(row.districtOther, data.districtOther) &&
				sameText(row.landmark, data.landmark),
		);
		if (existing) return existing;
		if (rows.length >= SAVED_ADDRESS_LIMIT) return null;
		return await createAddress(payload, user, { ...address, label });
	} catch (error) {
		if (error instanceof ServiceError) return null;
		console.error("[addresses:save-checkout]", error);
		return null;
	}
}
