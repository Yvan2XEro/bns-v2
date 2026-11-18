import { useTranslations } from "next-intl";
import { NotFoundLink, NotFoundView } from "~/components/not-found-view";

export default function CheckoutNotFound() {
	const t = useTranslations("NotFoundCheckout");
	return (
		<NotFoundView title={t("title")} body={t("body")} className="min-h-[50vh]">
			<NotFoundLink href="/cart">{t("cart")}</NotFoundLink>
		</NotFoundView>
	);
}
