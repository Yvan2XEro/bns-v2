import type { Href } from "expo-router";
import { SplitScreen } from "@/src/components/layout/SplitScreen";
import { useTranslation } from "@/src/lib/i18n";
import { ListingDetail } from "@/src/screens/listing/ListingDetail";
import { SearchResults } from "@/src/screens/search/SearchResults";

const listingHref = (id: string): Href => `/listing/${id}`;

export default function SearchRoute() {
	const { t } = useTranslation();
	return (
		<SplitScreen
			detailHref={listingHref}
			renderList={(props) => <SearchResults {...props} />}
			renderDetail={(id) => <ListingDetail id={id} />}
			empty={{ illustration: "searching", title: t("split.selectListing") }}
		/>
	);
}
