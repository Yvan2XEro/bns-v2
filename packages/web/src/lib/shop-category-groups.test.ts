import { describe, expect, it } from "bun:test";
import { type CategoryNode, groupedCounts } from "./shop-category-groups";

const tree = new Map<string, CategoryNode>([
	["electronics", { name: "Électronique", parent: null }],
	["phones", { name: "Téléphones", parent: "electronics" }],
	["android", { name: "Android", parent: "phones" }],
	["iphone", { name: "iPhone", parent: "phones" }],
	["computers", { name: "Ordinateurs", parent: "electronics" }],
	["fashion", { name: "Mode", parent: null }],
]);

describe("groupedCounts", () => {
	it("groups at the first level where the shop's catalogue splits", () => {
		expect(
			groupedCounts({ android: 100, iphone: 80, computers: 74 }, tree),
		).toEqual([
			{ id: "phones", name: "Téléphones", count: 180 },
			{ id: "computers", name: "Ordinateurs", count: 74 },
		]);
	});

	it("groups at the roots when the shop spans several of them", () => {
		expect(groupedCounts({ android: 3, fashion: 5 }, tree)).toEqual([
			{ id: "fashion", name: "Mode", count: 5 },
			{ id: "electronics", name: "Électronique", count: 3 },
		]);
	});

	it("never mixes a parent with its own subcategories", () => {
		expect(groupedCounts({ phones: 2, android: 4, iphone: 1 }, tree)).toEqual([
			{ id: "phones", name: "Téléphones", count: 7 },
		]);
	});

	it("drops unknown ids and empty counts", () => {
		expect(groupedCounts({ gone: 9, iphone: 0, android: 2 }, tree)).toEqual([
			{ id: "android", name: "Android", count: 2 },
		]);
	});
});
