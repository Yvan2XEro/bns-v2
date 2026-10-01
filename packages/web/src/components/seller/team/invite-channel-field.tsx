import { useTranslations } from "next-intl";
import {
	type Control,
	Controller,
	type FieldErrors,
	type UseFormRegister,
} from "react-hook-form";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { PhoneInput } from "~/components/ui/phone-input";
import type { InviteFormValues } from "~/lib/team-form";

/** The phone/email field pair, split out of `InviteDialog` to keep it under ~200 lines. */
export function InviteChannelField({
	channel,
	control,
	errors,
	register,
}: {
	channel: "phone" | "email";
	control: Control<InviteFormValues>;
	errors: FieldErrors<InviteFormValues>;
	register: UseFormRegister<InviteFormValues>;
}) {
	const t = useTranslations("Team");
	const tPhone = useTranslations("PhoneVerification");
	const tRoot = useTranslations();

	if (channel === "phone") {
		return (
			<div className="space-y-1.5">
				<Label htmlFor="invite-phone">{t("phoneLabel")}</Label>
				<Controller
					control={control}
					name="phone"
					render={({ field }) => (
						<PhoneInput
							id="invite-phone"
							placeholder={tPhone("phonePlaceholder")}
							aria-invalid={Boolean(errors.phone)}
							value={field.value ?? ""}
							onChange={field.onChange}
							onBlur={field.onBlur}
						/>
					)}
				/>
				{errors.phone && (
					<p className="text-red-600 text-xs">{tPhone("phoneFormatInvalid")}</p>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			<Label htmlFor="invite-email">{t("emailLabel")}</Label>
			<Input
				id="invite-email"
				type="email"
				aria-invalid={Boolean(errors.email)}
				{...register("email")}
			/>
			{errors.email && (
				<p className="text-red-600 text-xs">
					{tRoot("ApiErrors.auth.invalidEmail")}
				</p>
			)}
		</div>
	);
}
