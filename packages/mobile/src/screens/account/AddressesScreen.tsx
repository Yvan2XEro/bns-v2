import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { AddressEditor } from "@/src/components/address/AddressEditor";
import {
	CardAction,
	SavedAddressCard,
} from "@/src/components/address/SavedAddressCard";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { EmptyState } from "@/src/components/EmptyState";
import { HeaderBackButton } from "@/src/components/layout/HeaderBackButton";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { useShopTheme } from "@/src/components/shop/theme";
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
	const c = useShopTheme();
	const { t } = useTranslation();
	const { user } = useAuth();
	const { showConfirm } = useAlert();
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
	const actionError = remove.error ?? makeDefault.error;
	const saveError =
		save.error && !addressFieldOf(save.error)
			? resolveErrorMessage(save.error, t)
			: null;

	const startEditing = (id: string | null) => {
		save.reset();
		setEditing({ id });
	};

	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<View style={[styles.header, { borderBottomColor: c.border }]}>
				{editing ? (
					// Back from the form to the list, inside this screen.
					<Pressable
						onPress={() => setEditing(null)}
						accessibilityRole="button"
						accessibilityLabel={t("common.back")}
						style={styles.back}
					>
						<Ionicons name="arrow-back" size={22} color={c.text} />
					</Pressable>
				) : (
					<HeaderBackButton
						color={c.text}
						fallback="/(tabs)/account"
						style={styles.back}
					/>
				)}
				<Text style={[styles.title, { color: c.text }]}>
					{editing
						? editingAddress
							? t("addresses.editTitle")
							: t("addresses.newTitle")
						: t("addresses.title")}
				</Text>
			</View>
			<ScreenColumn width="reading">
				<KeyboardAwareScrollView
					contentContainerStyle={{ padding: 16, gap: 12 }}
					keyboardShouldPersistTaps="handled"
				>
					{list.isPending ? (
						<ActivityIndicator style={{ marginTop: 32 }} color={c.primary} />
					) : null}
					{list.isError ? (
						<View style={{ gap: 12 }}>
							<Text style={{ color: c.dangerText }}>
								{t("addresses.loadError")}
							</Text>
							<CheckoutButton
								label={t("common.retry")}
								variant="outline"
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
							<Text style={[styles.subtitle, { color: c.muted }]}>
								{t("addresses.subtitle")}
							</Text>
							{addresses.length === 0 ? (
								<EmptyState
									icon="location-outline"
									title={t("addresses.emptyTitle")}
									subtitle={t("addresses.emptyBody")}
								/>
							) : (
								<Text style={[styles.subtitle, { color: c.muted }]}>
									{t("addresses.count", {
										count: addresses.length,
										limit: list.data.limit,
									})}
								</Text>
							)}
							{actionError ? (
								<Text style={{ color: c.dangerText }}>
									{resolveErrorMessage(actionError, t)}
								</Text>
							) : null}
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
													onPress={() => makeDefault.mutate(address.id)}
												/>
											) : null}
											<CardAction
												label={t("addresses.edit")}
												onPress={() => startEditing(address.id)}
											/>
											<CardAction
												label={t("addresses.delete")}
												tone="danger"
												disabled={remove.isPending}
												onPress={() =>
													showConfirm(
														t("addresses.deleteTitle"),
														t("addresses.deleteConfirm"),
														() => remove.mutate(address.id),
													)
												}
											/>
										</>
									}
								/>
							))}
							{full ? (
								<Text style={[styles.subtitle, { color: c.muted }]}>
									{t("addresses.limitReached")}
								</Text>
							) : (
								<CheckoutButton
									label={t("addresses.add")}
									icon="add"
									onPress={() => startEditing(null)}
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
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderBottomWidth: 1,
	},
	back: { minWidth: 44, minHeight: 44, justifyContent: "center" },
	title: { fontSize: 18, fontFamily: Fonts.displayBold },
	subtitle: { fontSize: 13, fontFamily: Fonts.body },
});
