import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import type { AdminViewServerProps } from "payload";
import { UserManagementClient } from "./UserManagementClient";

export async function UserManagement({
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
				<UserManagementClient />
			</Gutter>
		</DefaultTemplate>
	);
}

export default UserManagement;
