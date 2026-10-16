/**
 * The delivery address rules, once: `parseDeliveryAddress` (checkout) and the
 * saved-address book (`services/addresses.ts`) both answer through
 * `deliveryAddressIssue`, so an address the book accepts is one checkout
 * accepts under the same delivery method. Pure — the clients import it too.
 */

export type AddressMethod = "seller_delivery" | "pickup" | "courier";

export type DeliveryAddressField =
	| "recipientName"
	| "phone"
	| "city"
	| "district"
	| "districtOther"
	| "landmark"
	| "instructions";

export interface AddressCityRules {
	isCity: (key: string) => boolean;
	isDistrict: (city: string, district: string) => boolean;
	phonePattern: RegExp;
}

export interface AddressGps {
	lat: number;
	lng: number;
	accuracyMeters: number | null;
}

export const otherDistrictKey = (city: string) => `${city}.other`;

export function normalizeAddressPhone(raw: string): string {
	const trimmed = raw.trim().replace(/[\s-]/g, "");
	if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
	if (trimmed.startsWith("+")) return trimmed;
	return `+${trimmed}`;
}

function numberField(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function addressGpsOf(value: unknown): AddressGps | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const lat = numberField(record, "lat");
	const lng = numberField(record, "lng");
	if (lat === null || lng === null) return null;
	return { lat, lng, accuracyMeters: numberField(record, "accuracyMeters") };
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * The first field an address fails, in the order the server reports them,
 * or null. `pickup` alone makes the landmark optional (bounded when given).
 */
export function deliveryAddressIssue(
	raw: Record<string, unknown>,
	method: AddressMethod,
	rules: AddressCityRules,
): DeliveryAddressField | null {
	const recipientName = text(raw.recipientName).trim();
	if (recipientName.length < 2 || recipientName.length > 60)
		return "recipientName";
	const phone =
		typeof raw.phone === "string" ? normalizeAddressPhone(raw.phone) : "";
	if (!rules.phonePattern.test(phone)) return "phone";
	const city = text(raw.city);
	if (!rules.isCity(city)) return "city";
	const district = text(raw.district);
	if (!district || !rules.isDistrict(city, district)) return "district";
	if (district === otherDistrictKey(city)) {
		const other = text(raw.districtOther).trim();
		if (other.length < 2 || other.length > 60) return "districtOther";
	}
	const landmark = text(raw.landmark).trim();
	if (
		(method !== "pickup" || landmark) &&
		(landmark.length < 5 || landmark.length > 200)
	)
		return "landmark";
	if (text(raw.instructions).length > 300) return "instructions";
	return null;
}

/** The normalised address of one that passed `deliveryAddressIssue`. */
export function normalizedDeliveryAddress(raw: Record<string, unknown>) {
	const city = text(raw.city);
	const district = text(raw.district);
	const landmark = text(raw.landmark).trim();
	const instructions = text(raw.instructions);
	return {
		recipientName: text(raw.recipientName).trim(),
		phone: normalizeAddressPhone(text(raw.phone)),
		city,
		district,
		districtOther:
			district === otherDistrictKey(city)
				? text(raw.districtOther).trim()
				: null,
		landmark: landmark || null,
		instructions: instructions || null,
		gps: addressGpsOf(raw.gps),
	};
}

// ─── Saved addresses ────────────────────────────────────────────────────────

export const SAVED_ADDRESS_LIMIT = 10;
export const SAVED_ADDRESS_LABEL_MAX = 30;

/** Saved addresses are for delivery: the landmark the courier needs is required. */
export const SAVED_ADDRESS_METHOD: AddressMethod = "seller_delivery";

/** "Maison", "Bureau"… optional; blank reads as no label. */
export function savedAddressLabelValid(label: unknown): boolean {
	if (label === undefined || label === null) return true;
	return (
		typeof label === "string" && label.trim().length <= SAVED_ADDRESS_LABEL_MAX
	);
}

export interface SavedAddress {
	id: string;
	label: string | null;
	recipientName: string;
	phone: string;
	city: string;
	district: string;
	districtOther: string | null;
	landmark: string | null;
	instructions: string | null;
	gps: AddressGps | null;
	isDefault: boolean;
	updatedAt: string;
}

export interface SavedAddressListResponse {
	addresses: SavedAddress[];
	limit: number;
}

/** The address a saved one sends to `/api/checkout/*` (the AddressInput shape). */
export function savedAddressInput(address: SavedAddress) {
	return {
		recipientName: address.recipientName,
		phone: address.phone,
		city: address.city,
		district: address.district,
		...(address.districtOther ? { districtOther: address.districtOther } : {}),
		...(address.landmark ? { landmark: address.landmark } : {}),
		...(address.gps
			? {
					gps: {
						lat: address.gps.lat,
						lng: address.gps.lng,
						...(address.gps.accuracyMeters !== null
							? { accuracyMeters: address.gps.accuracyMeters }
							: {}),
					},
				}
			: {}),
		...(address.instructions ? { instructions: address.instructions } : {}),
	};
}

/** The default first, then the most recently changed. */
export function sortSavedAddresses<
	T extends Pick<SavedAddress, "isDefault" | "updatedAt">,
>(addresses: readonly T[]): T[] {
	return [...addresses].sort(
		(a, b) =>
			Number(b.isDefault) - Number(a.isDefault) ||
			b.updatedAt.localeCompare(a.updatedAt),
	);
}

/** The saved address checkout preselects: the default, else the newest. */
export function preselectedAddress<
	T extends Pick<SavedAddress, "isDefault" | "updatedAt">,
>(addresses: readonly T[]): T | null {
	return sortSavedAddresses(addresses)[0] ?? null;
}

// ─── Place suggestions ──────────────────────────────────────────────────────

const fold = (value: string) =>
	value
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

export interface SuggestionCity {
	key: string;
	label: string;
	districts: ReadonlyArray<{ key: string; label: string }>;
}

/**
 * A geocoder suggestion (a Photon `Place`) as a patch on the address form:
 * the city it names when served, the district it matches by name, else the
 * city's `.other` with the name as free text. Null when the city is not one
 * of `cities`.
 */
export function addressPatchFromPlace(
	place: { name: string; district?: string },
	cities: readonly SuggestionCity[],
): { city: string; district: string; districtOther: string } | null {
	const cityName = fold(place.name);
	const city = cities.find(
		(c) => fold(c.key) === cityName || fold(c.label) === cityName,
	);
	if (!city) return null;
	if (!place.district)
		return { city: city.key, district: "", districtOther: "" };
	const wanted = fold(place.district);
	const match = city.districts.find((d) => fold(d.label) === wanted);
	if (match) return { city: city.key, district: match.key, districtOther: "" };
	return {
		city: city.key,
		district: otherDistrictKey(city.key),
		districtOther: place.district.trim().slice(0, 60),
	};
}
