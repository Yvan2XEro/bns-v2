"use client";

import { useTranslations } from "next-intl";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { TeamMemberView } from "~/types";

/**
 * The two confirmation dialogs `TeamClient` opens from a member row: remove
 * (destructive, needs an explicit confirm) and change-role (a two-option
 * picker defaulting to the flip of the member's current role). Split out of
 * `team-client.tsx` to keep the orchestrator under ~200 lines.
 */
export function MemberActionDialogs({
	confirmRemove,
	roleTarget,
	removePending,
	onCloseRemove,
	onConfirmRemove,
	onCloseRole,
	onApplyRoleChange,
}: {
	confirmRemove: TeamMemberView | null;
	roleTarget: TeamMemberView | null;
	removePending: boolean;
	onCloseRemove: () => void;
	onConfirmRemove: () => void;
	onCloseRole: () => void;
	onApplyRoleChange: (next: "manager" | "staff") => void;
}) {
	const t = useTranslations("Team");
	const tRoot = useTranslations();
	const flippedRole = roleTarget?.role === "manager" ? "staff" : "manager";

	return (
		<>
			<Dialog
				open={confirmRemove !== null}
				onOpenChange={(open) => !open && onCloseRemove()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("remove")}</DialogTitle>
						<DialogDescription>
							{t("removeConfirm", { name: confirmRemove?.name ?? "" })}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={onCloseRemove}>
							{tRoot("Common.cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={removePending}
							onClick={onConfirmRemove}
						>
							{t("remove")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={roleTarget !== null}
				onOpenChange={(open) => !open && onCloseRole()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t("changeRole")}</DialogTitle>
						<DialogDescription>{roleTarget?.name}</DialogDescription>
					</DialogHeader>
					<Select
						value={flippedRole}
						onValueChange={(next) =>
							onApplyRoleChange(next as "manager" | "staff")
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="manager">{t("roleManager")}</SelectItem>
							<SelectItem value="staff">{t("roleStaff")}</SelectItem>
						</SelectContent>
					</Select>
				</DialogContent>
			</Dialog>
		</>
	);
}
