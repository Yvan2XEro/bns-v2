"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ConsentNotice } from "~/components/verification/consent-notice";
import { DocumentSlot } from "~/components/verification/document-slot";
import {
	useDeleteVerificationDocument,
	useOpenVerificationRequest,
	useSubmitIdentity,
	useUploadVerificationDocument,
} from "~/hooks/use-verification";
import { ApiError, ERROR_CODES, resolveErrorMessage } from "~/lib/apiError";
import {
	type DocumentKind,
	IDENTITY_KINDS,
	missingIdentityKinds,
	type ShopVerificationResponse,
} from "~/lib/verification";

/**
 * Level 2 checked by hand (`identityMethod: "manual"`): the seller uploads
 * both sides of their ID and a selfie holding it, then submits with their
 * consent; a moderator compares them. Nothing leaves our servers.
 *
 * The draft is opened on the first upload, not on arrival: an empty draft
 * would hold the shop's level-2 slot for nothing.
 */
export function ManualIdentity({
	shopId,
	view,
}: {
	shopId: string;
	view: ShopVerificationResponse;
}) {
	const t = useTranslations("Verification");
	const tRoot = useTranslations();
	const locale = useLocale() === "en" ? "en" : "fr";
	const router = useRouter();
	const openRequest = useOpenVerificationRequest(shopId);
	const upload = useUploadVerificationDocument(shopId);
	const remove = useDeleteVerificationDocument(shopId);
	const submit = useSubmitIdentity(shopId);

	const [accepted, setAccepted] = useState(false);
	const [uploadingKind, setUploadingKind] = useState<DocumentKind | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [slotError, setSlotError] = useState<{
		kind: DocumentKind;
		message: string;
	} | null>(null);
	const [formError, setFormError] = useState<string | null>(null);

	const level2 = view.requests.level2;
	const request =
		level2?.status === "draft" || level2?.status === "needs_info"
			? level2
			: null;
	const documents = request?.documents ?? [];
	const isResubmit = request?.status === "needs_info";
	const missing = missingIdentityKinds(documents);
	const consentOk = isResubmit || (accepted && Boolean(view.consentVersion));
	const ready =
		Boolean(request) && missing.length === 0 && consentOk && view.enabled;

	const ensureRequestId = async (): Promise<string> => {
		if (request) return request.id;
		// Idempotent on the server: answers the existing draft if there is one.
		const opened = await openRequest.mutateAsync({ level: 2 });
		return opened.id;
	};

	const handleUpload = async (kind: DocumentKind, file: File) => {
		setUploadingKind(kind);
		setSlotError(null);
		try {
			const requestId = await ensureRequestId();
			await upload.mutateAsync({ requestId, file, kind });
		} catch (error) {
			setSlotError({ kind, message: resolveErrorMessage(error, tRoot) });
		} finally {
			setUploadingKind(null);
		}
	};

	const handleDelete = (kind: DocumentKind, docId: string) => {
		if (!request) return;
		setDeletingId(docId);
		setSlotError(null);
		remove.mutate(
			{ requestId: request.id, docId },
			{
				onSettled: () => setDeletingId(null),
				onError: (error) =>
					setSlotError({ kind, message: resolveErrorMessage(error, tRoot) }),
			},
		);
	};

	const handleSubmit = async () => {
		if (!request || !ready) return;
		setFormError(null);
		try {
			await submit.mutateAsync({
				requestId: request.id,
				consent:
					isResubmit || !view.consentVersion
						? null
						: { consentVersion: view.consentVersion, locale },
			});
			router.push("/seller/verification");
		} catch (error) {
			if (
				error instanceof ApiError &&
				error.code === ERROR_CODES.verificationConsentRequired
			) {
				// The notice was replaced while this page was open.
				setAccepted(false);
			}
			setFormError(resolveErrorMessage(error, tRoot));
		}
	};

	return (
		<div className="space-y-5">
			{!view.enabled && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 text-sm">
					{tRoot("ApiErrors.verification.disabled")}
				</p>
			)}

			<div className="space-y-1">
				<h2 className="font-bold text-base text-ink">
					{t("identity.manual.title")}
				</h2>
				<p className="text-ink-soft text-sm leading-relaxed">
					{t("identity.manual.intro")}
				</p>
			</div>

			<div className="space-y-3">
				{IDENTITY_KINDS.map((kind) => {
					const document = documents.find((d) => d.kind === kind) ?? null;
					return (
						<div key={kind} className="space-y-1">
							<DocumentSlot
								label={t(`documentKind.${kind}`)}
								required
								document={document}
								uploading={uploadingKind === kind}
								deleting={Boolean(document && deletingId === document.id)}
								error={slotError?.kind === kind ? slotError.message : null}
								onUpload={(file) => void handleUpload(kind, file)}
								onDelete={() => document && handleDelete(kind, document.id)}
							/>
							<p className="px-1 text-ink-muted text-xs">
								{t(`identity.manual.hint.${kind}`)}
							</p>
						</div>
					);
				})}
			</div>

			{!isResubmit && (
				<ConsentNotice
					method="manual"
					checked={accepted}
					onToggle={setAccepted}
				/>
			)}

			{formError && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-red-700 text-sm"
				>
					{formError}
				</p>
			)}

			{missing.length > 0 && (
				<p className="text-ink-muted text-sm">
					{t("documents.missing", {
						kinds: missing.map((kind) => t(`documentKind.${kind}`)).join(", "),
					})}
				</p>
			)}

			<Button
				type="button"
				onClick={() => void handleSubmit()}
				disabled={!ready || submit.isPending}
			>
				{submit.isPending
					? t("identity.manual.submitting")
					: t("identity.manual.submit")}
			</Button>
		</div>
	);
}
