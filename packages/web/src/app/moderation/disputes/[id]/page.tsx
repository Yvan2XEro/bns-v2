import type { Metadata } from "next";
import { WorkspaceClient } from "./workspace-client";

export const metadata: Metadata = { title: "Dispute arbitration" };

export default async function DisputeWorkspacePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <WorkspaceClient id={id} />;
}
