import { useTranslations } from "next-intl";
import { NotFoundLink, NotFoundView } from "~/components/not-found-view";

export default function NotFound() {
	const t = useTranslations("NotFound");
	return (
		<NotFoundView title={t("title")} body={t("description")}>
			<NotFoundLink href="/">{t("backHome")}</NotFoundLink>
		</NotFoundView>
	);
}
