import type { Metadata } from "next";
import { ReviewClient } from "./review-client";

export const metadata: Metadata = {
	title: "Verification review",
};

export default async function VerificationReviewPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <ReviewClient id={id} />;
}
