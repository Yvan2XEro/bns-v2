import type { Access } from "payload";

export const isOwnerOrAdmin: Access = ({ req: { user } }) => {
	if (!user) return false;

	const userWithRole = user as { role?: string };
	if (userWithRole.role === "admin") return true;

	return {
		seller: {
			equals: user.id,
		},
	};
};
