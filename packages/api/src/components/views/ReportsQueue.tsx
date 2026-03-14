import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { ReportsQueueClient } from "./ReportsQueueClient";

export async function ReportsQueue({
	initPageResult,
	params,
	searchParams,
}: AdminViewServerProps) {
	return (
		<DefaultTemplate
			i18n={initPageResult.req.i18n}
			locale={initPageResult.locale}
			params={params}
			payload={initPageResult.req.payload}
			permissions={initPageResult.permissions}
			searchParams={searchParams}
			user={initPageResult.req.user || undefined}
			visibleEntities={initPageResult.visibleEntities}
		>
			<Gutter>
				<ReportsQueueClient />
			</Gutter>
		</DefaultTemplate>
	);
}

export default ReportsQueue;
