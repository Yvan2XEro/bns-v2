import {
	displayPriceUnit,
	kindOf,
	type PriceUnit,
} from "../../../api/src/contracts/listingKinds";

/** What the ad page knows, already resolved. */
export interface StructuredDataInput {
	kind: string | null | undefined;
	priceUnit: string | null | undefined;
	title: string;
	description: string | null | undefined;
	url: string;
	images: string[];
	price: number | null;
	currency: string | null;
	location: string | null | undefined;
	createdAt: string | null | undefined;
	expiresAt: string | null | undefined;
	/** Visible to buyers, not expired, not sold out. */
	available: boolean;
	attributes: Record<string, unknown> | null | undefined;
	categoryName: string | null;
	/** The shop, else the person who posted. */
	seller:
		| { type: "Organization"; name: string; url: string }
		| { type: "Person"; name: string }
		| null;
}

/** UN/CEFACT codes schema.org expects in `unitCode`. A night is billed as a day. */
const UNIT_CODES: Record<Exclude<PriceUnit, "total">, string> = {
	month: "MON",
	week: "WEE",
	day: "DAY",
	night: "DAY",
	hour: "HUR",
};

/** `QuantitativeValue.unitText` for a salary. */
const SALARY_UNITS: Partial<Record<PriceUnit, string>> = {
	month: "MONTH",
	week: "WEEK",
	day: "DAY",
	hour: "HOUR",
};

/** The seeded `contract-type` values, in Google for Jobs' words. */
const EMPLOYMENT_TYPES: Record<string, string> = {
	"full-time": "FULL_TIME",
	"part-time": "PART_TIME",
	freelance: "CONTRACTOR",
	internship: "INTERN",
	temporary: "TEMPORARY",
};

function sellerNode(seller: StructuredDataInput["seller"]) {
	if (!seller) return {};
	return seller.type === "Organization"
		? { "@type": "Organization", name: seller.name, url: seller.url }
		: { "@type": "Person", name: seller.name };
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The schema.org description of an ad: a `JobPosting` for a job (what Google
 * for Jobs reads), a `Service`, an `Offer` of an `Accommodation` for a
 * rental, and a `Product` only for goods. Search engines must not list a job
 * offer as a product for sale.
 */
export function listingStructuredData(
	input: StructuredDataInput,
): Record<string, unknown> {
	const kind = kindOf(input.kind);
	const unit = displayPriceUnit(kind, input.priceUnit);
	const hasPrice = input.price !== null;
	const availability = input.available
		? "https://schema.org/InStock"
		: "https://schema.org/OutOfStock";
	const base = {
		"@context": "https://schema.org",
		name: input.title,
		description: input.description ?? undefined,
		url: input.url,
	};

	if (kind === "job") {
		const company = text(input.attributes?.company);
		const contract = text(input.attributes?.["contract-type"])?.toLowerCase();
		const salaryUnit = unit ? SALARY_UNITS[unit] : undefined;
		return {
			"@context": base["@context"],
			"@type": "JobPosting",
			title: text(input.attributes?.["job-title"]) ?? input.title,
			description: input.description ?? input.title,
			url: input.url,
			...(input.createdAt && { datePosted: input.createdAt }),
			...(input.expiresAt && { validThrough: input.expiresAt }),
			...(contract &&
				EMPLOYMENT_TYPES[contract] && {
					employmentType: EMPLOYMENT_TYPES[contract],
				}),
			hiringOrganization: company
				? { "@type": "Organization", name: company }
				: sellerNode(input.seller),
			...(input.location && {
				jobLocation: {
					"@type": "Place",
					address: {
						"@type": "PostalAddress",
						addressLocality: input.location,
					},
				},
			}),
			...(hasPrice &&
				input.currency && {
					baseSalary: {
						"@type": "MonetaryAmount",
						currency: input.currency,
						value: {
							"@type": "QuantitativeValue",
							value: input.price,
							...(salaryUnit && { unitText: salaryUnit }),
						},
					},
				}),
		};
	}

	const offer = hasPrice
		? {
				"@type": "Offer",
				price: input.price,
				...(input.currency && { priceCurrency: input.currency }),
				...(unit &&
					input.currency && {
						priceSpecification: {
							"@type": "UnitPriceSpecification",
							price: input.price,
							priceCurrency: input.currency,
							unitCode: UNIT_CODES[unit],
						},
					}),
				availability,
				url: input.url,
				...(input.seller && { seller: sellerNode(input.seller) }),
			}
		: null;

	if (kind === "service") {
		return {
			...base,
			"@type": "Service",
			...(input.images.length > 0 && { image: input.images }),
			...(input.seller && { provider: sellerNode(input.seller) }),
			...(input.location && { areaServed: input.location }),
			...(input.categoryName && { serviceType: input.categoryName }),
			...(offer && { offers: offer }),
		};
	}

	if (kind === "rental") {
		return {
			"@context": base["@context"],
			"@type": "Offer",
			name: input.title,
			description: input.description ?? undefined,
			url: input.url,
			...(input.images.length > 0 && { image: input.images }),
			...(offer
				? {
						price: offer.price,
						...(offer.priceCurrency && { priceCurrency: offer.priceCurrency }),
						...(offer.priceSpecification && {
							priceSpecification: offer.priceSpecification,
						}),
					}
				: {}),
			availability,
			...(input.seller && { seller: sellerNode(input.seller) }),
			itemOffered: {
				"@type": "Accommodation",
				name: input.title,
				...(input.location && {
					address: {
						"@type": "PostalAddress",
						addressLocality: input.location,
					},
				}),
			},
		};
	}

	return {
		...base,
		"@type": "Product",
		image: input.images,
		...(offer && { offers: offer }),
		...(input.categoryName && { category: input.categoryName }),
	};
}
