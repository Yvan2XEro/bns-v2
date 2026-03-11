import type {
	BoostDuration,
	BoostPayment,
	Category,
	CategoryAttribute,
	Conversation,
	Favorite,
	Listing,
	Message,
	Report,
	ReportReason,
	Review,
	SearchParams,
	SearchResult,
	User,
} from "~/types";

class ApiClient {
	private baseUrl: string;

	constructor(baseUrl: string = "") {
		this.baseUrl = baseUrl;
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const response = await fetch(url, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...options.headers,
			},
			credentials: "include",
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.message || `API error: ${response.status}`);
		}

		return response.json();
	}

	async get<T>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint);
	}

	async post<T>(endpoint: string, data?: unknown): Promise<T> {
		return this.request<T>(endpoint, {
			method: "POST",
			body: data ? JSON.stringify(data) : undefined,
		});
	}

	async put<T>(endpoint: string, data: unknown): Promise<T> {
		return this.request<T>(endpoint, {
			method: "PUT",
			body: JSON.stringify(data),
		});
	}

	async patch<T>(endpoint: string, data: unknown): Promise<T> {
		return this.request<T>(endpoint, {
			method: "PATCH",
			body: JSON.stringify(data),
		});
	}

	async delete<T>(endpoint: string): Promise<T> {
		return this.request<T>(endpoint, {
			method: "DELETE",
		});
	}
}

export const api = new ApiClient();

export const listingsApi = {
	search: async (params: SearchParams): Promise<SearchResult> => {
		const searchParams = new URLSearchParams();

		if (params.q) searchParams.set("q", params.q);
		if (params.category) searchParams.set("category", params.category);
		if (params.minPrice)
			searchParams.set("minPrice", params.minPrice.toString());
		if (params.maxPrice)
			searchParams.set("maxPrice", params.maxPrice.toString());
		if (params.location) searchParams.set("location", params.location);
		if (params.limit) searchParams.set("limit", params.limit.toString());
		if (params.offset) searchParams.set("offset", params.offset.toString());

		if (params.attributes) {
			for (const [key, value] of Object.entries(params.attributes)) {
				searchParams.set(`attr_${key}`, String(value));
			}
		}

		return api.get<SearchResult>(`/api/search?${searchParams.toString()}`);
	},

	getById: async (id: number): Promise<Listing> => {
		return api.get<Listing>(`/api/listings/${id}`);
	},

	create: async (data: Partial<Listing>): Promise<Listing> => {
		return api.post<Listing>("/api/listings", data);
	},

	update: async (id: number, data: Partial<Listing>): Promise<Listing> => {
		return api.put<Listing>(`/api/listings/${id}`, data);
	},

	delete: async (id: number): Promise<void> => {
		return api.delete(`/api/listings/${id}`);
	},

	getRecent: async (limit: number = 10): Promise<Listing[]> => {
		const result = await api.get<SearchResult>(
			`/api/search?limit=${limit}&sort=-createdAt`,
		);
		return result.hits;
	},

	getFeatured: async (limit: number = 6): Promise<Listing[]> => {
		const result = await api.get<SearchResult>(`/api/search?limit=${limit}`);
		return result.hits.filter((l) => l.boostedUntil);
	},

	getByUser: async (userId: number): Promise<Listing[]> => {
		const result = await api.get<SearchResult>(`/api/search?userId=${userId}`);
		return result.hits;
	},
};

export const categoriesApi = {
	getAll: async (): Promise<{ categories: Category[] }> => {
		return api.get<{ categories: Category[] }>("/api/categories");
	},

	getById: async (
		id: number,
	): Promise<Category & { attributes: CategoryAttribute[] }> => {
		return api.get<Category & { attributes: CategoryAttribute[] }>(
			`/api/categories?id=${id}`,
		);
	},

	getBySlug: async (
		slug: string,
	): Promise<Category & { attributes: CategoryAttribute[] }> => {
		return api.get<Category & { attributes: CategoryAttribute[] }>(
			`/api/categories?slug=${slug}`,
		);
	},
};

