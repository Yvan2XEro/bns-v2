import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CourierClient } from "./courier-client";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Courier");
	return { title: t("title") };
}

/** Signed-in members only; which courier, and in which role, is the API's answer (a 403 shows the not-a-member screen). */
export default function CourierPage() {
	return <CourierClient />;
}
