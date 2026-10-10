import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { DisputeThreadClient } from "./dispute-thread-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Disputes");
	return { title: t("title") };
}

export default async function DisputePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!(await getAuthUser())) {
		redirect(`/auth/login?redirect=${encodeURIComponent(`/disputes/${id}`)}`);
	}
	return <DisputeThreadClient disputeId={id} />;
}
