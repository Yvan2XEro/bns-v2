import type { Access, Where } from "payload";
import { relationId } from "../lib/relationId";
import { isModerator } from "./roles";
import { memberShopIds } from "./shopRoles";

export function casePartyRead(
	options: {
		buyerField?: string;
		buyerFields?: string[];
		shopFields?: string[];
		constraints?: Where[];
	} = {},
): Access {
	return async ({ req }) => {
		if (isModerator(req.user)) return true;
		const buyer = relationId(req.user);
		if (!buyer) return false;
		const shops = await memberShopIds(req);
		const clauses: Where[] = (
			options.buyerFields ?? [options.buyerField ?? "buyer"]
		).map((field) => ({ [field]: { equals: buyer } }) as Where);
		for (const field of options.shopFields ?? ["shop"]) {
			if (shops.length > 0) clauses.push({ [field]: { in: shops } } as Where);
		}
		const partyWhere: Where = { or: clauses };
		return options.constraints?.length
			? { and: [...options.constraints, partyWhere] }
			: partyWhere;
	};
}

export const serviceOnly = () => false;
