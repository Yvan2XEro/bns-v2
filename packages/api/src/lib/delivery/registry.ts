import type { Payload } from "payload";
import type { Courier } from "../../payload-types";
import { isLaunchCityKey } from "../launchCities";
import { FakeCourierProvider } from "./fakeCourier";
import { ManualCourierProvider } from "./manualCourier";
import { CourierNotConfiguredError } from "./providerErrors";
import type { CourierProvider, CourierProviderId } from "./types";
import { YangoCourierProvider } from "./yangoCourier";

export {
	CourierCapabilityError,
	CourierNotConfiguredError,
	CourierUnavailableError,
} from "./providerErrors";

export interface CourierProviderDeps {
	env?: NodeJS.ProcessEnv;
	payload?: Payload;
	courier?: Courier;
}

export type CourierProviderFactory = (
	deps: CourierProviderDeps,
) => CourierProvider;

export function courierAdapterPresenceRefusal(
	delivery: unknown,
	couriers: readonly Pick<Courier, "provider" | "status">[] = [],
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	if (
		typeof delivery !== "object" ||
		delivery === null ||
		!("couriersEnabled" in delivery) ||
		delivery.couriersEnabled !== true
	) {
		return null;
	}
	const providerIds = new Set(
		couriers
			.filter((courier) => courier.status === "active")
			.map((courier) => courier.provider),
	);
	for (const id of providerIds) {
		if (!hasCourierProvider(id, env)) {
			return `Partner couriers cannot be enabled: no working adapter for "${id}" is configured.`;
		}
	}
	return null;
}

const factories = new Map<CourierProviderId, CourierProviderFactory>();
let fake: FakeCourierProvider | undefined;

export function registerCourierProvider(
	id: CourierProviderId,
	factory: CourierProviderFactory,
): () => void {
	factories.set(id, factory);
	return () => {
		if (factories.get(id) === factory) factories.delete(id);
	};
}

export function getCourierProvider(
	id: CourierProviderId,
	deps: CourierProviderDeps = {},
): CourierProvider {
	const env = deps.env ?? process.env;
	if (env.COURIER_PROVIDER === "fake") {
		fake ??= new FakeCourierProvider();
		return fake;
	}
	const factory = factories.get(id);
	if (!factory) throw new CourierNotConfiguredError(id);
	return factory({ ...deps, env });
}

export function hasCourierProvider(
	id: CourierProviderId,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	if (id === "manual") return true;
	if (env.COURIER_PROVIDER === "fake") return true;
	if (id === "yango")
		return Boolean(
			env.YANGO_DELIVERY_BASE_URL &&
				env.YANGO_DELIVERY_API_KEY &&
				env.YANGO_DELIVERY_WEBHOOK_SECRET &&
				factories.has(id),
		);
	return factories.has(id);
}

export async function listAvailableCouriers(
	payload: Payload,
	input: {
		city: string;
		scope: "same_city" | "intercity";
		cod: boolean;
	},
): Promise<Courier[]> {
	const results = await payload.find({
		collection: "couriers",
		where: { status: { equals: "active" } },
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	return results.docs.filter((courier) => {
		if (
			!isLaunchCityKey(input.city) ||
			!courier.cities.includes(input.city) ||
			!courier.scopes.includes(input.scope) ||
			(input.cod && !courier.supportsCod) ||
			!hasCourierProvider(courier.provider)
		) {
			return false;
		}
		try {
			const provider = getCourierProvider(courier.provider, {
				payload,
				courier,
			});
			return (
				provider.capabilities.quote &&
				(!input.cod || provider.capabilities.cod) &&
				(input.scope !== "intercity" || provider.capabilities.intercity)
			);
		} catch {
			return false;
		}
	});
}

registerCourierProvider("manual", ({ courier, payload }) => {
	if (!courier || !payload) throw new CourierNotConfiguredError("manual");
	return new ManualCourierProvider(courier, payload);
});
registerCourierProvider("yango", ({ env }) => new YangoCourierProvider(env));
