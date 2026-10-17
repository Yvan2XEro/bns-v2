import { onlineManager } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAlert } from "@/src/contexts/AlertContext";
import { api } from "@/src/lib/api";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { createMediaUploadFormData } from "@/src/lib/mediaUpload";
import { nextToUpload, type PendingPhoto } from "@/src/lib/photoQueue";

export interface UploadedPhoto {
	/** The Payload media id. */
	id: string;
	uri: string;
}

/**
 * Picking and uploading listing and product photos, shared by both forms.
 * Several photos at once, no forced crop; each shows its thumbnail straight
 * away and uploads in the background, two at a time. One that fails says why
 * and is retried with a tap, or by itself when the network comes back.
 */
export function usePhotoUploads({
	alt,
	onUploaded,
}: {
	/** The media's alt text: the listing or product title when there is one. */
	alt: string;
	onUploaded: (photo: UploadedPhoto) => void;
}) {
	const { t } = useTranslation();
	const { showError } = useAlert();
	const [pending, setPending] = useState<PendingPhoto[]>([]);
	const assets = useRef(new Map<string, ImagePicker.ImagePickerAsset>());
	const waiting = useRef<{ key: string }[]>([]);
	const running = useRef(0);
	const latest = useRef({ alt, onUploaded, t });
	latest.current = { alt, onUploaded, t };

	const pump = useCallback(() => {
		const start = nextToUpload(waiting.current, running.current);
		waiting.current = waiting.current.slice(start.length);
		for (const { key } of start) {
			const asset = assets.current.get(key);
			if (!asset) continue;
			running.current += 1;
			upload(asset, latest.current.alt)
				.then((photo) => {
					assets.current.delete(key);
					setPending((list) => list.filter((p) => p.key !== key));
					latest.current.onUploaded(photo);
				})
				.catch((error: unknown) => {
					const { t: translate } = latest.current;
					setPending((list) =>
						list.map((p) =>
							p.key === key
								? {
										...p,
										status: "failed",
										error: resolveErrorMessage(
											error,
											translate,
											translate("create.uploadErrorMsg"),
										),
									}
								: p,
						),
					);
				})
				.finally(() => {
					running.current -= 1;
					pump();
				});
		}
	}, []);

	const enqueue = useCallback(
		(keys: string[]) => {
			waiting.current.push(...keys.map((key) => ({ key })));
			pump();
		},
		[pump],
	);

	const retry = useCallback(
		(key: string) => {
			setPending((list) =>
				list.map((p) =>
					p.key === key ? { ...p, status: "uploading", error: undefined } : p,
				),
			);
			enqueue([key]);
		},
		[enqueue],
	);

	const remove = useCallback((key: string) => {
		assets.current.delete(key);
		waiting.current = waiting.current.filter((w) => w.key !== key);
		setPending((list) => list.filter((p) => p.key !== key));
	}, []);

	// Back online: what failed goes again without the seller asking.
	const pendingRef = useRef(pending);
	pendingRef.current = pending;
	useEffect(
		() =>
			onlineManager.subscribe((online) => {
				if (!online) return;
				for (const photo of pendingRef.current) {
					if (photo.status === "failed") retry(photo.key);
				}
			}),
		[retry],
	);

	const pick = useCallback(
		async (fromCamera: boolean, remaining: number) => {
			if (remaining <= 0) return;
			const permission = fromCamera
				? await ImagePicker.requestCameraPermissionsAsync()
				: await ImagePicker.requestMediaLibraryPermissionsAsync();
			if (permission.status !== "granted") {
				showError(
					t("create.permissionDenied"),
					fromCamera
						? t("create.cameraPermissionMsg")
						: t("create.galleryPermissionMsg"),
				);
				return;
			}
			const result = fromCamera
				? await ImagePicker.launchCameraAsync({ quality: 0.85 })
				: await ImagePicker.launchImageLibraryAsync({
						mediaTypes: ["images"],
						allowsMultipleSelection: true,
						selectionLimit: remaining,
						orderedSelection: true,
						quality: 0.85,
					});
			if (result.canceled) return;
			const picked = result.assets.slice(0, remaining).map((asset, index) => ({
				key: `${Date.now()}-${index}-${asset.uri}`,
				asset,
			}));
			for (const { key, asset } of picked) assets.current.set(key, asset);
			setPending((list) => [
				...list,
				...picked.map(({ key, asset }) => ({
					key,
					uri: asset.uri,
					status: "uploading" as const,
				})),
			]);
			enqueue(picked.map(({ key }) => key));
		},
		[enqueue, showError, t],
	);

	return {
		pending,
		pick,
		retry,
		remove,
		uploading: pending.some((p) => p.status === "uploading"),
	};
}

async function upload(
	asset: ImagePicker.ImagePickerAsset,
	alt: string,
): Promise<UploadedPhoto> {
	const defaultBaseName = `photo_${Date.now()}`;
	const formData = await createMediaUploadFormData(asset, {
		defaultBaseName,
		alt: alt || asset.fileName || defaultBaseName,
	});
	const uploaded = await api.upload<{ doc: { id: string; url: string } }>(
		"/api/media",
		formData,
	);
	const id = uploaded?.doc?.id;
	if (!id) throw new Error("upload_failed");
	return { id, uri: uploaded.doc.url ?? asset.uri };
}
