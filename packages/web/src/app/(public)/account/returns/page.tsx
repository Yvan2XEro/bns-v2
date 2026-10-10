import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { ReturnsClient } from "./returns-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Returns");
	return { title: t("title") };
}

export default async function ReturnsPage() {
	if (!(await getAuthUser())) {
		redirect(`/auth/login?redirect=${encodeURIComponent("/account/returns")}`);
	}
	return <ReturnsClient />;
}
