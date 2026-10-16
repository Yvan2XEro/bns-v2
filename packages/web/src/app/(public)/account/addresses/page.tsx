import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAuthUser } from "~/lib/server-api";
import { AddressesClient } from "./addresses-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Addresses");
	return { title: t("title") };
}

export default async function AddressesPage() {
	if (!(await getAuthUser())) {
		redirect(
			`/auth/login?redirect=${encodeURIComponent("/account/addresses")}`,
		);
	}
	return <AddressesClient />;
}
