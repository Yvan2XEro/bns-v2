import { SellerTabRootContext } from "@/src/contexts/SellerTabRootContext";
import SellerOrdersScreen from "../../seller/orders/index";

export default function SellerOrdersScreenTab() {
	return (
		<SellerTabRootContext.Provider value>
			<SellerOrdersScreen />
		</SellerTabRootContext.Provider>
	);
}
