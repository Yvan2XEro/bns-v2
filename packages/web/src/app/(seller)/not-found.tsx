import { useTranslations } from "next-intl";
import { NotFoundLink, NotFoundView } from "~/components/not-found-view";

export default function SellerNotFound() {
	const t = useTranslations("NotFoundSeller");
	return (
		<NotFoundView title={t("title")} body={t("body")}>
			<NotFoundLink href="/seller">{t("dashboard")}</NotFoundLink>
		</NotFoundView>
	);
}
