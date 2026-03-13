"use client";

import { Camera, Loader2, Save } from "lucide-react";
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
import { ImageCropper } from "~/components/ui/image-cropper";
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
	const [avatarPreview, setAvatarPreview] = useState<string | null>(
		(user.avatar as { url?: string })?.url || null,
	);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [cropSrc, setCropSrc] = useState<string | null>(null);
	const [formData, setFormData] = useState({
		name: user.name || "",
		bio: user.bio || "",
		phone: user.phone || "",
		location: user.location || "",
	});

	function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => setCropSrc(ev.target?.result as string);
		reader.readAsDataURL(file);
		e.target.value = "";
	}

	function handleCropDone(blob: Blob) {
		const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
		setAvatarFile(file);
		setAvatarPreview(URL.createObjectURL(blob));
		setCropSrc(null);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setSuccess("");

		startTransition(async () => {
			let avatarId: string | undefined;

			if (avatarFile) {
				const fd = new FormData();
				fd.append("file", avatarFile);
				fd.append("_payload", JSON.stringify({ alt: user.name || "avatar" }));
				try {
					const uploadRes = await fetch("/api/media", {
						method: "POST",
						body: fd,
						credentials: "include",
					});
					if (uploadRes.ok) {
						const data = await uploadRes.json();
						avatarId = data.doc?.id ?? data.id;
					}
				} catch {
					/* upload failed, continue without avatar */
				}
			}

			const updateData = avatarId
				? { ...formData, avatar: avatarId }
				: formData;
			const result = await updateProfile(user.id, updateData);
			if (result.success) {
				setSuccess("Profile updated successfully!");
				router.refresh();
			} else {
				setError(result.error);
			}
		});
	}

	return (
		<>
			{cropSrc && (
				<ImageCropper
					imageSrc={cropSrc}
					aspect={1}
					onCropDone={handleCropDone}
					onCancel={() => setCropSrc(null)}
				/>
			)}
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
						<div className="flex items-center gap-4">
							<div className="relative">
								<div className="h-20 w-20 overflow-hidden rounded-full bg-[#F1F5F9]">
									{avatarPreview ? (
										// biome-ignore lint/performance/noImgElement: blob preview URL
										<img
											src={avatarPreview}
											alt="Avatar"
											className="h-full w-full object-cover"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center bg-[#1E40AF] font-semibold text-2xl text-white">
											{user.name?.charAt(0) || "?"}
										</div>
									)}
								</div>
								<label className="-bottom-1 -right-1 absolute flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-[#1E40AF] text-white shadow-md hover:bg-[#1E3A8A]">
									<Camera className="h-3.5 w-3.5" />
									<input
										type="file"
										accept="image/*"
										onChange={handleAvatarChange}
										className="hidden"
									/>
								</label>
							</div>
							<div>
								<p className="font-medium text-[#0F172A] text-sm">
									Profile photo
								</p>
								<p className="text-[#64748B] text-xs">
									Click the camera icon to change
								</p>
							</div>
						</div>
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
		</>
	);
}
