import { useRef } from "react";
import { useCreateProduct, useUpdateProduct } from "@/src/hooks/useShops";
import type { ProductInput, ProductWriteResponse } from "@/src/types/api";

/**
 * Wraps create/update behind a single `save`, guarding a second tap landing
 * before `pending` has re-rendered: the ref is set synchronously, ahead of
 * React's next render, so two taps in the same tick still only start one
 * mutation.
 */
export function useProductSubmit({
	creating,
	shopId,
	productId,
}: {
	creating: boolean;
	shopId: string | undefined;
	productId: string | undefined;
}) {
	const create = useCreateProduct(shopId);
	const update = useUpdateProduct(productId);
	const submittingRef = useRef(false);
	const pending = create.isPending || update.isPending || submittingRef.current;

	const save = (
		input: ProductInput,
		handlers: {
			onSuccess: (result: ProductWriteResponse) => void;
			onError: (error: unknown) => void;
		},
	) => {
		if (submittingRef.current) return;
		submittingRef.current = true;

		const release =
			<T>(fn: (arg: T) => void) =>
			(arg: T) => {
				submittingRef.current = false;
				fn(arg);
			};

		(creating ? create : update).mutate(input, {
			onSuccess: release(handlers.onSuccess),
			onError: release(handlers.onError),
		});
	};

	return { pending, save };
}
