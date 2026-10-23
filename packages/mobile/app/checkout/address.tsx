import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Fonts } from "@/constants/theme";
import { AddressEditor } from "@/src/components/address/AddressEditor";
import {
	CardAction,
	SavedAddressCard,
} from "@/src/components/address/SavedAddressCard";
import { CheckoutButton } from "@/src/components/checkout/CheckoutButton";
import { CheckoutGate } from "@/src/components/checkout/CheckoutGate";
import { CheckoutHeader } from "@/src/components/checkout/CheckoutHeader";
import {
	type AddressChoice,
	useCheckoutFlow,
} from "@/src/components/checkout/CheckoutProvider";
import { ScreenColumn } from "@/src/components/layout/ScreenColumn";
import { useShopTheme } from "@/src/components/shop/theme";
import { useAlert } from "@/src/contexts/AlertContext";
import { useAppConfig } from "@/src/contexts/AppConfigContext";
import {
	useDeleteAddress,
	useSaveAddress,
	useSavedAddresses,
} from "@/src/hooks/useAddresses";
import { useCart } from "@/src/hooks/useCart";
import { resolveErrorMessage } from "@/src/lib/apiError";
import { addressFieldOf } from "@/src/lib/checkoutForm";
import { isSplitCart } from "@/src/lib/checkoutGroupFlow";
import { useTranslation } from "@/src/lib/i18n";
import {
	preselectedAddress,
	SAVED_ADDRESS_LIMIT,
	type SavedAddress,
	savedAddressBody,
	savedAddressToInput,
	savedAddressUsable,
} from "@/src/lib/savedAddresses";
import type { AddressInput } from "@/src/types/order";

export default function CheckoutAddressScreen() {
	const c = useShopTheme();
	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
			<CheckoutHeader current={1} />
			<CheckoutGate>
				<AddressStep />
			</CheckoutGate>
		</SafeAreaView>
	);
}

type Mode = "list" | "new" | { edit: string };

