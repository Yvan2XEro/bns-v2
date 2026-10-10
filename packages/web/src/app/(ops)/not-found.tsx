import { useTranslations } from "next-intl";
import { NotFoundLink, NotFoundView } from "~/components/not-found-view";

export default function OpsNotFound() {
	const t = useTranslations("NotFoundOps");
	return (
		<NotFoundView title={t("title")} body={t("body")}>
			<NotFoundLink href="/moderation/verification">
				{t("verification")}
			</NotFoundLink>
			<NotFoundLink href="/moderation/disputes" secondary>
				{t("disputes")}
			</NotFoundLink>
		</NotFoundView>
	);
}
