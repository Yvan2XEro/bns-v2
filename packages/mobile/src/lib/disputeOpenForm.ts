import {
	DISPUTE_EVIDENCE_REQUIREMENTS,
	type DisputeEvidenceFileIssue,
	type DisputeReason,
	disputeEvidenceFileIssue,
} from "../../../api/src/contracts/disputes";

/** The design's "3 sur 6": the per-party cap the server applies is higher. */
export const DISPUTE_OPEN_EVIDENCE_MAX = 6;

export type EvidenceUploadStatus = "queued" | "uploading" | "done" | "failed";

export interface PendingEvidence {
	key: string;
	uri: string;
	fileName: string | null;
	mimeType: string;
	size: number | null;
	status: EvidenceUploadStatus;
	/** The API error code of the last failed attempt. */
	errorCode?: string;
}

export interface PickedAsset {
	uri: string;
	fileName?: string | null;
	mimeType?: string | null;
	fileSize?: number | null;
	type?: string | null;
}

/** expo-image-picker leaves `mimeType` empty on some Android builds. */
export function assetMimeType(asset: PickedAsset): string {
	if (asset.mimeType) return asset.mimeType.toLowerCase();
	if (asset.type === "video") return "video/mp4";
	return "image/jpeg";
}

/**
 * Splits picked assets into the ones that join the list and the reason each
 * other one was left out — the same refusals the upload route answers with,
 * plus the cap on how many the page holds.
 */
export function acceptPickedEvidence(
	current: readonly PendingEvidence[],
	picked: readonly PickedAsset[],
	makeKey: (asset: PickedAsset, index: number) => string,
): {
	next: PendingEvidence[];
	rejected: Array<DisputeEvidenceFileIssue | "limit">;
} {
	const next = [...current];
	const rejected: Array<DisputeEvidenceFileIssue | "limit"> = [];
	picked.forEach((asset, index) => {
		const mimeType = assetMimeType(asset);
		const issue = disputeEvidenceFileIssue(mimeType, asset.fileSize);
		if (issue) {
			rejected.push(issue);
			return;
		}
		if (next.length >= DISPUTE_OPEN_EVIDENCE_MAX) {
			rejected.push("limit");
			return;
		}
		next.push({
			key: makeKey(asset, index),
			uri: asset.uri,
			fileName: asset.fileName ?? null,
			mimeType,
			size: asset.fileSize ?? null,
			status: "queued",
		});
	});
	return { next, rejected };
}

/** How many more files the reason needs before the case can be submitted. */
export function evidenceStillNeeded(
	reason: DisputeReason,
	attached: number,
): number {
	return Math.max(0, DISPUTE_EVIDENCE_REQUIREMENTS[reason] - attached);
}

export function evidenceKindFor(
	mimeType: string,
): "photo" | "video" | "document" {
	if (mimeType.startsWith("image/")) return "photo";
	if (mimeType.startsWith("video/")) return "video";
	return "document";
}

/** What still has to be sent: never a file the case already holds. */
export function uploadsToSend(
	items: readonly PendingEvidence[],
): PendingEvidence[] {
	return items.filter((item) => item.status !== "done");
}

export function failedUploads(
	items: readonly PendingEvidence[],
): PendingEvidence[] {
	return items.filter((item) => item.status === "failed");
}

export function withUploadStatus(
	items: readonly PendingEvidence[],
	key: string,
	status: EvidenceUploadStatus,
	errorCode?: string,
): PendingEvidence[] {
	return items.map((item) =>
		item.key === key
			? {
					...item,
					status,
					errorCode: status === "failed" ? errorCode : undefined,
				}
			: item,
	);
}

/**
 * The page's step once the button is pressed: open the case unless it already
 * exists, send what is not yet attached, and submit only once every file is in.
 */
export function nextSubmitStep(input: {
	caseId: string | null;
	items: readonly PendingEvidence[];
}): "open" | "upload" | "submit" {
	if (!input.caseId) return "open";
	if (uploadsToSend(input.items).length > 0) return "upload";
	return "submit";
}
