import { useTranslations } from "next-intl";
import { NotFoundLink, NotFoundView } from "~/components/not-found-view";

export default function PublicNotFound() {
	const t = useTranslations("NotFoundPublic");
	return (
		<NotFoundView title={t("title")} body={t("body")}>
			<NotFoundLink href="/">{t("home")}</NotFoundLink>
			<NotFoundLink href="/search" secondary>
				{t("search")}
			</NotFoundLink>
		</NotFoundView>
	);
}
