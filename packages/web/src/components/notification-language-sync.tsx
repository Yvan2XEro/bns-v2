"use client";

import { useMutation } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { useAuth } from "~/hooks/use-auth";
import { api } from "~/lib/api";
import { notificationLocaleOf } from "../../../api/src/contracts/notificationLocale";

/**
 * Keeps the account's notification language on the interface's: e-mails and
 * pushes leave while the site is closed, so the server cannot ask the browser
 * which language to write them in. Writes only when the two differ, so a
 * reader switching language is followed and everyone else costs nothing.
 */
export function NotificationLanguageSync() {
	const { user, refreshUser } = useAuth();
	const locale = notificationLocaleOf(useLocale());
	const save = useMutation({
		mutationFn: (language: string) =>
			api.patch(`/api/users/${user?.id}`, { language }),
		onSuccess: () => void refreshUser(),
	});
	const stale = Boolean(user) && user?.language !== locale;
	const { mutate, isPending, variables } = save;
	// Already sent for this language: wait for the refreshed account rather
	// than writing again; a failure is not retried until the language changes.
	const settled = variables === locale && !isPending;

	useEffect(() => {
		if (stale && !isPending && !settled) mutate(locale);
	}, [stale, locale, isPending, settled, mutate]);

	return null;
}
