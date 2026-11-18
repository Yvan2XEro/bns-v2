import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from "@payloadcms/next/rsc";
import {
	AlignFeatureClient as AlignFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	BlockquoteFeatureClient as BlockquoteFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	BoldFeatureClient as BoldFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	ChecklistFeatureClient as ChecklistFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	HeadingFeatureClient as HeadingFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	HorizontalRuleFeatureClient as HorizontalRuleFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	IndentFeatureClient as IndentFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	InlineCodeFeatureClient as InlineCodeFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	InlineToolbarFeatureClient as InlineToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	ItalicFeatureClient as ItalicFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	LinkFeatureClient as LinkFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	OrderedListFeatureClient as OrderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	ParagraphFeatureClient as ParagraphFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	RelationshipFeatureClient as RelationshipFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	StrikethroughFeatureClient as StrikethroughFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	SubscriptFeatureClient as SubscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	SuperscriptFeatureClient as SuperscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	UnderlineFeatureClient as UnderlineFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	UnorderedListFeatureClient as UnorderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	UploadFeatureClient as UploadFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
} from "@payloadcms/richtext-lexical/client";
import {
	LexicalDiffComponent as LexicalDiffComponent_44fe37237e0ebf4470c9990d8cb7b07e,
	RscEntryLexicalCell as RscEntryLexicalCell_44fe37237e0ebf4470c9990d8cb7b07e,
	RscEntryLexicalField as RscEntryLexicalField_44fe37237e0ebf4470c9990d8cb7b07e,
} from "@payloadcms/richtext-lexical/rsc";
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from "@payloadcms/storage-s3/client";
import { default as default_032993581af5259da0d9363de3b39378 } from "@/components/auth/AdminSocialLogin";
import { default as default_1a7510af427896d367a49dbf838d2de6 } from "@/components/BeforeDashboard";
import {
	Icon as Icon_aa1ccffe8e7691b68760d0edc9b149c9,
	Logo as Logo_aa1ccffe8e7691b68760d0edc9b149c9,
} from "@/components/branding/AdminLogo";
import { default as default_09b819edf1a6f37d51b139d5bc6413f5 } from "@/components/nav/ModerationNav";
import { default as default_e0da21ab58da76cc2b239852738a910d } from "@/components/views/ModerationQueue";
import { default as default_8faa6da8bc58c6e839b4e75ebee319f7 } from "@/components/views/ReportsQueue";
import { default as default_82ba70094ba21cc228ff4105fb671eee } from "@/components/views/UserManagement";
import { default as default_084c38875d0c01ac5cda002d0336b4c8 } from "@/components/widgets/ModerationWidget";

export const importMap = {
	"@payloadcms/richtext-lexical/rsc#RscEntryLexicalCell":
		RscEntryLexicalCell_44fe37237e0ebf4470c9990d8cb7b07e,
	"@payloadcms/richtext-lexical/rsc#RscEntryLexicalField":
		RscEntryLexicalField_44fe37237e0ebf4470c9990d8cb7b07e,
	"@payloadcms/richtext-lexical/rsc#LexicalDiffComponent":
		LexicalDiffComponent_44fe37237e0ebf4470c9990d8cb7b07e,
	"@payloadcms/richtext-lexical/client#InlineToolbarFeatureClient":
		InlineToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#HorizontalRuleFeatureClient":
		HorizontalRuleFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#UploadFeatureClient":
		UploadFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#BlockquoteFeatureClient":
		BlockquoteFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#RelationshipFeatureClient":
		RelationshipFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#LinkFeatureClient":
		LinkFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#ChecklistFeatureClient":
		ChecklistFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#OrderedListFeatureClient":
		OrderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#UnorderedListFeatureClient":
		UnorderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#IndentFeatureClient":
		IndentFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#AlignFeatureClient":
		AlignFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#HeadingFeatureClient":
		HeadingFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#ParagraphFeatureClient":
		ParagraphFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#InlineCodeFeatureClient":
		InlineCodeFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#SuperscriptFeatureClient":
		SuperscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#SubscriptFeatureClient":
		SubscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#StrikethroughFeatureClient":
		StrikethroughFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#UnderlineFeatureClient":
		UnderlineFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#BoldFeatureClient":
		BoldFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#ItalicFeatureClient":
		ItalicFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@/components/branding/AdminLogo#Icon": Icon_aa1ccffe8e7691b68760d0edc9b149c9,
	"@/components/branding/AdminLogo#Logo": Logo_aa1ccffe8e7691b68760d0edc9b149c9,
	"@/components/nav/ModerationNav#default":
		default_09b819edf1a6f37d51b139d5bc6413f5,
	"@/components/BeforeDashboard#default":
		default_1a7510af427896d367a49dbf838d2de6,
	"@/components/widgets/ModerationWidget#default":
		default_084c38875d0c01ac5cda002d0336b4c8,
	"@/components/auth/AdminSocialLogin#default":
		default_032993581af5259da0d9363de3b39378,
	"@payloadcms/storage-s3/client#S3ClientUploadHandler":
		S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24,
	"@/components/views/ModerationQueue#default":
		default_e0da21ab58da76cc2b239852738a910d,
	"@/components/views/ReportsQueue#default":
		default_8faa6da8bc58c6e839b4e75ebee319f7,
	"@/components/views/UserManagement#default":
		default_82ba70094ba21cc228ff4105fb671eee,
	"@payloadcms/next/rsc#CollectionCards":
		CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1,
};
