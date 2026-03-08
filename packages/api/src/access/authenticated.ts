import type { Access } from "payload";

export const authenticated: Access = ({ req: { user } }) => {
	return Boolean(user);
};
