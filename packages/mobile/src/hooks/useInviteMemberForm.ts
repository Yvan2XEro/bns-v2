import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAlert } from "@/src/contexts/AlertContext";
import { ApiError } from "@/src/lib/api";
import { ERROR_CODES, resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import {
	assignableRoles,
	type InviteFormValues,
	inviteSchema,
} from "@/src/lib/teamForm";
import type { ShopRole } from "@/src/types/api";
import { useInviteMember } from "./useShopTeam";

/** The three codes a field, rather than the whole form, is wrong about. */
const FIELD_CODES: ReadonlySet<string> = new Set([
	ERROR_CODES.teamCannotInviteSelf,
	ERROR_CODES.teamAlreadyMember,
	ERROR_CODES.teamInvitationPending,
]);

/**
 * Wraps `useInviteMember` with the form: `channel` decides which of `phone`
 * / `email` the submit payload carries, a server field error lands on the
 * same field the schema would have flagged, and anything else — including
 * `delivered: false` — never claims the invite reached the recipient as a
 * plain toast.
 */
export function useInviteMemberForm(
	shopId: string,
	role: ShopRole | null,
	onDelivered: () => void,
) {
	const { t } = useTranslation();
	const { showError } = useAlert();
	const invite = useInviteMember(shopId);
	const roles = assignableRoles(role);
	const [delivered, setDelivered] = useState<boolean | null>(null);

	const form = useForm<InviteFormValues>({
		resolver: zodResolver(inviteSchema),
		mode: "onChange",
		defaultValues: {
			channel: "phone",
			phone: "+237",
			email: "",
			role: roles[0] ?? "staff",
		},
	});

	const channel = form.watch("channel");

	const submit = form.handleSubmit(async (values) => {
		setDelivered(null);
		try {
			const result = await invite.mutateAsync(
				values.channel === "phone"
					? { channel: "phone", phone: values.phone, role: values.role }
					: { channel: "email", email: values.email, role: values.role },
			);
			if (!result.delivered) {
				setDelivered(false);
				return;
			}
			setDelivered(true);
			onDelivered();
		} catch (error) {
			const code = error instanceof ApiError ? error.code : null;
			if (code && FIELD_CODES.has(code)) {
				form.setError(values.channel === "phone" ? "phone" : "email", {
					type: "server",
					message: resolveErrorMessage(error, t),
				});
				return;
			}
			showError(t("team.inviteFailedTitle"), resolveErrorMessage(error, t));
		}
	});

	return {
		form,
		channel,
		roles,
		delivered,
		isPending: invite.isPending,
		submit,
	};
}
