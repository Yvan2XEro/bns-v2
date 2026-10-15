import { SELLER_RETURN_ACTIONS } from "../../../api/src/contracts/returnInputs";
import type { ReturnAction } from "../../../api/src/contracts/returns";

const sellerActions: ReadonlySet<ReturnAction> = new Set(SELLER_RETURN_ACTIONS);

export function sellerReturnActions(actions: readonly ReturnAction[]) {
	return actions.filter((action) => sellerActions.has(action));
}
