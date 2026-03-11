export interface User {
	id: number;
	name: string;
	avatar?: { id: number; url?: string } | null;
	role: "user" | "moderator" | "admin";
	rating?: number | null;
	totalReviews?: number | null;
	bio?: string | null;
	phone?: string | null;
	location?: string | null;
	verified?: boolean | null;
	createdAt: string;
	updatedAt: string;
	email: string;
}

export interface Media {
	id: number;
	alt: string;
	updatedAt: string;
	createdAt: string;
	url?: string | null;
	thumbnailURL?: string | null;
	filename?: string | null;
	mimeType?: string | null;
	filesize?: number | null;
	width?: number | null;
	height?: number | null;
}

export interface Category {
	id: number;
	name: string;
	slug: string;
	description?: string | null;
	icon?: string | null;
	image?: Media | null;
	parent?: Category | null;
	active?: boolean | null;
	attributes?: CategoryAttribute[];
	createdAt: string;
	updatedAt: string;
}

export interface Listing {
	id: number;
	title: string;
	description: string;
	price: number;
	images?: { image: Media }[] | null;
	location: string;
	seller?: User | null;
	category: Category | number;
	status: "draft" | "published" | "sold" | "deleted";
	boostedUntil?: string | null;
	views?: number | null;
	attributes?:
		| Record<string, unknown>
		| unknown[]
		| string
		| number
		| boolean
		| null;
	condition?: ListingCondition | null;
	createdAt: string;
	updatedAt: string;
}

export interface Favorite {
	id: number;
	user: User | number;
	listing: Listing | number;
	createdAt: string;
	updatedAt: string;
}

export interface Conversation {
	id: number;
	participants: (User | number)[];
	listing?: Listing | null;
	lastMessage?: Message | null;
	updatedAt: string;
	createdAt: string;
}

export interface Message {
	id: number;
	conversation: Conversation | number;
	sender: User | number;
	content: string;
	read?: boolean | null;
	createdAt: string;
	updatedAt: string;
}

export interface Review {
	id: number;
	reviewer: User | number;
	reviewedUser: User | number;
	listing?: Listing | null;
	rating: number;
	comment?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Report {
	id: number;
	reporter: User | number;
	targetType: "listing" | "user" | "message";
	targetId: string;
	reason: ReportReason;
	description?: string | null;
	status: "pending" | "reviewed" | "resolved";
	resolution?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface BoostPayment {
	id: number;
	listing: Listing | number;
	user: User | number;
	amount: number;
	duration: BoostDuration;
	status: "pending" | "completed" | "failed" | "refunded";
	paymentProvider: "notchpay";
	paymentReference?: string | null;
	paymentUrl?: string | null;
	createdAt: string;
	updatedAt: string;
}

export type ListingWithDetails = Listing & {
	seller?: User;
	category?: Category;
	images?: { image: Media }[];
	isFavorite?: boolean;
};

export type CategoryWithAttributes = Category & {
	attributes?: CategoryAttribute[];
};

export interface CategoryAttribute {
	name: string;
	slug: string;
	type: "text" | "number" | "select" | "boolean" | "date";
	required?: boolean;
	filterable?: boolean;
	options?: { value: string }[];
}

export interface SearchParams {
	q?: string;
	category?: string;
	minPrice?: number;
	maxPrice?: number;
	location?: string;
	limit?: number;
	offset?: number;
	attributes?: Record<string, string>;
}

export interface SearchResult {
	hits: ListingWithDetails[];
	total: number;
	limit: number;
	offset: number;
}

export interface ConversationWithDetails {
	id: number;
	participants: User[];
	listing?: Listing;
	lastMessage?: Message;
	updatedAt: string;
	createdAt: string;
}

export interface MessageWithSender {
	id: number;
	conversation: Conversation | number;
	sender: User;
	content: string;
	read?: boolean | null;
	createdAt: string;
	updatedAt: string;
}

export type ListingCondition = "new" | "like_new" | "good" | "fair" | "poor";

export type ReportReason =
	| "spam"
	| "inappropriate"
	| "fraud"
	| "prohibited"
	| "harassment"
	| "other";

export type BoostDuration = "7" | "14" | "30";

export interface UserSession {
	user: User;
	expiresAt: string;
}
