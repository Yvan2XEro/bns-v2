import { Stack } from "expo-router";
import { CheckoutProvider } from "@/src/components/checkout/CheckoutProvider";

export default function CheckoutLayout() {
	return (
		<CheckoutProvider>
			<Stack screenOptions={{ headerShown: false }} />
		</CheckoutProvider>
	);
}
