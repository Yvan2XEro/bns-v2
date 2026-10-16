import { SellerTabRootContext } from "@/src/contexts/SellerTabRootContext";
import SellerCatalogueScreen from "../../seller/catalogue";

export default function SellerCatalogueScreenTab() {
	return (
		<SellerTabRootContext.Provider value>
			<SellerCatalogueScreen />
		</SellerTabRootContext.Provider>
	);
}
