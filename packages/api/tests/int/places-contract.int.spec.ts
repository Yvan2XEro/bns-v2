// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Place } from "../../src/contracts/places";
import {
	formatPlaceLabel,
	normalizeRegionName,
	normalizeSettlementName,
	parsePhotonResponse,
	photonReverseUrl,
	photonSearchUrl,
	placeContext,
	placePickerView,
	rankPlaces,
} from "../../src/contracts/places";

function feature(
	properties: Record<string, string>,
	coordinates: [number, number] = [9.7, 4.05],
) {
	return {
		type: "Feature",
		properties: { osm_key: "place", ...properties },
		geometry: { type: "Point", coordinates },
	};
}

const YAOU_VILLAGE = feature(
	{
		osm_value: "village",
		name: "Yaou",
		state: "Comoé",
		country: "Côte d’Ivoire",
		countrycode: "CI",
	},
	[-3.13, 5.79],
);
const YAOUNDE = feature(
	{
		osm_value: "city",
		name: "Yaoundé",
		county: "Mfoundi",
		state: "Région du Centre",
		country: "Cameroun",
		countrycode: "CM",
	},
	[11.52, 3.86],
);
const AKWA_SUBURB = feature({
	osm_value: "suburb",
	name: "Akwa",
	city: "Douala I",
	state: "Région du Littoral",
	country: "Cameroun",
	countrycode: "CM",
});
const CROSSROADS = feature({
	osm_value: "locality",
	name: "Carrefour Tiff",
	district: "Bali",
	city: "Douala I",
	state: "Région du Littoral",
	countrycode: "CM",
});

describe("places contract", () => {
	it("builds a Photon search biased towards the launch market, settlements only", () => {
		const url = new URL(
			photonSearchUrl("https://photon.example/", "yaou", { lang: "fr-CM" }),
		);
		expect(url.origin + url.pathname).toBe("https://photon.example/api");
		expect(Object.fromEntries(url.searchParams)).toMatchObject({
			q: "yaou",
			lang: "fr",
			osm_tag: "place",
			lat: "5.69",
			lon: "12.74",
		});
	});

	it("biases on the user's own position when it is known", () => {
		const url = new URL(
			photonSearchUrl("https://photon.example", "ak", {
				bias: { lat: 4.05, lng: 9.7 },
			}),
		);
		expect(url.searchParams.get("lat")).toBe("4.05");
		expect(url.searchParams.get("zoom")).toBe("10");
	});

	it("builds a reverse lookup", () => {
		const url = new URL(
			photonReverseUrl("https://photon.example", { lat: 4, lng: 9 }),
		);
		expect(url.pathname).toBe("/reverse");
		expect(url.searchParams.get("lon")).toBe("9");
	});

	it("stores the city for a neighbourhood and keeps the neighbourhood beside it", () => {
		const [akwa] = parsePhotonResponse({ features: [AKWA_SUBURB] });
		expect(akwa).toEqual({
			name: "Douala",
			district: "Akwa",
			region: "Littoral",
			country: "Cameroun",
			countryCode: "CM",
			lat: 4.05,
			lng: 9.7,
			kind: "district",
			source: "search",
		});
	});

	it("names a crossroads by the neighbourhood it sits in", () => {
		const [place] = parsePhotonResponse({ features: [CROSSROADS] });
		expect(formatPlaceLabel(place)).toBe("Bali, Douala");
	});

	it("drops features it cannot place and survives a malformed answer", () => {
		expect(
			parsePhotonResponse({
				features: [
					{
						properties: {
							osm_key: "boundary",
							osm_value: "administrative",
							name: "Douala V",
						},
					},
					feature({ osm_value: "suburb", name: "Orphan" }),
					"garbage",
				],
			}),
		).toHaveLength(0);
		expect(parsePhotonResponse(null)).toEqual([]);
		expect(parsePhotonResponse({ type: "error" })).toEqual([]);
	});

	it("ranks the city a prefix starts over a foreign village spelled exactly like it", () => {
		const ranked = rankPlaces(
			parsePhotonResponse({ features: [YAOU_VILLAGE, YAOUNDE] }),
			"yaou",
		);
		expect(ranked.map((p) => p.name)).toEqual(["Yaoundé", "Yaou"]);
	});

	it("matches without accents and collapses duplicates", () => {
		const ranked = rankPlaces(
			parsePhotonResponse({ features: [YAOUNDE, YAOUNDE] }),
			"yaounde",
		);
		expect(ranked).toHaveLength(1);
	});

	it("drops fuzzy rows that share nothing with the query when real matches exist", () => {
		const ranked = rankPlaces(
			parsePhotonResponse({ features: [YAOUNDE, AKWA_SUBURB] }),
			"akw",
		);
		expect(ranked.map((p) => p.district ?? p.name)).toEqual(["Akwa"]);
	});

	it("normalises arrondissements and region prefixes", () => {
		expect(normalizeSettlementName("Douala II")).toBe("Douala");
		expect(normalizeSettlementName("Yaoundé 3e")).toBe("Yaoundé");
		expect(normalizeSettlementName("Bafoussam")).toBe("Bafoussam");
		expect(normalizeRegionName("Région du Littoral")).toBe("Littoral");
		expect(normalizeRegionName("Région de l'Extrême-Nord")).toBe(
			"Extrême-Nord",
		);
		expect(normalizeRegionName("Sud-Ouest")).toBe("Sud-Ouest");
	});

	it("labels a home place by region and a foreign one by country", () => {
		expect(
			formatPlaceLabel({
				name: "Douala",
				region: "Littoral",
				countryCode: "CM",
			}),
		).toBe("Douala, Littoral");
		expect(
			formatPlaceLabel({
				name: "Lagos",
				region: "Lagos",
				country: "Nigéria",
				countryCode: "NG",
			}),
		).toBe("Lagos, Nigéria");
		expect(
			placeContext({ name: "Douala", district: "Akwa", region: "Littoral" }),
		).toBe("Douala, Littoral");
	});
});

