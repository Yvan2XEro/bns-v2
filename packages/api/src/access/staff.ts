import type { Access, FieldAccess } from "payload";
import { isModerator } from "./roles";

export const staffOnly: Access = ({ req: { user } }) =>
	isModerator(user as { role?: string } | null);

/** Field-level twin of `staffOnly`, for fields only staff may read. */
export const staffOnlyField: FieldAccess = ({ req: { user } }) =>
	isModerator(user as { role?: string } | null);

/** For records only a service may write, with overrideAccess. */
export const nobody: Access = () => false;

export const selfOrStaffField: FieldAccess = ({ req: { user }, id, doc }) => {
	if (!user) return false;
	if (isModerator(user as { role?: string })) return true;
	const targetId = id ?? (doc as { id?: unknown } | undefined)?.id;
	return targetId !== undefined && String(targetId) === String(user.id);
};