export const favoritesApi = {
	getAll: async (): Promise<Favorite[]> => {
		return api.get<Favorite[]>("/api/favorites");
	},

	add: async (listingId: number): Promise<Favorite> => {
		return api.post<Favorite>("/api/favorites", { listingId });
	},

	remove: async (listingId: number): Promise<void> => {
		return api.delete(`/api/favorites/${listingId}`);
	},

	check: async (listingId: number): Promise<boolean> => {
		const favs = await api.get<Favorite[]>(
			`/api/favorites?listingId=${listingId}`,
		);
		return favs.length > 0;
	},
};

export const conversationsApi = {
	getAll: async (): Promise<Conversation[]> => {
		return api.get<Conversation[]>("/api/conversations");
	},

	getById: async (id: number): Promise<Conversation> => {
		return api.get<Conversation>(`/api/conversations/${id}`);
	},

	getMessages: async (conversationId: number): Promise<Message[]> => {
		return api.get<Message[]>(`/api/conversations/${conversationId}/messages`);
	},

	sendMessage: async (
		conversationId: number,
		content: string,
	): Promise<Message> => {
		return api.post<Message>(`/api/conversations/${conversationId}/messages`, {
			content,
		});
	},

	create: async (
		listingId: number,
		sellerId: number,
	): Promise<Conversation> => {
		return api.post<Conversation>("/api/conversations", {
			listingId,
			sellerId,
		});
	},

	markAsRead: async (conversationId: number): Promise<void> => {
		return api.post(`/api/conversations/${conversationId}/read`);
	},
};

export const reviewsApi = {
	getByUser: async (userId: number): Promise<Review[]> => {
		return api.get<Review[]>(`/api/reviews?userId=${userId}`);
	},

	create: async (data: {
		reviewedUserId: number;
		rating: number;
		comment?: string;
		listingId?: number;
	}): Promise<Review> => {
		return api.post<Review>("/api/reviews", data);
	},
};

export const reportsApi = {
	create: async (data: {
		targetType: "listing" | "user" | "message";
		targetId: string;
		reason: ReportReason;
		description?: string;
	}): Promise<Report> => {
		return api.post<Report>("/api/reports", data);
	},
};

export const boostApi = {
	createPayment: async (
		listingId: number,
		duration: BoostDuration,
	): Promise<{
		paymentId: number;
		paymentUrl?: string;
		paymentReference?: string;
	}> => {
		return api.post("/api/boost", { listingId, duration });
	},

	getStatus: async (listingId: number): Promise<BoostPayment | null> => {
		return api.get<BoostPayment | null>(`/api/boost/${listingId}`);
	},
};

export const authApi = {
	me: async (): Promise<{ user: User; token: string; exp: number } | null> => {
		try {
			return await api.get<{ user: User; token: string; exp: number }>(
				"/api/users/me",
			);
		} catch {
			return null;
		}
	},

	login: async (
		email: string,
		password: string,
	): Promise<{ user: User; token: string; exp: number }> => {
		return api.post<{ user: User; token: string; exp: number }>(
			"/api/users/login",
			{ email, password },
		);
	},

	register: async (
		email: string,
		password: string,
		name: string,
	): Promise<{ doc: User }> => {
		return api.post<{ doc: User }>("/api/users", {
			email,
			password,
			name,
		});
	},

	logout: async (): Promise<void> => {
		return api.post("/api/users/logout");
	},

	refreshToken: async (): Promise<{
		user: User;
		refreshedToken: string;
		exp: number;
	}> => {
		return api.post("/api/users/refresh-token");
	},

	forgotPassword: async (email: string): Promise<{ message: string }> => {
		return api.post("/api/users/forgot-password", { email });
	},

	resetPassword: async (
		token: string,
		password: string,
	): Promise<{ user: User; token: string }> => {
		return api.post("/api/users/reset-password", { token, password });
	},

	changePassword: async (
		userId: number,
		password: string,
	): Promise<{ doc: User }> => {
		return api.patch<{ doc: User }>(`/api/users/${userId}`, { password });
	},

	updateProfile: async (
		userId: number,
		data: { name?: string; bio?: string; phone?: string; location?: string },
	): Promise<{ doc: User }> => {
		return api.patch<{ doc: User }>(`/api/users/${userId}`, data);
	},
};

export const usersApi = {
	getById: async (id: number): Promise<User> => {
		return api.get<User>(`/api/users/${id}`);
	},

	update: async (id: number, data: Partial<User>): Promise<{ doc: User }> => {
		return api.patch<{ doc: User }>(`/api/users/${id}`, data);
	},
};
