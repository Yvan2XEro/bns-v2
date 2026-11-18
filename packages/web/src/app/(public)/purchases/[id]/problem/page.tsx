import { redirect } from "next/navigation";
import { getAuthUser } from "~/lib/server-api";
import { ProblemReportClient } from "./problem-report-client";

export default async function ReportOrderProblemPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!(await getAuthUser())) {
		redirect(
			`/auth/login?redirect=${encodeURIComponent(`/purchases/${id}/problem`)}`,
		);
	}
	return <ProblemReportClient orderId={id} />;
}
