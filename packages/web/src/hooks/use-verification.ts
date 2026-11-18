"use client";

import {
	type UseMutationResult,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { verificationKey } from "~/lib/query-keys";
import { apiDelete, apiGet, apiPost, apiPostForm } from "~/lib/shop-api";
import type {
	BusinessType,
	DocumentKind,
	OwnerVerificationRequest,
	ShopVerificationResponse,
} from "~/lib/verification";

export { verificationKey };

/**
 * The signed-in owner's view of their shop's verification: current level,
 * open requests, renewal windows and cooldowns.
 *
 * No catch-and-return-null here. A hook that collapsed a failed request into
 * a falsy value would make the hub show "nothing to verify" for what was
 * actually a failed fetch — the screen renders `isError` and
 * `data === undefined` differently.
 */
export function useShopVerification(shopId: string | null) {
	return useQuery<ShopVerificationResponse, ApiError>({
		queryKey: verificationKey(shopId ?? ""),
		enabled: Boolean(shopId),
		queryFn: () =>
			apiGet<ShopVerificationResponse>(`/api/shops/${shopId}/verification`),
		retry: false,
	});
}

/**
 * Opens (or resumes) a level 2 or 3 request. Idempotent on the server: a
 * second call for the same level returns the existing draft rather than
 * refusing, so the hub can call it without first checking `canOpenRequest`.
 */
export function useOpenVerificationRequest(
	shopId: string,
): UseMutationResult<OwnerVerificationRequest, ApiError, { level: 2 | 3 }> {
	const queryClient = useQueryClient();
	return useMutation<OwnerVerificationRequest, ApiError, { level: 2 | 3 }>({
		mutationKey: [...verificationKey(shopId), "open"],
		mutationFn: ({ level }) =>
			apiPost<OwnerVerificationRequest>(
				`/api/shops/${shopId}/verification-requests`,
				{ level },
			),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: verificationKey(shopId) });
		},
	});
}

export interface StartKycSessionVariables {
	requestId: string;
	consentVersion: string;
	locale: "fr" | "en";
}

export interface KycSession {
	url: string;
	expiresAt: string;
}

/** Starts (or restarts) the vendor's hosted KYC flow for a level 2 request. */
export function useStartKycSession(
	shopId: string,
): UseMutationResult<KycSession, ApiError, StartKycSessionVariables> {
	const queryClient = useQueryClient();
	return useMutation<KycSession, ApiError, StartKycSessionVariables>({
		mutationKey: [...verificationKey(shopId), "kyc-session"],
		mutationFn: ({ requestId, consentVersion, locale }) =>
			apiPost<KycSession>(
				`/api/verification-requests/${requestId}/kyc-session`,
				{
					consentVersion,
					locale,
					platform: "web",
				},
			),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: verificationKey(shopId) });
		},
	});
}

export interface BusinessInput {
	businessType: BusinessType;
	legalName: string;
	tradeName?: string | null;
	rccmNumber?: string | null;
	entreprenantDeclarationNumber?: string | null;
	niu: string;
	registeredAddress: string;
	city: string;
	legalRepresentativeName: string;
	legalRepresentativeIsOwner: boolean;
}

export interface SaveBusinessVariables {
	requestId: string;
	business: BusinessInput;
}

/** Saves the level 3 business form. Editable only while draft or needs_info — the server is the one rule the form must not duplicate. */
export function useSaveBusiness(
	shopId: string,
): UseMutationResult<
	OwnerVerificationRequest,
	ApiError,
	SaveBusinessVariables
> {
	const queryClient = useQueryClient();
	return useMutation<OwnerVerificationRequest, ApiError, SaveBusinessVariables>(
		{
			mutationKey: [...verificationKey(shopId), "business"],
			mutationFn: ({ requestId, business }) =>
				apiPost<OwnerVerificationRequest>(
					`/api/verification-requests/${requestId}/business`,
					business,
				),
			retry: false,
			onSuccess: () => {
				void queryClient.invalidateQueries({
					queryKey: verificationKey(shopId),
				});
			},
		},
	);
}

export interface UploadedVerificationDocument {
	id: string;
	kind: DocumentKind;
	originalFilename: string;
	mimeType: string;
	filesize: number;
	createdAt: string;
}

export interface UploadVerificationDocumentVariables {
	requestId: string;
	file: File;
	kind: DocumentKind;
}

export function useUploadVerificationDocument(
	shopId: string,
): UseMutationResult<
	UploadedVerificationDocument,
	ApiError,
	UploadVerificationDocumentVariables
> {
	const queryClient = useQueryClient();
	return useMutation<
		UploadedVerificationDocument,
		ApiError,
		UploadVerificationDocumentVariables
	>({
		mutationKey: [...verificationKey(shopId), "documents", "upload"],
		mutationFn: ({ requestId, file, kind }) => {
			const form = new FormData();
			form.append("file", file);
			form.append("kind", kind);
			return apiPostForm<UploadedVerificationDocument>(
				`/api/verification-requests/${requestId}/documents`,
				form,
			);
		},
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: verificationKey(shopId) });
		},
	});
}

export interface DeleteVerificationDocumentVariables {
	requestId: string;
	docId: string;
}

export function useDeleteVerificationDocument(
	shopId: string,
): UseMutationResult<void, ApiError, DeleteVerificationDocumentVariables> {
	const queryClient = useQueryClient();
	return useMutation<void, ApiError, DeleteVerificationDocumentVariables>({
		mutationKey: [...verificationKey(shopId), "documents", "delete"],
		mutationFn: ({ requestId, docId }) =>
			apiDelete<void>(
				`/api/verification-requests/${requestId}/documents/${docId}`,
			),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: verificationKey(shopId) });
		},
	});
}

/** Submits (or resubmits, from `needs_info`) a request for review. */
export function useSubmitVerification(
	shopId: string,
): UseMutationResult<OwnerVerificationRequest, ApiError, string> {
	const queryClient = useQueryClient();
	return useMutation<OwnerVerificationRequest, ApiError, string>({
		mutationKey: [...verificationKey(shopId), "submit"],
		mutationFn: (requestId) =>
			apiPost<OwnerVerificationRequest>(
				`/api/verification-requests/${requestId}/submit`,
			),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: verificationKey(shopId) });
		},
	});
}

/** Withdraws a draft. Not gated by the feature flag: withdrawal is never intake. */
export function useDeleteVerificationDraft(
	shopId: string,
): UseMutationResult<void, ApiError, string> {
	const queryClient = useQueryClient();
	return useMutation<void, ApiError, string>({
		mutationKey: [...verificationKey(shopId), "delete-draft"],
		mutationFn: (requestId) =>
			apiDelete<void>(`/api/verification-requests/${requestId}`),
		retry: false,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: verificationKey(shopId) });
		},
	});
}
