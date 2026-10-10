"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const LOCALES = ["fr", "en"] as const;

export async function switchLocale(formData: FormData) {
	const locale = formData.get("locale") as string;
	if (!(LOCALES as readonly string[]).includes(locale)) return;
	const store = await cookies();
	store.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
	redirect("/i18n-demo");
}
