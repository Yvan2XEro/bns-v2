import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	CreateResaleListingInput,
	CurrentResaleTerms,
	ResaleCataloguePage,
	ResellerFinanceView,
	SupplierResaleProduct,
} from "../../../api/src/contracts/resale";
import { api } from "../lib/api";

export const resaleCatalogueKey = (shopId: string, query: string) =>
	["shops", shopId, "resale-catalogue", query] as const;

export function useSupplierResaleProducts(shopId: string | undefined) {
	return useQuery({
		queryKey: ["shops", shopId ?? "", "resale", "offered"],
		queryFn: () =>
			api.get<{ products: SupplierResaleProduct[] }>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/resale/offered`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useResaleCatalogue(shopId: string | undefined, query: string) {
	return useQuery({
		queryKey: resaleCatalogueKey(shopId ?? "", query),
		queryFn: () => {
			const params = new URLSearchParams({ shop: shopId ?? "" });
			if (query) params.set("q", query);
			return api.get<ResaleCataloguePage>(
				`/api/resale/catalogue?${params.toString()}`,
			);
		},
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useResellerFinance(shopId: string | undefined) {
	return useQuery({
		queryKey: ["shops", shopId ?? "", "reseller-finance"],
		queryFn: () =>
			api.get<ResellerFinanceView>(
				`/api/shops/${encodeURIComponent(shopId ?? "")}/reseller-finance`,
			),
		enabled: Boolean(shopId),
		retry: false,
	});
}

export function useCurrentResaleTerms() {
	return useQuery({
		queryKey: ["resale-terms", "reseller"],
		queryFn: () =>
			api.get<CurrentResaleTerms>(
				"/api/public/resale-terms/current?role=reseller",
			),
		retry: false,
	});
}

export function useAcceptResaleTerms(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { version: string; locale: "fr" | "en" }) =>
			api.post(`/api/shops/${encodeURIComponent(shopId)}/resale-terms/accept`, {
				...input,
				role: "reseller",
				client: "mobile",
			}),
		onSuccess: async () =>
			queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-catalogue"],
			}),
	});
}

export function useRequestResaleLink(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { supplierShop: string; acceptTermsVersion: string }) =>
			api.post(`/api/shops/${encodeURIComponent(shopId)}/resale-links`, input),
		onSuccess: async () =>
			queryClient.invalidateQueries({
				queryKey: ["shops", shopId, "resale-catalogue"],
			}),
	});
}

export function useCreateResaleListing(shopId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateResaleListingInput) =>
			api.post(
				`/api/shops/${encodeURIComponent(shopId)}/resale-listings`,
				input,
			),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["shops", shopId, "resale-catalogue"],
				}),
				queryClient.invalidateQueries({
					queryKey: ["shops", shopId, "products"],
				}),
			]);
		},
	});
}
