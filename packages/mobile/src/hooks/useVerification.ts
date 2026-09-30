import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File } from "expo-file-system";
import { api } from "../lib/api";
import type {
	BusinessType,
	OwnerVerificationRequest,
	ShopVerificationResponse,
	VerificationDocumentKind,
} from "../types/api";

/** Everything about one shop's verification, nested under the existing shop scope so a shop-wide invalidation reaches it. */
export const verificationKeys = {
	shop: (shopId: string) => ["shops", shopId, "verification"] as const,
	request: (shopId: string, requestId: string) =>
		["shops", shopId, "verification", requestId] as const,
};

/**
 * No catch-and-return-null here: a failed request must surface as `isError`,
 * not collapse into "nothing to verify" the way a P1 hook once did for a
 * different resource.
 */
export function useShopVerification(shopId: string | undefined) {
	return useQuery({
		queryKey: verificationKeys.shop(shopId ?? ""),
		queryFn: () =>
			api.get<ShopVerificationResponse>(`/api/shops/${shopId}/verification`),
		enabled: Boolean(shopId),
	});
}

function useInvalidateVerification(shopId: string | undefined) {
	const queryClient = useQueryClient();
	return () => {
		if (!shopId) return;
		queryClient.invalidateQueries({ queryKey: verificationKeys.shop(shopId) });
	};
}

/** Idempotent on the server: a second call for the same shop and level answers with the existing draft. */
export function useOpenVerificationRequest(shopId: string | undefined) {
	const invalidate = useInvalidateVerification(shopId);
	return useMutation({
		mutationFn: (level: 2 | 3) =>
			api.post<OwnerVerificationRequest>(
				`/api/shops/${shopId}/verification-requests`,
				{ level },
			),
		onSuccess: invalidate,
	});
}

export function useStartKycSession(requestId: string | undefined) {
	return useMutation({
		mutationFn: (input: { consentVersion: string; locale: "fr" | "en" }) =>
			api.post<{ url: string; expiresAt: string }>(
				`/api/verification-requests/${requestId}/kyc-session`,
				{ ...input, platform: "mobile" },
			),
	});
}

export interface BusinessPatch {
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

export function useSaveBusiness(
	shopId: string | undefined,
	requestId: string | undefined,
) {
	const invalidate = useInvalidateVerification(shopId);
	return useMutation({
		mutationFn: (patch: BusinessPatch) =>
			api.post<OwnerVerificationRequest>(
				`/api/verification-requests/${requestId}/business`,
				patch,
			),
		onSuccess: invalidate,
	});
}

/** The picker result a document slot hands to the upload mutation, before any upload has started. */
export interface PickedVerificationFile {
	uri: string;
	fileName?: string | null;
	mimeType?: string | null;
}

export interface UploadedVerificationDocument {
	id: string;
	kind: VerificationDocumentKind;
	originalFilename: string;
	mimeType: string;
	filesize: number;
	createdAt: string;
}

export function useUploadVerificationDocument(
	shopId: string | undefined,
	requestId: string | undefined,
) {
	const invalidate = useInvalidateVerification(shopId);
	return useMutation({
		mutationFn: ({
			kind,
			file,
		}: {
			kind: VerificationDocumentKind;
			file: PickedVerificationFile;
		}) => {
			const sourceFile = new File(file.uri);
			const formData = new FormData();
			formData.append("file", sourceFile, file.fileName ?? sourceFile.name);
			formData.append("kind", kind);
			return api.upload<UploadedVerificationDocument>(
				`/api/verification-requests/${requestId}/documents`,
				formData,
			);
		},
		onSuccess: invalidate,
	});
}

export function useDeleteVerificationDocument(
	shopId: string | undefined,
	requestId: string | undefined,
) {
	const invalidate = useInvalidateVerification(shopId);
	return useMutation({
		mutationFn: (documentId: string) =>
			api.delete(
				`/api/verification-requests/${requestId}/documents/${documentId}`,
			),
		onSuccess: invalidate,
	});
}

export function useSubmitVerification(
	shopId: string | undefined,
	requestId: string | undefined,
) {
	const invalidate = useInvalidateVerification(shopId);
	return useMutation({
		mutationFn: () =>
			api.post<OwnerVerificationRequest>(
				`/api/verification-requests/${requestId}/submit`,
				{},
			),
		onSuccess: invalidate,
	});
}

/** Withdrawal, not intake: a seller may delete their own draft before ever submitting it. */
export function useDeleteVerificationDraft(shopId: string | undefined) {
	const invalidate = useInvalidateVerification(shopId);
	return useMutation({
		mutationFn: (requestId: string) =>
			api.delete(`/api/verification-requests/${requestId}`),
		onSuccess: invalidate,
	});
}
