/**
 * Android notification channels. The API names one on every push and the app
 * creates them, so a seller can give new orders their own sound without
 * hearing it for every message.
 */
export const PUSH_CHANNELS = {
	default: "default",
	/** Orders waiting for the shop's answer: max priority, own sound. */
	orders: "orders",
} as const;

export type PushChannel = (typeof PUSH_CHANNELS)[keyof typeof PUSH_CHANNELS];

const SHOP_ORDER_EVENTS = new Set([
	"order-confirmation-needed",
	"order-accept-reminder",
	"order-stale-reminder",
]);

/** The channel a push goes out on, from its workflow and its audience. */
export function pushChannelFor(
	event: string,
	audience: string | undefined,
): PushChannel {
	if (SHOP_ORDER_EVENTS.has(event)) return PUSH_CHANNELS.orders;
	if (event === "order-placed" && audience === "shop")
		return PUSH_CHANNELS.orders;
	return PUSH_CHANNELS.default;
}
