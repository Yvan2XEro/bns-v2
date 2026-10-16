import { SellerTabRootContext } from "@/src/contexts/SellerTabRootContext";
import SellerHubScreen from "../../seller/index";

export default function SellerHubScreenTab() {
	return (
		<SellerTabRootContext.Provider value>
			<SellerHubScreen />
		</SellerTabRootContext.Provider>
	);
}
