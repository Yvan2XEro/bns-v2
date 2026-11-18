import type { Payload } from "payload";
import { listAvailableCouriers } from "../../lib/delivery";
import type { Courier } from "../../payload-types";

export interface AvailableCouriersInput {
	city: Courier["cities"][number];
	scope: Courier["scopes"][number];
	cod: boolean;
}

export function availableCouriers(
	payload: Payload,
	input: AvailableCouriersInput,
): Promise<Courier[]> {
	return listAvailableCouriers(payload, input);
}
