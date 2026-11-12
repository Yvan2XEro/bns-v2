import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { AddressEditor } from "@/src/components/address/AddressEditor";
import {
	CardAction,
	SavedAddressCard,
} from "@/src/components/address/SavedAddressCard";
import { FormError } from "@/src/components/checkout/FormError";
import { OrderListSkeleton } from "@/src/components/checkout/OrderListSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { FormButton } from "@/src/components/settings/FormButton";
import { useGroupedColors } from "@/src/components/settings/Grouped";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import {
	useDeleteAddress,
	useMakeDefaultAddress,
	useSaveAddress,
	useSavedAddresses,
} from "@/src/hooks/useAddresses";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { useAuth } from "@/src/lib/auth";
import { addressFieldOf } from "@/src/lib/checkoutForm";
import { useTranslation } from "@/src/lib/i18n";
import {
	SAVED_ADDRESS_LIMIT,
	savedAddressBody,
	savedAddressToInput,
} from "@/src/lib/savedAddresses";

/** « Mes adresses »: the buyer's address book, at most ten, one default. */
export function AddressesScreen() {
	const c = useGroupedColors();
	const { t } = useTranslation();
	const { user } = useAuth();
	const { showConfirm, showError } = useAlert();
	const { launchCities } = useAppConfig();
	const list = useSavedAddresses(Boolean(user));
	const save = useSaveAddress();
	const remove = useDeleteAddress();
	const makeDefault = useMakeDefaultAddress();
	const [editing, setEditing] = useState<{ id: string | null } | null>(null);
	const addresses = list.data?.addresses ?? [];
	const full = addresses.length >= SAVED_ADDRESS_LIMIT;
	const cityLabel = (key: string) =>
		launchCities.find((city) => city.key === key)?.label ?? key;
	const editingAddress =
		editing?.id != null
			? (addresses.find((a) => a.id === editing.id) ?? null)
			: null;
	const saveError =
		save.error && !addressFieldOf(save.error)
			? resolveErrorMessage(save.error, t)
			: null;

	const startEditing = (id: string | null) => {
		save.reset();
		setEditing({ id });
	};

	// System back (Android button, iOS swipe) does what the drawn arrow
	// does while the form is open: back to the list, not out of the screen
	// with a half-typed address lost.
	const navigation = useNavigation();
	const isEditing = editing !== null;
	useEffect(() => {
		if (!isEditing) return;
		return navigation.addListener("beforeRemove", (event) => {
			event.preventDefault();
			setEditing(null);
		});
	}, [isEditing, navigation]);

	// A failed delete or default is said in a sheet: a line at the top of the
	// list would be off screen for the last card.
	const reportActionError = (err: unknown) =>
		showError(t("common.error"), resolveErrorMessage(err, t));

	return (
		<SafeAreaView
			edges={["top"]}
			style={[styles.safe, { backgroundColor: c.background }]}
		>
			{/* SettingsHeader's bar, with a back that leaves the form for the
			    list without leaving the screen. */}
			<View
				style={[
					styles.header,
					{ backgroundColor: c.background, borderBottomColor: c.border },
				]}
			>
				<View style={styles.side}>
					{editing ? (
						// Back from the form to the list, inside this screen.
						<Pressable
							onPress={() => setEditing(null)}
							accessibilityRole="button"
							accessibilityLabel={t("common.back")}
							style={styles.back}
						>
							<Ionicons name="arrow-back" size={22} color={c.foreground} />
						</Pressable>
					) : (
						<HeaderBackButton
							color={c.foreground}
							fallback="/(tabs)/account"
							style={styles.back}
						/>
					)}
				</View>
				<Text
					accessibilityRole="header"
					numberOfLines={1}
					style={[styles.title, { color: c.foreground }]}
				>
					{editing
						? editingAddress
							? t("addresses.editTitle")
							: t("addresses.newTitle")
						: t("addresses.title")}
				</Text>
				<View style={styles.side} />
			</View>
			<ScreenColumn width="reading">
				<KeyboardAwareScrollView
					contentContainerStyle={styles.scroll}
					keyboardShouldPersistTaps="handled"
				>
					{list.isPending && !editing ? <OrderListSkeleton rows={3} /> : null}
					{list.isError ? (
						<View style={styles.stack}>
							<FormError message={t("addresses.loadError")} />
							<FormButton
								label={t("common.retry")}
								variant="secondary"
								onPress={() => void list.refetch()}
							/>
						</View>
					) : null}

					{editing ? (
						<AddressEditor
							key={editing.id ?? "new"}
							initial={
								editingAddress ? savedAddressToInput(editingAddress) : null
							}
							launchCities={launchCities}
							servedCity={null}
							method="seller_delivery"
							rejectedField={addressFieldOf(save.error)}
							formError={saveError}
							extra="book"
							initialLabel={editingAddress?.label ?? ""}
							initialDefault={editingAddress?.isDefault ?? false}
							submitLabel={t("addresses.save")}
							pending={save.isPending}
							onCancel={() => setEditing(null)}
							onSubmit={(address, meta) =>
								save.mutate(
									{
										id: editingAddress?.id ?? null,
										body: savedAddressBody(address, {
											label: meta.label,
											isDefault: meta.isDefault,
										}),
									},
									{ onSuccess: () => setEditing(null) },
								)
							}
						/>
					) : list.data ? (
						<>
							<Text style={[styles.subtitle, { color: c.mutedForeground }]}>
								{t("addresses.subtitle")}
							</Text>
							{addresses.length === 0 ? (
								<EmptyState
									icon="location-outline"
									title={t("addresses.emptyTitle")}
									subtitle={t("addresses.emptyBody")}
								/>
							) : (
								<Text style={[styles.count, { color: c.mutedForeground }]}>
									{t("addresses.count", {
										count: addresses.length,
										limit: list.data.limit,
									})}
								</Text>
							)}
							{addresses.map((address) => (
								<SavedAddressCard
									key={address.id}
									address={address}
									cityLabel={cityLabel(address.city)}
									actions={
										<>
											{!address.isDefault ? (
												<CardAction
													label={t("addresses.setDefault")}
													disabled={makeDefault.isPending}
													target={address.label ?? address.recipientName}
													onPress={() =>
														makeDefault.mutate(address.id, {
															onError: reportActionError,
														})
													}
												/>
											) : null}
											<CardAction
												label={t("addresses.edit")}
												target={address.label ?? address.recipientName}
												onPress={() => startEditing(address.id)}
											/>
											<CardAction
												label={t("addresses.delete")}
												tone="danger"
												target={address.label ?? address.recipientName}
												disabled={remove.isPending}
												onPress={() =>
													showConfirm(
														t("addresses.deleteTitle"),
														t("addresses.deleteConfirm"),
														() =>
															remove.mutate(address.id, {
																onError: reportActionError,
															}),
													)
												}
											/>
										</>
									}
								/>
							))}
							{full ? (
								<Text style={[styles.subtitle, { color: c.mutedForeground }]}>
									{t("addresses.limitReached")}
								</Text>
							) : (
								<FormButton
									label={t("addresses.add")}
									onPress={() => startEditing(null)}
									style={styles.addButton}
								/>
							)}
						</>
					) : null}
				</KeyboardAwareScrollView>
			</ScreenColumn>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		minHeight: 56,
		paddingHorizontal: 4,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
	back: {
		width: 48,
		height: 48,
		alignItems: "center",
		justifyContent: "center",
	},
	side: { width: 48 },
	title: {
		flex: 1,
		textAlign: "center",
		fontFamily: Fonts.displayBold,
		fontSize: 18,
		lineHeight: 23,
		letterSpacing: -0.2,
	},
	scroll: { padding: 16, paddingTop: 20, paddingBottom: 48, gap: 12 },
	stack: { gap: 12 },
	subtitle: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.body },
	count: {
		fontSize: 13,
		lineHeight: 18,
		fontFamily: Fonts.bodySemibold,
		marginTop: 8,
		marginLeft: 16,
	},
	addButton: { marginTop: 8 },
});