function AddressStep() {
	const c = useShopTheme();
	const { t } = useTranslation();
	const { showConfirm } = useAlert();
	const { launchCities } = useAppConfig();
	const cart = useCart();
	const { state, dispatch, addressChoice, setAddressChoice } =
		useCheckoutFlow();
	const saved = useSavedAddresses();
	const save = useSaveAddress();
	const remove = useDeleteAddress();
	const shopCity =
		cart.data && !isSplitCart(cart.data)
			? (cart.data.shop?.city ?? null)
			: null;
	const servedCity = launchCities.some((city) => city.key === shopCity)
		? shopCity
		: null;
	const method = state.option?.method ?? "seller_delivery";
	const rejected = state.addressError;
	const addresses = saved.data?.addresses ?? [];
	const usable = (address: SavedAddress) =>
		savedAddressUsable(address, {
			cityKeys: launchCities.map((city) => city.key),
			servedCity,
		});
	const [mode, setMode] = useState<Mode | null>(null);
	const [picked, setPicked] = useState<string | null>(addressChoice.savedId);

	const proceed = (address: AddressInput, choice: AddressChoice) => {
		setAddressChoice(choice);
		dispatch({ type: "addressSubmitted", address });
		router.push("/checkout/delivery");
	};

	if (saved.isPending) {
		return <ActivityIndicator style={{ marginTop: 32 }} color={c.primary} />;
	}

	// A refused address goes back to the form it came from, prefilled.
	const current: Mode =
		mode ??
		(rejected || addresses.length === 0
			? rejected && addressChoice.savedId
				? { edit: addressChoice.savedId }
				: "new"
			: "list");
	const cityLabel = (key: string) =>
		launchCities.find((city) => city.key === key)?.label ?? key;
	const full = addresses.length >= SAVED_ADDRESS_LIMIT;
	const editing =
		typeof current === "object"
			? (addresses.find((a) => a.id === current.edit) ?? null)
			: null;
	const usableOnes = addresses.filter(usable);
	const selectedId =
		picked && usableOnes.some((a) => a.id === picked)
			? picked
			: (preselectedAddress(usableOnes)?.id ?? null);
	const selected = addresses.find((a) => a.id === selectedId) ?? null;
	const saveError =
		save.error && !addressFieldOf(save.error)
			? resolveErrorMessage(save.error, t)
			: null;

	return (
		<ScreenColumn width="reading">
			<KeyboardAwareScrollView
				contentContainerStyle={{ padding: 16, gap: 16 }}
				keyboardShouldPersistTaps="handled"
			>
				{addresses.length > 0 && !editing ? (
					<View
						style={{
							flexDirection: "row",
							gap: 8,
							backgroundColor: c.card,
							borderRadius: 12,
							padding: 4,
							borderWidth: 1,
							borderColor: c.border,
						}}
					>
						{(["list", "new"] as const).map((tab) => {
							const on = current === tab;
							return (
								<Pressable
									key={tab}
									onPress={() => setMode(tab)}
									accessibilityRole="tab"
									accessibilityState={{ selected: on }}
									style={{
										flex: 1,
										minHeight: 44,
										alignItems: "center",
										justifyContent: "center",
										borderRadius: 9,
										backgroundColor: on ? c.primarySoft : "transparent",
									}}
								>
									<Text
										style={{
											fontFamily: Fonts.bodySemibold,
											color: on ? c.primary : c.muted,
										}}
									>
										{tab === "list"
											? t("addresses.savedTab")
											: t("addresses.newTab")}
									</Text>
								</Pressable>
							);
						})}
					</View>
				) : null}

				{editing ? (
					<AddressEditor
						key={editing.id}
						initial={savedAddressToInput(editing)}
						launchCities={launchCities}
						servedCity={servedCity}
						method={method}
						rejectedField={addressFieldOf(save.error) ?? rejected}
						formError={saveError}
						extra="book"
						initialLabel={editing.label ?? ""}
						initialDefault={editing.isDefault}
						submitLabel={t("addresses.saveAndUse")}
						pending={save.isPending}
						onCancel={() => setMode("list")}
						onSubmit={(address, meta) =>
							save.mutate(
								{
									id: editing.id,
									body: savedAddressBody(address, {
										label: meta.label,
										isDefault: meta.isDefault,
									}),
								},
								{
									onSuccess: (updated) => {
										setMode(null);
										setPicked(updated.id);
										proceed(savedAddressToInput(updated), {
											savedId: updated.id,
											save: null,
										});
									},
								},
							)
						}
					/>
				) : current === "list" ? (
					<View style={{ gap: 12 }}>
						{addresses.map((address) => (
							<SavedAddressCard
								key={address.id}
								address={address}
								cityLabel={cityLabel(address.city)}
								selected={address.id === selectedId}
								disabledReason={
									usable(address)
										? null
										: servedCity !== null && address.city !== servedCity
											? t("addresses.otherCity")
											: t("addresses.incomplete")
								}
								onSelect={() => setPicked(address.id)}
								actions={
									<>
										<CardAction
											label={t("addresses.edit")}
											onPress={() => setMode({ edit: address.id })}
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
						<CheckoutButton
							label={t("addresses.useThisAddress")}
							disabled={!selected}
							onPress={() =>
								selected &&
								proceed(savedAddressToInput(selected), {
									savedId: selected.id,
									save: null,
								})
							}
						/>
					</View>
				) : (
					<AddressEditor
						initial={state.address}
						launchCities={launchCities}
						servedCity={servedCity}
						method={method}
						rejectedField={rejected}
						extra={full ? undefined : "save"}
						submitLabel={t("checkout.continue")}
						onSubmit={(address, meta) => {
							setMode(null);
							proceed(address, {
								savedId: null,
								save: meta.save ? { label: meta.label } : null,
							});
						}}
					/>
				)}
			</KeyboardAwareScrollView>
		</ScreenColumn>
	);
}
