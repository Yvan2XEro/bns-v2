import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { ReturnCaseClient } from "./return-case-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Returns");
	return { title: t("caseTitle") };
}

export default async function ReturnCasePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!(await getAuthUser())) {
		redirect(`/auth/login?redirect=${encodeURIComponent(`/returns/${id}`)}`);
	}
	return <ReturnCaseClient caseId={id} />;
}
