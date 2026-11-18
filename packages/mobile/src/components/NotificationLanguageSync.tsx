import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/lib/auth";
import { useTranslation } from "@/src/lib/i18n";
import { notificationLocaleOf } from "../../../api/src/contracts/notificationLocale";

/**
 * Keeps the account's notification language on the app's: pushes and e-mails
 * leave while the app is closed, so the server cannot ask the phone which
 * language to write them in. Writes only when the two differ, so switching
 * language in the settings is followed and nothing else costs a request.
 */
export function NotificationLanguageSync() {
	const { user, refreshUser } = useAuth();
	const { i18n } = useTranslation();
	const locale = notificationLocaleOf(i18n.language);
	const { mutate, isPending, variables } = useMutation({
		mutationFn: (language: string) =>
			api.patch(`/api/users/${user?.id}`, { language }),
		onSuccess: () => void refreshUser(),
	});
	const stale = Boolean(user) && user?.language !== locale;
	// Already sent for this language: wait for the refreshed account rather
	// than writing again; a failure is not retried until the language changes.
	const settled = variables === locale && !isPending;

	useEffect(() => {
		if (stale && !isPending && !settled) mutate(locale);
	}, [stale, locale, isPending, settled, mutate]);

	return null;
}
