/**
 * Mirrors the handle rules in `packages/api/src/lib/shopHandle.ts` so the form
 * can answer instantly. The server stays the authority: reserved words and
 * uniqueness are only known there.
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Turns a shop name or typed text into a handle candidate: "Akwa Tech Store" → "akwa-tech-store". */
export function slugifyHandle(input: string): string {
	return input
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+/, "")
		.slice(0, HANDLE_MAX)
		.replace(/-+$/, "");
}

export function isHandleFormatValid(handle: string): boolean {
	return (
		handle.length >= HANDLE_MIN &&
		handle.length <= HANDLE_MAX &&
		HANDLE_PATTERN.test(handle) &&
		!handle.includes("--")
	);
}
