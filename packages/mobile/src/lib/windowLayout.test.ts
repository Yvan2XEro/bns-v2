import { describe, expect, test } from "bun:test";
import {
	chunkIntoRows,
	isPhoneScreen,
	sizeClassOf,
	windowLayout,
} from "./windowLayout";

describe("size classes", () => {
	test("follow Material's thresholds", () => {
		expect(sizeClassOf(390)).toBe("compact");
		expect(sizeClassOf(599)).toBe("compact");
		expect(sizeClassOf(600)).toBe("medium");
		expect(sizeClassOf(839)).toBe("medium");
		expect(sizeClassOf(840)).toBe("expanded");
		expect(sizeClassOf(1366)).toBe("expanded");
	});
});

describe("windowLayout", () => {
	test("leaves a phone exactly as designed", () => {
		const phone = windowLayout(390, 844);
		expect(phone.isTablet).toBe(false);
		expect(phone.columns).toBe(2);
		expect(phone.cardWidth).toBe((390 - 48) / 2);
		expect(phone.columnMaxWidth("reading")).toBe(390);
		expect(phone.columnMaxWidth("wide")).toBe(390);
		expect(phone.dialogMaxWidth).toBe(390);
		expect(phone.sheet).toBe("bottom");
	});

	test("turns sheets into centred dialogs from medium up", () => {
		expect(windowLayout(599, 900).sheet).toBe("bottom");
		expect(windowLayout(800, 1280)).toMatchObject({
			sheet: "dialog",
			dialogMaxWidth: 520,
		});
	});

	test("caps the reading column on a tablet, wider in landscape", () => {
		expect(windowLayout(800, 1280).columnMaxWidth("reading")).toBe(640);
		expect(windowLayout(1280, 800).columnMaxWidth("reading")).toBe(760);
		expect(windowLayout(1280, 800).columnMaxWidth("wide")).toBe(1120);
		expect(windowLayout(1280, 800).columnMaxWidth("full")).toBe(1280);
	});

	test("adds grid columns as the width grows", () => {
		expect(windowLayout(800, 1280).columns).toBe(3);
		expect(windowLayout(1024, 768).columns).toBe(3);
		expect(windowLayout(1366, 1024).columns).toBe(4);
	});

	test("marks landscape tablets as expanded", () => {
		expect(windowLayout(1180, 820)).toMatchObject({
			sizeClass: "expanded",
			isExpanded: true,
			isLandscape: true,
		});
	});
});

describe("phone screens", () => {
	test("are judged on the screen's short side, whatever the rotation", () => {
		expect(isPhoneScreen({ width: 430, height: 932 })).toBe(true);
		expect(isPhoneScreen({ width: 932, height: 430 })).toBe(true);
		expect(isPhoneScreen({ width: 800, height: 1280 })).toBe(false);
	});
});

describe("chunkIntoRows", () => {
	test("cuts a list into rows of the grid's width", () => {
		expect(chunkIntoRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});
});
