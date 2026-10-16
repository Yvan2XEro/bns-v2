import { SellerTabRootContext } from "@/src/contexts/SellerTabRootContext";
import SellerInboxScreen from "../../seller/inbox/index";

export default function SellerInboxScreenTab() {
	return (
		<SellerTabRootContext.Provider value>
			<SellerInboxScreen />
		</SellerTabRootContext.Provider>
	);
}
