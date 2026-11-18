"use client";

import type React from "react";
import {
	LISTING_REJECTION_LABELS,
	LISTING_REJECTION_REASONS,
	type ListingRejectionReason,
	rejectionNeedsMessage,
} from "../../contracts/listingRejection";

export interface RejectionDraft {
	reasonCode: ListingRejectionReason | "";
	message: string;
}

export const EMPTY_REJECTION: RejectionDraft = { reasonCode: "", message: "" };

/** A reason is picked, and `other` comes with the moderator's own words. */
export function rejectionReady(draft: RejectionDraft): boolean {
	if (!draft.reasonCode) return false;
	return (
		!rejectionNeedsMessage(draft.reasonCode) || draft.message.trim() !== ""
	);
}

/**
 * Refuses through the moderation service, which records the decision in the
 * moderation log and lets the seller read the reason in their own language.
 */
export async function rejectListingRequest(
	listingId: string,
	draft: RejectionDraft,
): Promise<void> {
	const res = await fetch(
		`/api/moderation/listings/${encodeURIComponent(listingId)}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action: "reject",
				reasonCode: draft.reasonCode,
				message: draft.message.trim() || null,
			}),
		},
	);
	if (!res.ok) throw new Error("Failed to reject listing");
}

const fieldStyle: React.CSSProperties = {
	width: "100%",
	padding: "0.5rem",
	border: "1px solid var(--theme-elevation-200)",
	borderRadius: "4px",
	fontSize: "0.8125rem",
	background: "var(--theme-input-bg)",
	color: "var(--theme-text)",
};

/** The reason, then a note to the seller, written in any language. */
export const RejectionReasonFields: React.FC<{
	value: RejectionDraft;
	onChange: (next: RejectionDraft) => void;
}> = ({ value, onChange }) => (
	<>
		<select
			value={value.reasonCode}
			onChange={(e) =>
				onChange({
					...value,
					reasonCode:
						LISTING_REJECTION_REASONS.find((code) => code === e.target.value) ??
						"",
				})
			}
			style={fieldStyle}
		>
			<option value="">Reason…</option>
			{LISTING_REJECTION_REASONS.map((code) => (
				<option key={code} value={code}>
					{LISTING_REJECTION_LABELS[code].en}
				</option>
			))}
		</select>
		<textarea
			value={value.message}
			onChange={(e) => onChange({ ...value, message: e.target.value })}
			placeholder={
				value.reasonCode && rejectionNeedsMessage(value.reasonCode)
					? "Tell the seller why (required)"
					: "A note to the seller (optional)"
			}
			rows={2}
			style={{ ...fieldStyle, resize: "vertical" }}
		/>
	</>
);
