"use client";

import { useMutation } from "@tanstack/react-query";
import { shopApi } from "~/lib/shop-api";

export const uploadMediaKey = ["media", "upload"] as const;

/** Uploads one image and returns its id; the caller decides when to save it. */
export function useUploadMedia() {
	return useMutation({
		mutationKey: uploadMediaKey,
		mutationFn: ({ file, alt }: { file: File; alt: string }) =>
			shopApi.uploadMedia(file, alt),
		retry: false,
	});
}
