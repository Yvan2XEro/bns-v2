import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { Image } from "expo-image";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Fonts } from "@/constants/theme";
import { useShopTheme } from "@/src/components/shop/theme";
import { useDeclareDelivered } from "@/src/hooks/useOrderActions";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useTranslation } from "@/src/lib/i18n";
import { pickAndUploadImage } from "@/src/lib/pickAndUpload";
import { resolveImageUrl } from "@/src/lib/resolveImageUrl";
import {
	type DeclareDeliveredValues,
	declareDeliveredSchema,
	optionalNote,
} from "@/src/lib/sellerOrders";
import { FieldError, NoteField, SheetButton } from "./FormBits";
import { OrderSheet } from "./OrderSheet";

/**
 * The seller's declaration with its weaker-proof warning, always together:
 * declaring opens the buyer's 48-hour contest window, which a code does not.
 * Used in its own sheet and on the handover screen once the code locks.
 */
export function DeclareDeliveredForm({
	orderId,
	shopId,
	onDone,
}: {
	orderId: string;
	shopId: string;
	onDone: () => void;
}) {
	const c = useShopTheme();
	const { t } = useTranslation();
	const declare = useDeclareDelivered(orderId, shopId);
	const [uploading, setUploading] = useState(false);
	const form = useForm<DeclareDeliveredValues>({
		resolver: zodResolver(declareDeliveredSchema),
		defaultValues: { note: "", photo: null },
	});
	const { errors } = form.formState;
	const photo = form.watch("photo");
	const preview = resolveImageUrl(photo);

	const addPhoto = async () => {
		setUploading(true);
		form.clearErrors("photo");
		try {
			const media = await pickAndUploadImage({
				alt: t("sellerOrders.declarePhoto"),
			});
			if (media) form.setValue("photo", media.url);
		} catch (error) {
			form.setError("photo", {
				message: resolveErrorMessage(error, t, t("sellerOrders.photoFailed")),
			});
		} finally {
			setUploading(false);
		}
	};

	const submit = form.handleSubmit(async (values) => {
		try {
			await declare.mutateAsync({
				note: optionalNote(values.note),
				photo: values.photo ?? undefined,
			});
			onDone();
		} catch (error) {
			form.setError("root", {
				message: resolveErrorMessage(error, t, t("sellerOrders.actionFailed")),
			});
		}
	});

	return (
		<View style={styles.form}>
			<View style={[styles.warning, { backgroundColor: c.warningSoft }]}>
				<Ionicons name="warning-outline" size={18} color={c.warningText} />
				<Text style={[styles.warningText, { color: c.warningText }]}>
					{t("sellerOrders.declareWarning")}
				</Text>
			</View>
			<Controller
				control={form.control}
				name="note"
				render={({ field }) => (
					<NoteField
						label={t("sellerOrders.noteOptional")}
						value={field.value}
						onChange={field.onChange}
						onBlur={field.onBlur}
					/>
				)}
			/>
			{photo ? (
				<View style={styles.photoRow}>
					{preview ? (
						<Image source={{ uri: preview }} style={styles.photo} />
					) : null}
					<Text style={[styles.photoText, { color: c.body }]}>
						{t("sellerOrders.photoAdded")}
					</Text>
					<Pressable
						onPress={() => form.setValue("photo", null)}
						style={styles.iconButton}
						accessibilityRole="button"
						accessibilityLabel={t("sellerOrders.photoRemove")}
					>
						<Ionicons name="trash-outline" size={20} color={c.danger} />
					</Pressable>
				</View>
			) : (
				<SheetButton
					label={t("sellerOrders.declarePhoto")}
					tone="secondary"
					pending={uploading}
					onPress={addPhoto}
				/>
			)}
			<FieldError message={errors.photo?.message} />
			<FieldError message={errors.root?.message} />
			<SheetButton
				label={t("sellerOrders.declareDelivered")}
				pending={declare.isPending}
				disabled={uploading}
				onPress={submit}
			/>
		</View>
	);
}

export function DeclareDeliveredSheet({
	visible,
	orderId,
	shopId,
	onClose,
}: {
	visible: boolean;
	orderId: string;
	shopId: string;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	return (
		<OrderSheet
			visible={visible}
			title={t("sellerOrders.declareDelivered")}
			subtitle={t("sellerOrders.declareDeliveredBody")}
			onClose={onClose}
		>
			{visible ? (
				<DeclareDeliveredForm
					orderId={orderId}
					shopId={shopId}
					onDone={onClose}
				/>
			) : null}
		</OrderSheet>
	);
}

const styles = StyleSheet.create({
	form: { gap: 12 },
	warning: {
		flexDirection: "row",
		gap: 8,
		padding: 12,
		borderRadius: 12,
	},
	warningText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodyMedium,
	},
	photoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
	photo: { width: 56, height: 56, borderRadius: 10 },
	photoText: { flex: 1, fontSize: 14, fontFamily: Fonts.bodyMedium },
	iconButton: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
});
