import { SellerTabRootContext } from "@/src/contexts/SellerTabRootContext";
import SellerOrdersScreen from "../../seller/orders/index";

export default function SellerOrdersScreenTab() {
	// SellerOrdersList follows its `tab` param (and the dashboard's fresh `at`)
	// while mounted, so the tab no longer needs a remount to switch.
	return (
		<SellerTabRootContext.Provider value>
			<SellerOrdersScreen />
		</SellerTabRootContext.Provider>
	);
}
