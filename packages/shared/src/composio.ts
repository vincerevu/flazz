import { z } from 'zod';

export const ZToolkitMeta = z.object({
  description: z.string(),
  logo: z.string(),
  tools_count: z.number(),
  triggers_count: z.number(),
});

export const ZToolkitItem = z.object({
  slug: z.string(),
  name: z.string(),
  meta: ZToolkitMeta,
  no_auth: z.boolean().optional(),
  auth_schemes: z.array(z.string()).optional(),
  composio_managed_auth_schemes: z.array(z.string()).optional(),
});

export const ZListToolkitsResponse = z.object({
  items: z.array(ZToolkitItem),
  nextCursor: z.string().nullable(),
  totalItems: z.number(),
});

export type IntegrationSection = 'popular' | 'other';

export interface CuratedToolkit {
  slug: string;
  displayName: string;
  section: IntegrationSection;
}

export const CURATED_TOOLKITS: CuratedToolkit[] = [
  { slug: 'gmail', displayName: 'Gmail', section: 'popular' },
  { slug: 'googlecalendar', displayName: 'Google Calendar', section: 'popular' },
  { slug: 'googledrive', displayName: 'Google Drive', section: 'popular' },
  { slug: 'slack', displayName: 'Slack', section: 'popular' },
  { slug: 'notion', displayName: 'Notion', section: 'popular' },
  { slug: 'github', displayName: 'GitHub', section: 'popular' },
  { slug: 'linear', displayName: 'Linear', section: 'popular' },
  { slug: 'linkedin', displayName: 'LinkedIn', section: 'popular' },
  { slug: 'jira', displayName: 'Jira', section: 'other' },
  { slug: 'trello', displayName: 'Trello', section: 'other' },
  { slug: 'hubspot', displayName: 'HubSpot', section: 'other' },
  { slug: 'salesforce', displayName: 'Salesforce', section: 'other' },
  { slug: 'dropbox', displayName: 'Dropbox', section: 'other' },
  { slug: 'onedrive', displayName: 'OneDrive', section: 'other' },
];

export const COMPOSIO_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  CURATED_TOOLKITS.map((toolkit) => [toolkit.slug, toolkit.displayName]),
);

export const COMPOSIO_SECTION_BY_SLUG: Record<string, IntegrationSection> = Object.fromEntries(
  CURATED_TOOLKITS.map((toolkit) => [toolkit.slug, toolkit.section]),
);

export const CURATED_TOOLKIT_SLUGS = new Set(CURATED_TOOLKITS.map((toolkit) => toolkit.slug));
