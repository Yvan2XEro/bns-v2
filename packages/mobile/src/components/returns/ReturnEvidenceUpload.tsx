import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useUploadReturnEvidence } from "@/src/hooks/useReturns";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { useShopTheme } from "../shop/theme";

export function ReturnEvidenceUpload({
	caseId,
	kind,
	evidenceIds,
	onChange,
}: {
	caseId: string;
	kind: "photo" | "payment_proof";
	evidenceIds: string[];
	onChange: (ids: string[]) => void;
}) {
	const { t } = useTranslation();
	const c = useShopTheme();
	const upload = useUploadReturnEvidence(caseId);
	const [error, setError] = useState<string | null>(null);
	const [picking, setPicking] = useState(false);
	const add = async () => {
		setPicking(true);
		setError(null);
		try {
			const result = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ["images"],
				quality: 0.8,
			});
			if (result.canceled) return;
			const asset = result.assets[0];
			if (!asset) return;
			const saved = await upload.mutateAsync({
				uri: asset.uri,
				fileName: asset.fileName ?? null,
				kind,
			});
			onChange([...evidenceIds, saved.id]);
		} catch (cause) {
			setError(resolveErrorMessage(cause, t));
		} finally {
			setPicking(false);
		}
	};
	const pending = picking || upload.isPending;
	return (
		<View style={{ gap: 8 }}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t("returns.evidenceUpload")}
				disabled={pending || evidenceIds.length >= 10}
				onPress={() => void add()}
				style={{
					minHeight: 44,
					justifyContent: "center",
					padding: 12,
					borderWidth: 1,
					borderColor: c.border,
					borderRadius: 10,
					opacity: pending ? 0.5 : 1,
				}}
			>
				<Text style={{ color: c.primary }}>
					{t(pending ? "returns.evidenceUploading" : "returns.evidenceUpload")}
				</Text>
			</Pressable>
			<Text style={{ color: c.muted }}>
				{t("returns.evidenceCount", { count: evidenceIds.length })}
			</Text>
			{evidenceIds.map((id, index) => (
				<Pressable
					key={id}
					accessibilityRole="button"
					accessibilityLabel={t("returns.removeEvidence", {
						number: index + 1,
					})}
					disabled={pending}
					onPress={() => onChange(evidenceIds.filter((value) => value !== id))}
					style={{ minHeight: 44, justifyContent: "center" }}
				>
					<Text style={{ color: c.primary }}>
						{t("returns.removeEvidence", { number: index + 1 })}
					</Text>
				</Pressable>
			))}
			{error ? (
				<Text accessibilityRole="alert" style={{ color: "#dc2626" }}>
					{error}
				</Text>
			) : null}
		</View>
	);
}
