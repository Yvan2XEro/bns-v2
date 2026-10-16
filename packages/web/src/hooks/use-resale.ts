"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiError } from "~/lib/apiError";
import {
	resaleLinkCancelPath,
	type SupplierResaleSettingsInput,
} from "~/lib/resale-hub";
import { apiGet, apiPatch, apiPost } from "~/lib/shop-api";
import type {
	CreateResaleListingInput,
	CurrentResaleTerms,
	ResaleCataloguePage,
	ResaleLinkListPage,
	ResellerFinanceView,
	ResoldListingPage,
	SupplierResaleProduct,
	SupplierResaleSettingsView,
	UpdateResaleListingPricesInput,
} from "../../../api/src/contracts/resale";

export const resaleCatalogueKey = (
	shopId: string,
	query: string,
	supplier = "",
) => ["shops", shopId, "resale-catalogue", query, supplier] as const;
export const resoldListingsKey = (shopId: string) =>
	["shops", shopId, "resale-catalogue", "resold"] as const;
export const supplierResaleSettingsKey = (productId: string) =>
	["resale-settings", productId] as const;
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

export function useCancelResaleLinkRequest(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<unknown, ApiError, { linkId: string }>({
		mutationFn: ({ linkId }) => apiPost(resaleLinkCancelPath(shopId, linkId)),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["shops", shopId, "resale-links"],
				}),
				queryClient.invalidateQueries({
					queryKey: ["shops", shopId, "resale-catalogue"],
				}),
			]);
		},
	});
}

export function useResaleCatalogue(
	shopId: string | null,
	search: string,
	supplier = "",
) {
	const query = search.trim();
	const params = new URLSearchParams({ shop: shopId ?? "" });
	if (query) params.set("q", query);
	if (supplier) params.set("supplier", supplier);
	return useQuery<ResaleCataloguePage, ApiError>({
		queryKey: resaleCatalogueKey(shopId ?? "", query, supplier),
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

export function useAcceptResaleTerms(
	shopId: string,
	role: "supplier" | "reseller" = "reseller",
) {
	const queryClient = useQueryClient();
	return useMutation<
		unknown,
		ApiError,
		{ version: string; locale: "fr" | "en" }
	>({
		mutationFn: ({ version, locale }) =>
			apiPost(`/api/shops/${encodeURIComponent(shopId)}/resale-terms/accept`, {
				role,
				version,
				locale,
				client: "web",
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-catalogue"],
			});
			await queryClient.invalidateQueries({ queryKey: ["resale-settings"] });
			await queryClient.invalidateQueries({
				queryKey: supplierResaleProductsKey(shopId),
			});
		},
	});
}

export function useResoldListings(shopId: string) {
	return useQuery<ResoldListingPage, ApiError>({
		queryKey: resoldListingsKey(shopId),
		queryFn: () =>
			apiGet<ResoldListingPage>(
				`/api/shops/${encodeURIComponent(shopId)}/resale-listings`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useUpdateResaleListingPrices(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		unknown,
		ApiError,
		UpdateResaleListingPricesInput & { listingId: string }
	>({
		mutationFn: ({ listingId, prices }) =>
			apiPatch(
				`/api/shops/${encodeURIComponent(shopId)}/resale-listings/${encodeURIComponent(listingId)}`,
				{ prices },
			),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-catalogue"],
			});
		},
	});
}

export function useSupplierResaleSettings(productId: string) {
	return useQuery<SupplierResaleSettingsView, ApiError>({
		queryKey: supplierResaleSettingsKey(productId),
		queryFn: () =>
			apiGet<SupplierResaleSettingsView>(
				`/api/products/${encodeURIComponent(productId)}/resale`,
			),
		enabled: Boolean(productId),
		retry: false,
	});
}

export function useSaveSupplierResaleSettings(
	shopId: string,
	productId: string,
) {
	const queryClient = useQueryClient();
	return useMutation<unknown, ApiError, SupplierResaleSettingsInput>({
		mutationFn: (input) =>
			apiPatch(`/api/products/${encodeURIComponent(productId)}/resale`, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: supplierResaleSettingsKey(productId),
			});
			await queryClient.invalidateQueries({
				queryKey: supplierResaleProductsKey(shopId),
			});
		},
	});
}

export function useRequestResaleLink(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation<
		unknown,
		ApiError,
		{ supplierShop: string; acceptTermsVersion: string; productId?: string }
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
