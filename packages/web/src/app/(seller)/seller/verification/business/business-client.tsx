"use client";

import { useTranslations } from "next-intl";
import { useReducer } from "react";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { BusinessForm } from "~/components/verification/business-form";
import { DocumentSlots } from "~/components/verification/document-slots";
import { SubmitPanel } from "~/components/verification/submit-panel";
import {
	useDeleteVerificationDocument,
	useShopVerification,
	useSubmitVerification,
	useUploadVerificationDocument,
} from "~/hooks/use-verification";
import { resolveErrorMessage } from "~/lib/apiError";
import type { DocumentKind } from "~/lib/verification";
import {
	canSubmit,
	isBusinessValid,
	missingKinds,
	requiredKinds,
} from "~/lib/verification-business";

type State = {
	step: "form" | "documents";
	uploadingKind: DocumentKind | null;
	deletingId: string | null;
	actionError: { kind: DocumentKind; message: string } | null;
};

const initialState: State = {
	step: "form",
	uploadingKind: null,
	deletingId: null,
	actionError: null,
};

function reducer(state: State, patch: Partial<State>): State {
	return { ...state, ...patch };
}

export function BusinessClient({ shopId }: { shopId: string }) {
	const t = useTranslations("Verification");
	const tRoot = useTranslations();
	const query = useShopVerification(shopId);
	const upload = useUploadVerificationDocument(shopId);
	const remove = useDeleteVerificationDocument(shopId);
	const submit = useSubmitVerification(shopId);
	const [state, patch] = useReducer(reducer, initialState);

	if (query.isPending) {
		return <p className="text-[#64748B] text-sm">{tRoot("Common.loading")}</p>;
	}
	// An error is not "nothing to show": the request may well exist, we just
	// failed to read it. Never quietly render an empty form over that.
	if (query.isError) {
		return (
			<div className="space-y-2">
				<p role="alert" className="text-red-600 text-sm">
					{resolveErrorMessage(query.error, tRoot, t("loadError"))}
				</p>
				<Button variant="outline" onClick={() => query.refetch()}>
					{t("retry")}
				</Button>
			</div>
		);
	}

	const request = query.data.requests.level3;
	if (!request || !request.business) {
		return (
			<div className="space-y-2">
				<p className="text-[#64748B] text-sm">{t("noRequest")}</p>
				<Button asChild variant="outline">
					<a href="/seller/verification">{t("backToHub")}</a>
				</Button>
			</div>
		);
	}

	const business = request.business;
	const kinds = requiredKinds(
		business.businessType ?? "company",
		business.legalRepresentativeIsOwner,
	);
	const missing = missingKinds(
		{
			businessType: business.businessType ?? "company",
			legalRepresentativeIsOwner: business.legalRepresentativeIsOwner,
		},
		request.documents,
	);
	// `business` is exactly what the server sends: an optional field that was
	// never filled is `null`, not `""`. `businessSchema` parses that shape
	// directly (see verification-business.ts), so it is passed through as-is.
	const businessValues = {
		...business,
		businessType: business.businessType ?? undefined,
	};
	const formValid = isBusinessValid(businessValues);
	const ready = canSubmit(businessValues, request.documents);

	const handleUpload = (kind: DocumentKind, file: File) => {
		patch({ uploadingKind: kind, actionError: null });
		upload.mutate(
			{ requestId: request.id, file, kind },
			{
				onSettled: () => patch({ uploadingKind: null }),
				onError: (error) =>
					patch({
						actionError: { kind, message: resolveErrorMessage(error, tRoot) },
					}),
			},
		);
	};

	const handleDelete = (kind: DocumentKind, docId: string) => {
		patch({ deletingId: docId, actionError: null });
		remove.mutate(
			{ requestId: request.id, docId },
			{
				onSettled: () => patch({ deletingId: null }),
				onError: (error) =>
					patch({
						actionError: { kind, message: resolveErrorMessage(error, tRoot) },
					}),
			},
		);
	};

	const handleSubmit = () => {
		submit.mutate(request.id);
	};

	return (
		<div className="space-y-5">
			<Tabs
				value={state.step}
				onValueChange={(step) =>
					patch({ step: step === "documents" ? "documents" : "form" })
				}
			>
				<TabsList>
					<TabsTrigger value="form">{t("business.title")}</TabsTrigger>
					<TabsTrigger value="documents">{t("documents.title")}</TabsTrigger>
				</TabsList>
				<TabsContent value="form">
					<BusinessForm
						shopId={shopId}
						requestId={request.id}
						defaultValues={{
							businessType: business.businessType ?? "company",
							legalName: business.legalName ?? "",
							tradeName: business.tradeName ?? "",
							rccmNumber: business.rccmNumber ?? "",
							entreprenantDeclarationNumber:
								business.entreprenantDeclarationNumber ?? "",
							niu: business.niu ?? "",
							registeredAddress: business.registeredAddress ?? "",
							city: business.city ?? "",
							legalRepresentativeName: business.legalRepresentativeName ?? "",
							legalRepresentativeIsOwner: business.legalRepresentativeIsOwner,
						}}
						onSaved={() => patch({ step: "documents" })}
					/>
				</TabsContent>
				<TabsContent value="documents">
					<DocumentSlots
						kinds={kinds}
						documents={request.documents}
						uploadingKind={state.uploadingKind}
						deletingId={state.deletingId}
						uploadError={state.actionError}
						onUpload={handleUpload}
						onDelete={handleDelete}
					/>
				</TabsContent>
			</Tabs>

			<SubmitPanel
				ready={ready}
				formValid={formValid}
				missing={missing}
				isSubmitting={submit.isPending}
				submitError={submit.isError ? submit.error : null}
				onSubmit={handleSubmit}
				onReviewBusiness={() => patch({ step: "form" })}
			/>
		</div>
	);
}
