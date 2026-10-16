import { describe, expect, it } from "bun:test";
import {
	addPages,
	captureHintKey,
	captureSources,
	firstRejectedPage,
	MAX_CAPTURE_PAGES,
	namePages,
	needsReview,
	pageAllowance,
	pageFileName,
	removePage,
	retakePage,
	toFileUri,
} from "./documentCapture";
import {
	MAX_DOCUMENT_FILE_SIZE,
	type PickedFile,
} from "./verificationBusiness";

const page = (
	name: string,
	overrides: Partial<PickedFile> = {},
): PickedFile => ({
	uri: `file:///scan/${name}.jpg`,
	fileName: null,
	mimeType: "image/jpeg",
	size: 200_000,
	...overrides,
});

describe("captureSources", () => {
	it("offers the scanner instead of the plain camera when the module is present", () => {
		expect(captureSources(true)).toEqual(["scan", "library", "document"]);
	});

	it("falls back to the pickers on a binary without the scanner", () => {
		expect(captureSources(false)).toEqual(["camera", "library", "document"]);
		expect(captureSources(false)).not.toContain("scan");
	});

	it("reviews photos but sends a PDF straight away", () => {
		expect(needsReview("scan")).toBe(true);
		expect(needsReview("camera")).toBe(true);
		expect(needsReview("library")).toBe(true);
		expect(needsReview("document")).toBe(false);
	});
});

describe("page list", () => {
	it("caps a capture at its own page ceiling", () => {
		const many = Array.from({ length: MAX_CAPTURE_PAGES + 3 }, (_, i) =>
			page(`p${i}`),
		);
		expect(addPages([], many, 0)).toHaveLength(MAX_CAPTURE_PAGES);
	});

	it("caps a capture at what the request still allows", () => {
		expect(pageAllowance(8, 0)).toBe(2);
		expect(pageAllowance(8, 1)).toBe(1);
		expect(pageAllowance(10, 0)).toBe(0);
		expect(addPages([page("a")], [page("b"), page("c")], 8)).toEqual([
			page("a"),
			page("b"),
		]);
	});

	it("keeps the order pages were added in", () => {
		const pages = addPages(addPages([], [page("front")], 0), [page("back")], 0);
		expect(pages.map((p) => p.uri)).toEqual([
			"file:///scan/front.jpg",
			"file:///scan/back.jpg",
		]);
	});

	it("retakes one page in place", () => {
		const pages = [page("a"), page("b"), page("c")];
		expect(retakePage(pages, 1, page("b2"))).toEqual([
			page("a"),
			page("b2"),
			page("c"),
		]);
	});

	it("keeps the old page when the retake is cancelled or out of range", () => {
		const pages = [page("a")];
		expect(retakePage(pages, 0, undefined)).toBe(pages);
		expect(retakePage(pages, 0, null)).toBe(pages);
		expect(retakePage(pages, 3, page("x"))).toBe(pages);
	});

	it("removes one page", () => {
		expect(removePage([page("a"), page("b")], 0)).toEqual([page("b")]);
	});
});

describe("upload rules", () => {
	it("points at the first page the upload rules refuse", () => {
		expect(firstRejectedPage([page("a"), page("b")])).toBeNull();
		expect(
			firstRejectedPage([
				page("a"),
				page("b", { size: MAX_DOCUMENT_FILE_SIZE + 1 }),
			]),
		).toEqual({ index: 1, code: "upload.tooLarge" });
		expect(firstRejectedPage([page("a", { mimeType: "image/heic" })])).toEqual({
			index: 0,
			code: "upload.invalidType",
		});
		expect(firstRejectedPage([page("a", { size: null })])).toEqual({
			index: 0,
			code: "upload.invalidType",
		});
	});

	it("names pages in review order", () => {
		expect(
			namePages("legal_representative_id", [page("f"), page("b")]).map(
				(p) => p.fileName,
			),
		).toEqual([
			"legal_representative_id-page-1-of-2.jpg",
			"legal_representative_id-page-2-of-2.jpg",
		]);
		expect(pageFileName("niu_certificate", 0, 1, "image/png")).toBe(
			"niu_certificate.png",
		);
	});
});

describe("scanner glue", () => {
	it("turns a bare path into a file URI and leaves URIs alone", () => {
		expect(toFileUri("/tmp/scan.jpg")).toBe("file:///tmp/scan.jpg");
		expect(toFileUri("file:///tmp/scan.jpg")).toBe("file:///tmp/scan.jpg");
	});

	it("asks for both sides of an ID and every page of the rest", () => {
		expect(captureHintKey("legal_representative_id")).toBe(
			"verification.capture.hintTwoSides",
		);
		expect(captureHintKey("rccm_extract")).toBe(
			"verification.capture.hintPages",
		);
	});
});
