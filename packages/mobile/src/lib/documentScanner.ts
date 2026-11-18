import { File } from "expo-file-system";
import { Platform, TurboModuleRegistry } from "react-native";
import { toFileUri } from "./documentCapture";
import type { PickedFile } from "./verificationBusiness";

const NATIVE_MODULE = "DocumentScanner";

/**
 * True only when the running binary ships the scanner. The package resolves
 * its native module with `getEnforcing` at import time, so it is never
 * imported before this check passes — an older build keeps working on the
 * pickers instead of crashing.
 */
export function isDocumentScannerAvailable(): boolean {
	if (Platform.OS !== "ios" && Platform.OS !== "android") return false;
	try {
		return TurboModuleRegistry.get(NATIVE_MODULE) != null;
	} catch {
		return false;
	}
}

export type ScanOutcome =
	| { status: "success"; pages: PickedFile[] }
	| { status: "cancel" }
	| { status: "unavailable" };

function sizeOf(uri: string): number | null {
	try {
		const size = new File(uri).size;
		return typeof size === "number" ? size : null;
	} catch {
		return null;
	}
}

/**
 * Opens the system scanner (VisionKit on iOS, ML Kit on Android): guided
 * frame, automatic edge detection and cropping, several pages per session.
 * Any native failure — Play services missing, the module absent — answers
 * `unavailable` so the caller can fall back to the plain camera.
 */
export async function scanDocumentPages(
	maxPages: number,
): Promise<ScanOutcome> {
	if (!isDocumentScannerAvailable() || maxPages < 1) {
		return { status: "unavailable" };
	}
	try {
		const { default: DocumentScanner, ResponseType } = await import(
			"react-native-document-scanner-plugin"
		);
		const result = await DocumentScanner.scanDocument({
			croppedImageQuality: 85,
			maxNumDocuments: maxPages,
			responseType: ResponseType.ImageFilePath,
		});
		const images = result.scannedImages ?? [];
		if (result.status === "cancel" || images.length === 0) {
			return { status: "cancel" };
		}
		return {
			status: "success",
			pages: images.map((path) => {
				const uri = toFileUri(path);
				return {
					uri,
					fileName: null,
					mimeType: "image/jpeg",
					size: sizeOf(uri),
				};
			}),
		};
	} catch {
		return { status: "unavailable" };
	}
}
