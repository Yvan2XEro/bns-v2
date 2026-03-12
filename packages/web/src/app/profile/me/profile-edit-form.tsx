"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { updateProfile } from "~/lib/actions";
import type { User } from "~/types";

export function ProfileEditForm({ user }: { user: User }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [success, setSuccess] = useState("");
	const [error, setError] = useState("");
	const [formData, setFormData] = useState({
		name: user.name || "",
		bio: user.bio || "",
		phone: user.phone || "",
		location: user.location || "",
	});

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setSuccess("");

		startTransition(async () => {
			const result = await updateProfile(user.id, formData);
			if (result.success) {
				setSuccess("Profile updated successfully!");
				router.refresh();
			} else {
				setError(result.error);
			}
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Edit Profile</CardTitle>
				<CardDescription>Update your personal information</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
							{error}
						</div>
					)}
					{success && (
						<div className="rounded-md bg-green-500/10 p-3 text-green-700 text-sm">
							{success}
						</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							value={formData.name}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, name: e.target.value }))
							}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="bio">Bio</Label>
						<Textarea
							id="bio"
							placeholder="Tell us about yourself..."
							value={formData.bio}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, bio: e.target.value }))
							}
						/>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="phone">Phone</Label>
							<Input
								id="phone"
								type="tel"
								placeholder="+237..."
								value={formData.phone}
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, phone: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="location">Location</Label>
							<Input
								id="location"
								placeholder="City, Region"
								value={formData.location}
								onChange={(e) =>
									setFormData((prev) => ({
										...prev,
										location: e.target.value,
									}))
								}
							/>
						</div>
					</div>

					<Button type="submit" disabled={isPending}>
						{isPending ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<Save className="mr-2 h-4 w-4" />
						)}
						Save Changes
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
