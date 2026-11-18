import { describe, expect, test } from "bun:test";
import {
	parsePage,
	parseShopSort,
	parseShopTab,
	shopPageHref,
} from "./shop-page-params";

const base = {
	tab: "listings",
	q: "",
	category: "",
	sort: "newest",
	page: 1,
} as const;

describe("shop page params", () => {
	test("unknown values fall back to the defaults", () => {
		expect(parseShopTab(undefined)).toBe("listings");
		expect(parseShopTab("orders")).toBe("listings");
		expect(parseShopTab("reviews")).toBe("reviews");
		expect(parseShopSort("price_desc")).toBe("price_desc");
		expect(parseShopSort("views")).toBe("newest");
		expect(parsePage("0")).toBe(1);
		expect(parsePage("abc")).toBe(1);
		expect(parsePage("3")).toBe(3);
	});

	test("the default state is the bare shop URL", () => {
		expect(shopPageHref("akwa", base)).toBe("/s/akwa");
	});

	test("listings keep q, category, sort and page together", () => {
		expect(
			shopPageHref("akwa", {
				...base,
				q: "iphone",
				category: "c1",
				sort: "price_asc",
				page: 2,
			}),
		).toBe("/s/akwa?q=iphone&category=c1&sort=price_asc&page=2");
	});

	test("other tabs drop the listing filters", () => {
		const filtered = {
			...base,
			q: "x",
			category: "c1",
			sort: "price_desc" as const,
		};
		expect(shopPageHref("akwa", { ...filtered, tab: "reviews", page: 2 })).toBe(
			"/s/akwa?tab=reviews&page=2",
		);
		expect(shopPageHref("akwa", { ...filtered, tab: "about", page: 3 })).toBe(
			"/s/akwa?tab=about",
		);
	});
});
