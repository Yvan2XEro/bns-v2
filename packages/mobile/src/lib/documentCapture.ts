import type { VerificationDocumentKind } from "../types/api";
import {
	isAcceptedDocument,
	MAX_DOCUMENTS_PER_REQUEST,
	type PickedFile,
} from "./verificationBusiness";

/** Where a document slot can take its file from. `scan` is the native
 * document scanner (VisionKit / ML Kit: frame, edge detection, cropping);
 * `camera` is the plain camera, offered only when the scanner is missing. */
export type CaptureSource = "scan" | "camera" | "library" | "document";

/** Pages one capture may hold, before the request-wide cap is applied. */
export const MAX_CAPTURE_PAGES = 6;

/**
 * The sources a slot offers. A binary built before the scanner module landed
 * (or a device without Play services) falls back to the pickers it always had.
 */
export function captureSources(scannerAvailable: boolean): CaptureSource[] {
	return scannerAvailable
		? ["scan", "library", "document"]
		: ["camera", "library", "document"];
}

/** PDFs go straight to upload: there is nothing to preview or retake. */
export function needsReview(source: CaptureSource): boolean {
	return source !== "document";
}

/** How many pages this capture may still add: the per-capture ceiling, the
 * request's remaining document allowance, minus what is already held. */
export function pageAllowance(
	documentsOnRequest: number,
	pagesHeld: number,
): number {
	const remaining = Math.min(
		MAX_CAPTURE_PAGES,
		MAX_DOCUMENTS_PER_REQUEST - documentsOnRequest,
	);
	return Math.max(0, remaining - pagesHeld);
}

/** Appends new pages, dropping whatever goes beyond the allowance. */
export function addPages(
	pages: PickedFile[],
	incoming: PickedFile[],
	documentsOnRequest: number,
): PickedFile[] {
	const room = pageAllowance(documentsOnRequest, pages.length);
	return [...pages, ...incoming.slice(0, room)];
}

/** Replaces one page in place; a retake that returned nothing keeps the old page. */
export function retakePage(
	pages: PickedFile[],
	index: number,
	replacement: PickedFile | null | undefined,
): PickedFile[] {
	if (!replacement || index < 0 || index >= pages.length) return pages;
	return pages.map((page, i) => (i === index ? replacement : page));
}

export function removePage(pages: PickedFile[], index: number): PickedFile[] {
	return pages.filter((_, i) => i !== index);
}

/** The first page refused by the upload rules, so review can point at it. */
export function firstRejectedPage(
	pages: PickedFile[],
): { index: number; code: "upload.invalidType" | "upload.tooLarge" } | null {
	for (const [index, page] of pages.entries()) {
		const check = isAcceptedDocument(page);
		if (!check.ok) return { index, code: check.code };
	}
	return null;
}

/** File names the reviewer reads in order: `niu_certificate-page-2-of-3.jpg`. */
export function pageFileName(
	kind: VerificationDocumentKind,
	index: number,
	total: number,
	mimeType: string | null,
): string {
	const extension =
		mimeType === "image/png"
			? "png"
			: mimeType === "image/webp"
				? "webp"
				: "jpg";
	return total > 1
		? `${kind}-page-${index + 1}-of-${total}.${extension}`
		: `${kind}.${extension}`;
}

/** Names every page for upload, keeping the order the seller reviewed. */
export function namePages(
	kind: VerificationDocumentKind,
	pages: PickedFile[],
): PickedFile[] {
	return pages.map((page, index) => ({
		...page,
		fileName: pageFileName(kind, index, pages.length, page.mimeType),
	}));
}

/** The scanner answers with bare paths on iOS and `file://` URIs on Android. */
export function toFileUri(path: string): string {
	return path.startsWith("/") ? `file://${path}` : path;
}

/** Identity documents have two sides; everything else is "every page". */
export function captureHintKey(kind: VerificationDocumentKind): string {
	return kind === "legal_representative_id"
		? "verification.capture.hintTwoSides"
		: "verification.capture.hintPages";
}
