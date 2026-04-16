import type { IntegrationCapability } from "./types.js";

export type ProviderActionPreferences = Partial<Record<IntegrationCapability, string[]>>;

const PROVIDER_ACTION_MAP: Record<string, ProviderActionPreferences> = {
  gmail: {
    list: ["GMAIL_FETCH_EMAILS", "GMAIL_LIST_THREADS"],
    search: ["GMAIL_FETCH_EMAILS", "GMAIL_SEARCH_THREADS"],
    read: ["GMAIL_GET_MESSAGE", "GMAIL_GET_THREAD"],
    reply: ["GMAIL_REPLY_TO_THREAD", "GMAIL_SEND_EMAIL"],
  },
  outlook: {
    list: ["OUTLOOK_LIST_MESSAGES"],
    search: ["OUTLOOK_SEARCH_MESSAGES"],
    read: ["OUTLOOK_GET_MESSAGE"],
    reply: ["OUTLOOK_REPLY_TO_MESSAGE", "OUTLOOK_SEND_EMAIL"],
  },
  slack: {
    list: ["SLACK_FETCH_CONVERSATION_HISTORY", "SLACK_LIST_CONVERSATIONS"],
    search: ["SLACK_SEARCH_MESSAGES"],
    read: ["SLACK_FETCH_CONVERSATION_HISTORY", "SLACK_GET_THREAD_REPLIES"],
    reply: ["SLACK_SEND_MESSAGE", "SLACK_REPLY_TO_THREAD"],
  },
  teams: {
    list: ["TEAMS_LIST_MESSAGES", "TEAMS_LIST_CHANNEL_MESSAGES"],
    search: ["TEAMS_SEARCH_MESSAGES"],
    read: ["TEAMS_GET_MESSAGE", "TEAMS_GET_THREAD_MESSAGES"],
    reply: ["TEAMS_REPLY_TO_MESSAGE", "TEAMS_SEND_MESSAGE"],
  },
  discord: {
    list: ["DISCORD_LIST_MESSAGES", "DISCORD_LIST_CHANNEL_MESSAGES"],
    search: ["DISCORD_SEARCH_MESSAGES"],
    read: ["DISCORD_GET_MESSAGE", "DISCORD_GET_THREAD_MESSAGES"],
  },
  zendesk: {
    list: ["ZENDESK_LIST_TICKETS", "ZENDESK_LIST_CONVERSATIONS"],
    search: ["ZENDESK_SEARCH_TICKETS", "ZENDESK_SEARCH_CONVERSATIONS"],
    read: ["ZENDESK_GET_TICKET", "ZENDESK_GET_CONVERSATION"],
    reply: ["ZENDESK_CREATE_TICKET_COMMENT", "ZENDESK_REPLY_TO_TICKET"],
  },
  notion: {
    list: ["NOTION_LIST_PAGES"],
    search: ["NOTION_SEARCH"],
    read: ["NOTION_GET_PAGE", "NOTION_QUERY_BLOCKS"],
    create: ["NOTION_CREATE_PAGE"],
    update: ["NOTION_UPDATE_PAGE", "NOTION_APPEND_BLOCKS"],
  },
  googledocs: {
    list: ["GOOGLEDOCS_LIST_DOCUMENTS"],
    search: ["GOOGLEDOCS_SEARCH_DOCUMENTS"],
    read: ["GOOGLEDOCS_GET_DOCUMENT"],
    create: ["GOOGLEDOCS_CREATE_DOCUMENT"],
    update: ["GOOGLEDOCS_UPDATE_DOCUMENT"],
  },
  confluence: {
    list: ["CONFLUENCE_LIST_PAGES", "CONFLUENCE_LIST_SPACES"],
    search: ["CONFLUENCE_SEARCH", "CONFLUENCE_SEARCH_PAGES"],
    read: ["CONFLUENCE_GET_PAGE", "CONFLUENCE_GET_PAGE_CONTENT"],
  },
  github: {
    list: ["GITHUB_LIST_NOTIFICATIONS", "GITHUB_LIST_ISSUES", "GITHUB_LIST_PULL_REQUESTS"],
    search: ["GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS", "GITHUB_LIST_NOTIFICATIONS"],
    read: ["GITHUB_GET_NOTIFICATION", "GITHUB_GET_ISSUE", "GITHUB_GET_PULL_REQUEST"],
  },
  jira: {
    list: ["JIRA_LIST_ISSUES"],
    search: ["JIRA_SEARCH_ISSUES"],
    read: ["JIRA_GET_ISSUE"],
    create: ["JIRA_CREATE_ISSUE"],
    update: ["JIRA_UPDATE_ISSUE"],
    comment: ["JIRA_ADD_COMMENT"],
  },
  linear: {
    list: ["LINEAR_LIST_ISSUES"],
    search: ["LINEAR_SEARCH_ISSUES"],
    read: ["LINEAR_GET_ISSUE"],
    create: ["LINEAR_CREATE_ISSUE"],
    update: ["LINEAR_UPDATE_ISSUE"],
    comment: ["LINEAR_CREATE_COMMENT"],
  },
  asana: {
    list: ["ASANA_LIST_TASKS"],
    search: ["ASANA_SEARCH_TASKS"],
    read: ["ASANA_GET_TASK"],
    create: ["ASANA_CREATE_TASK"],
    update: ["ASANA_UPDATE_TASK"],
    comment: ["ASANA_ADD_COMMENT"],
  },
  clickup: {
    list: ["CLICKUP_LIST_TASKS"],
    search: ["CLICKUP_SEARCH_TASKS"],
    read: ["CLICKUP_GET_TASK"],
    create: ["CLICKUP_CREATE_TASK"],
    update: ["CLICKUP_UPDATE_TASK"],
    comment: ["CLICKUP_CREATE_TASK_COMMENT"],
  },
  googlecalendar: {
    list: ["GOOGLECALENDAR_LIST_EVENTS"],
    read: ["GOOGLECALENDAR_GET_EVENT"],
    create: ["GOOGLECALENDAR_CREATE_EVENT"],
    update: ["GOOGLECALENDAR_UPDATE_EVENT"],
  },
  outlookcalendar: {
    list: ["OUTLOOKCALENDAR_LIST_EVENTS", "OUTLOOK_LIST_EVENTS"],
    read: ["OUTLOOKCALENDAR_GET_EVENT", "OUTLOOK_GET_EVENT"],
    create: ["OUTLOOKCALENDAR_CREATE_EVENT", "OUTLOOK_CREATE_EVENT"],
    update: ["OUTLOOKCALENDAR_UPDATE_EVENT", "OUTLOOK_UPDATE_EVENT"],
  },
  googledrive: {
    list: ["GOOGLEDRIVE_LIST_FILES"],
    search: ["GOOGLEDRIVE_SEARCH_FILES"],
    read: ["GOOGLEDRIVE_GET_FILE", "GOOGLEDRIVE_DOWNLOAD_FILE"],
  },
  dropbox: {
    list: ["DROPBOX_LIST_FILES"],
    search: ["DROPBOX_SEARCH_FILES"],
    read: ["DROPBOX_GET_FILE", "DROPBOX_DOWNLOAD_FILE"],
  },
  onedrive: {
    list: ["ONEDRIVE_LIST_FILES"],
    search: ["ONEDRIVE_SEARCH_FILES"],
    read: ["ONEDRIVE_GET_FILE", "ONEDRIVE_DOWNLOAD_FILE"],
  },
  hubspot: {
    list: ["HUBSPOT_LIST_RECORDS", "HUBSPOT_LIST_CONTACTS"],
    search: ["HUBSPOT_SEARCH_RECORDS", "HUBSPOT_SEARCH_CONTACTS"],
    read: ["HUBSPOT_GET_RECORD", "HUBSPOT_GET_CONTACT"],
    create: ["HUBSPOT_CREATE_RECORD", "HUBSPOT_CREATE_CONTACT"],
    update: ["HUBSPOT_UPDATE_RECORD", "HUBSPOT_UPDATE_CONTACT"],
  },
  salesforce: {
    list: ["SALESFORCE_LIST_RECORDS", "SALESFORCE_LIST_OBJECTS"],
    search: ["SALESFORCE_SEARCH_RECORDS", "SALESFORCE_QUERY_RECORDS"],
    read: ["SALESFORCE_GET_RECORD", "SALESFORCE_GET_OBJECT"],
    create: ["SALESFORCE_CREATE_RECORD"],
    update: ["SALESFORCE_UPDATE_RECORD"],
  },
  googlesheets: {
    list: ["GOOGLESHEETS_LIST_ROWS", "GOOGLESHEETS_LIST_SHEETS"],
    search: ["GOOGLESHEETS_QUERY_ROWS", "GOOGLESHEETS_SEARCH_ROWS"],
    read: ["GOOGLESHEETS_GET_ROW", "GOOGLESHEETS_GET_SHEET"],
    create: ["GOOGLESHEETS_CREATE_ROW"],
    update: ["GOOGLESHEETS_UPDATE_ROW"],
  },
};

export function getProviderActionPreferences(app: string): ProviderActionPreferences {
  return PROVIDER_ACTION_MAP[app] ?? {};
}
