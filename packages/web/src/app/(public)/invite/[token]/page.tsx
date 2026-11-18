import type { Metadata } from "next";
import { InviteClient } from "./invite-client";

// A token in a search index is a leaked invitation: this route is never
// crawlable or linkable from a cached result page.
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function InvitePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return <InviteClient token={token} />;
}
