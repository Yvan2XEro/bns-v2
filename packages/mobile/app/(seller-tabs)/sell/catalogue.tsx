import { SellerTabRootContext } from "@/src/contexts/SellerTabRootContext";
import { useActiveShop } from "@/src/hooks/useActiveShop";
import { shopProfileRules } from "@/src/lib/listingKind";
import SellerCatalogueScreen from "../../seller/catalogue";
import ShopAdsScreen from "../../seller/listings";

/** A store's catalogue; an agency's, a recruiter's or a provider's ads. */
export default function SellerCatalogueScreenTab() {
	const { shop } = useActiveShop();
	return (
		<SellerTabRootContext.Provider value>
			{shopProfileRules(shop?.profile).retail ? (
				<SellerCatalogueScreen />
			) : (
				<ShopAdsScreen />
			)}
		</SellerTabRootContext.Provider>
	);
}
