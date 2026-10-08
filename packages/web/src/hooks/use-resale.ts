"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import { apiGet, apiPost } from "~/lib/shop-api";
import type {
	CreateResaleListingInput,
	CurrentResaleTerms,
	ResaleCataloguePage,
	ResaleLinkListPage,
	ResellerFinanceView,
	SupplierResaleProduct,
} from "../../../api/src/contracts/resale";

export const resaleCatalogueKey = (shopId: string, query: string) =>
	["shops", shopId, "resale-catalogue", query] as const;
export const resaleTermsKey = (role: "supplier" | "reseller") =>
	["resale-terms", role] as const;
export const resaleLinksKey = (
	shopId: string,
	side: "supplier" | "reseller",
	status: string,
) => ["shops", shopId, "resale-links", side, status] as const;
export const resellerFinanceKey = (shopId: string) =>
	["shops", shopId, "reseller-finance"] as const;
export const supplierResaleProductsKey = (shopId: string) =>
	["shops", shopId, "resale", "offered"] as const;

export function useSupplierResaleProducts(shopId: string) {
	return useQuery<{ products: SupplierResaleProduct[] }, ApiError>({
		queryKey: supplierResaleProductsKey(shopId),
		queryFn: () =>
			apiGet<{ products: SupplierResaleProduct[] }>(
				`/api/shops/${encodeURIComponent(shopId)}/resale/offered`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useResellerFinance(shopId: string) {
	return useQuery<ResellerFinanceView, ApiError>({
		queryKey: resellerFinanceKey(shopId),
		queryFn: () =>
			apiGet<ResellerFinanceView>(
				`/api/shops/${encodeURIComponent(shopId)}/reseller-finance`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useResaleLinks(
	shopId: string,
	side: "supplier" | "reseller",
	status: string,
) {
	const params = new URLSearchParams({ side });
	if (status !== "all") params.set("status", status);
	return useQuery<ResaleLinkListPage, ApiError>({
		queryKey: resaleLinksKey(shopId, side, status),
		queryFn: () =>
			apiGet<ResaleLinkListPage>(
				`/api/shops/${encodeURIComponent(shopId)}/resale-links?${params.toString()}`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useDecideResaleLink(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		unknown,
		ApiError,
		{
			linkId: string;
			action: "approve" | "decline" | "suspend" | "reinstate" | "revoke";
			reason?: "quality" | "pricing" | "fraud_review" | "terms" | "other";
			note?: string;
		}
	>({
		mutationFn: ({ linkId, ...body }) =>
			apiPost(`/api/resale-links/${encodeURIComponent(linkId)}/decision`, body),
		onSuccess: async () =>
			queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-links"],
			}),
	});
}

export function useResaleCatalogue(shopId: string | null, search: string) {
	const query = search.trim();
	const params = new URLSearchParams({ shop: shopId ?? "" });
	if (query) params.set("q", query);
	return useQuery<ResaleCataloguePage, ApiError>({
		queryKey: resaleCatalogueKey(shopId ?? "", query),
		queryFn: () =>
			apiGet<ResaleCataloguePage>(`/api/resale/catalogue?${params.toString()}`),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useCurrentResaleTerms(
	role: "supplier" | "reseller",
	enabled = true,
) {
	return useQuery<CurrentResaleTerms, ApiError>({
		queryKey: resaleTermsKey(role),
		queryFn: () =>
			apiGet<CurrentResaleTerms>(
				`/api/public/resale-terms/current?role=${role}`,
			),
		enabled,
		retry: false,
	});
}

export function useAcceptResaleTerms(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		unknown,
		ApiError,
		{ version: string; locale: "fr" | "en" }
	>({
		mutationFn: ({ version, locale }) =>
			apiPost(`/api/shops/${encodeURIComponent(shopId)}/resale-terms/accept`, {
				role: "reseller",
				version,
				locale,
				client: "web",
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-catalogue"],
			});
		},
	});
}

export function useRequestResaleLink(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		unknown,
		ApiError,
		{ supplierShop: string; acceptTermsVersion: string }
	>({
		mutationFn: (input) =>
			apiPost(`/api/shops/${encodeURIComponent(shopId)}/resale-links`, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-catalogue"],
			});
		},
	});
}

export function useCreateResaleListing(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<unknown, ApiError, CreateResaleListingInput>({
		mutationFn: (input) =>
			apiPost(
				`/api/shops/${encodeURIComponent(shopId)}/resale-listings`,
				input,
			),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-catalogue"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "products"],
			});
		},
	});
}