const place = (name: string, extra: Partial<Place> = {}): Place => ({
	name,
	region: "",
	source: "search",
	...extra,
});

describe("placePickerView", () => {
	it("before typing: recents, then popular cities not already recent", () => {
		const view = placePickerView({
			query: " ",
			results: [],
			recents: [place("Douala", { source: "recent" })],
			popular: [place("douala"), place("Yaoundé")],
		});
		expect(
			view.sections.map((s) => [s.key, s.places.map((p) => p.name)]),
		).toEqual([
			["recent", ["Douala"]],
			["popular", ["Yaoundé"]],
		]);
		expect(view.typed).toBeNull();
	});

	it("hides empty sections for a brand-new user", () => {
		expect(
			placePickerView({ query: "", results: [], recents: [], popular: [] })
				.sections,
		).toHaveLength(0);
	});

	it("while typing: matching recents first, Photon rows without them", () => {
		const view = placePickerView({
			query: "akw",
			results: [place("Douala", { district: "Akwa" }), place("Akwaya")],
			recents: [
				place("Douala", { district: "Akwa", source: "recent" }),
				place("Kribi", { source: "recent" }),
			],
			popular: [place("Yaoundé")],
		});
		expect(
			view.sections.map((s) => [
				s.key,
				s.places.map((p) => p.district ?? p.name),
			]),
		).toEqual([
			["recent", ["Akwa"]],
			["results", ["Akwaya"]],
		]);
		expect(view.typed).toBe("akw");
	});

	it("offers the typed text only when no row spells it exactly", () => {
		const view = placePickerView({
			query: "yaounde",
			results: [place("Yaoundé")],
			recents: [],
			popular: [],
		});
		expect(view.typed).toBeNull();
		expect(view.sections[0]?.places).toHaveLength(1);
	});
});
