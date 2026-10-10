"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { ConsentNotice } from "~/components/verification/consent-notice";
import {
	useOpenVerificationRequest,
	useShopVerification,
	useStartKycSession,
} from "~/hooks/use-verification";
import { ApiError, ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import { canOpenRequest } from "~/lib/verification";

const consentSchema = z.object({
	// A literal(true) requirement with a boolean-typed, unchecked-by-default
	// field: `refine` keeps the field typed as `boolean` (so
	// `defaultValues: { accepted: false }` type-checks) while still refusing
	// submission until it is `true`.
	accepted: z.boolean().refine((value) => value === true, {
		message: "checkboxError",
	}),
});
type ConsentFormValues = z.infer<typeof consentSchema>;

export function IdentityClient({ shopId }: { shopId: string }) {
	const t = useTranslations("Verification.identity");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const query = useShopVerification(shopId);
	const openRequest = useOpenVerificationRequest(shopId);
	const startKycSession = useStartKycSession(shopId);

	const {
		control,
		handleSubmit,
		setError,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<ConsentFormValues>({
		resolver: zodResolver(consentSchema),
		defaultValues: { accepted: false },
	});

	if (query.isPending) {
		return <p className="text-[#64748B] text-sm">{tRoot("Common.loading")}</p>;
	}
	if (query.isError) {
		return (
			<div className="space-y-2">
				<p role="alert" className="text-red-600 text-sm">
					{resolveErrorMessage(query.error, tRoot, t("loadError"))}
				</p>
				<Button variant="outline" onClick={() => query.refetch()}>
					{tRoot("Verification.retry")}
				</Button>
			</div>
		);
	}

	const view = query.data;
	const level2 = view.requests.level2;
	const resumable =
		level2?.status === "draft" || level2?.status === "needs_info";
	const gate = canOpenRequest(view, 2);
	const canProceed = resumable || gate.ok;

	if (!canProceed) {
		return (
			<div className="space-y-2">
				<p className="text-[#64748B] text-sm">{t("blocked.body")}</p>
				<Button asChild variant="outline">
					<Link href="/seller/verification">{t("blocked.backToHub")}</Link>
				</Button>
			</div>
		);
	}

	const onValid = async ({ accepted }: ConsentFormValues) => {
		if (!accepted || !view.consentVersion) return;
		try {
			// Idempotent on the server: resumes the existing draft if there is one.
			const request = await openRequest.mutateAsync({ level: 2 });
			const session = await startKycSession.mutateAsync({
				requestId: request.id,
				consentVersion: view.consentVersion,
				locale,
			});
			// Same tab: the vendor's own return page hands control back to us.
			window.location.assign(session.url);
		} catch (error) {
			if (
				error instanceof ApiError &&
				error.code === ERROR_CODES.verificationConsentRequired
			) {
				// The notice was replaced while this page was open: refetch and
				// re-render the new one rather than retrying against a stale one.
				reset({ accepted: false });
				void query.refetch();
				setError("root", { message: resolveErrorMessage(error, tRoot) });
				return;
			}
			setError("root", { message: resolveErrorMessage(error, tRoot) });
		}
	};

	const busy =
		isSubmitting || openRequest.isPending || startKycSession.isPending;

	return (
		<form onSubmit={handleSubmit(onValid)} className="space-y-4" noValidate>
			{!view.enabled && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 text-sm">
					{tRoot("ApiErrors.verification.disabled")}
				</p>
			)}

			{errors.root?.message && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{errors.root.message}
				</p>
			)}

			<Controller
				control={control}
				name="accepted"
				render={({ field }) => (
					<ConsentNotice
						checked={field.value}
						onToggle={field.onChange}
						error={
							errors.accepted?.message
								? t(`consent.${errors.accepted.message}`)
								: null
						}
					/>
				)}
			/>

			<Button type="submit" disabled={busy}>
				{busy ? t("consent.starting") : t("consent.start")}
			</Button>
		</form>
	);
}
