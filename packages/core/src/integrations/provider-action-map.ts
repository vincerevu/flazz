import type { IntegrationCapability } from "./types.js";

export type ProviderActionPreferences = Partial<Record<IntegrationCapability, string[]>>;

const PROVIDER_ACTION_MAP: Record<string, ProviderActionPreferences> = {
  gmail: {
    list: ["GMAIL_FETCH_EMAILS", "GMAIL_LIST_THREADS"],
    search: ["GMAIL_FETCH_EMAILS", "GMAIL_LIST_THREADS"],
    read: ["GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", "GMAIL_FETCH_MESSAGE_BY_THREAD_ID"],
    reply: ["GMAIL_REPLY_TO_THREAD", "GMAIL_SEND_EMAIL"],
    create: ["GMAIL_SEND_EMAIL"],
  },
  outlook: {
    list: ["OUTLOOK_OUTLOOK_LIST_MESSAGES"],
    search: ["OUTLOOK_OUTLOOK_SEARCH_MESSAGES"],
    read: ["OUTLOOK_OUTLOOK_GET_MESSAGE"],
    reply: ["OUTLOOK_OUTLOOK_REPLY_EMAIL", "OUTLOOK_OUTLOOK_SEND_EMAIL"],
    create: ["OUTLOOK_OUTLOOK_SEND_EMAIL"],
  },
  slack: {
    list: ["SLACK_FETCH_CONVERSATION_HISTORY", "SLACK_LIST_CONVERSATIONS"],
    search: ["SLACK_SEARCH_MESSAGES"],
    read: ["SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION", "SLACK_FETCH_CONVERSATION_HISTORY"],
    reply: ["SLACK_SEND_MESSAGE", "SLACK_CHAT_POST_MESSAGE"],
  },
  zendesk: {
    list: ["ZENDESK_LIST_ZENDESK_TICKETS"],
    read: ["ZENDESK_GET_ZENDESK_TICKET_BY_ID"],
    reply: ["ZENDESK_REPLY_ZENDESK_TICKET"],
  },
  intercom: {
    list: ["INTERCOM_LIST_CONVERSATIONS"],
    search: ["INTERCOM_SEARCH_CONVERSATIONS"],
    read: ["INTERCOM_GET_CONVERSATION"],
    reply: ["INTERCOM_REPLY_TO_CONVERSATION"],
  },
  notion: {
    list: ["NOTION_FETCH_DATA", "NOTION_SEARCH_NOTION_PAGE"],
    search: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_FETCH_DATA"],
    read: ["NOTION_FETCH_BLOCK_CONTENTS", "NOTION_FETCH_DATA"],
    create: ["NOTION_CREATE_NOTION_PAGE"],
    update: ["NOTION_UPDATE_PAGE", "NOTION_APPEND_BLOCK_CHILDREN", "NOTION_ADD_PAGE_CONTENT"],
  },
  googledocs: {
    list: ["GOOGLEDOCS_SEARCH_DOCUMENTS"],
    search: ["GOOGLEDOCS_SEARCH_DOCUMENTS"],
    read: ["GOOGLEDOCS_GET_DOCUMENT_BY_ID"],
    create: ["GOOGLEDOCS_CREATE_DOCUMENT"],
    update: ["GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT", "GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN"],
  },
  confluence: {
    list: ["CONFLUENCE_GET_PAGES", "CONFLUENCE_GET_SPACES"],
    search: ["CONFLUENCE_SEARCH_CONTENT"],
    read: ["CONFLUENCE_GET_PAGE_BY_ID"],
    create: ["CONFLUENCE_CREATE_PAGE"],
    update: ["CONFLUENCE_UPDATE_PAGE"],
  },
  coda: {
    list: ["CODA_LIST_AVAILABLE_DOCS"],
    search: ["CODA_LIST_AVAILABLE_DOCS"],
    read: ["CODA_GET_A_PAGE", "CODA_GET_INFO_ABOUT_A_DOC"],
  },
  miro: {
    list: ["MIRO_GET_BOARDS"],
    search: ["MIRO_GET_BOARDS"],
    read: ["MIRO_GET_BOARD"],
  },
  jira: {
    list: ["JIRA_SEARCH_ISSUES"],
    search: ["JIRA_SEARCH_ISSUES"],
    read: ["JIRA_GET_ISSUE"],
    create: ["JIRA_CREATE_ISSUE"],
    update: ["JIRA_EDIT_ISSUE"],
    comment: ["JIRA_ADD_COMMENT"],
  },
  linear: {
    list: ["LINEAR_LIST_LINEAR_ISSUES"],
    read: ["LINEAR_GET_LINEAR_ISSUE"],
    create: ["LINEAR_CREATE_LINEAR_ISSUE"],
    update: ["LINEAR_UPDATE_ISSUE"],
    comment: ["LINEAR_CREATE_LINEAR_COMMENT"],
  },
  github: {
    list: ["GITHUB_LIST_ASSIGNED_ISSUES", "GITHUB_LIST_ISSUES_ASSIGNED_TO_THE_AUTHENTICATED_USER"],
    search: ["GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS"],
    read: ["GITHUB_GET_AN_ISSUE", "GITHUB_ISSUES_GET", "GITHUB_GET_A_PULL_REQUEST", "GITHUB_PULLS_GET"],
    create: ["GITHUB_CREATE_AN_ISSUE", "GITHUB_ISSUES_CREATE"],
    update: ["GITHUB_UPDATE_AN_ISSUE"],
    comment: ["GITHUB_CREATE_AN_ISSUE_COMMENT", "GITHUB_ISSUES_CREATE_COMMENT"],
  },
  asana: {
    list: ["ASANA_GET_TASKS_FROM_A_PROJECT"],
    read: ["ASANA_GET_A_TASK"],
    comment: ["ASANA_CREATE_TASK_COMMENT"],
  },
  clickup: {
    list: ["CLICKUP_GET_FILTERED_TEAM_TASKS"],
    read: ["CLICKUP_GET_TASK"],
    create: ["CLICKUP_CREATE_TASK"],
    update: ["CLICKUP_UPDATE_TASK"],
  },
  trello: {
    list: ["TRELLO_BOARD_GET_CARDS_BY_ID_BOARD"],
    read: ["TRELLO_CARD_GET_BY_ID"],
    create: ["TRELLO_ADD_CARDS"],
    update: ["TRELLO_CARD_UPDATE_BY_ID_CARD"],
    comment: ["TRELLO_ADD_CARDS_ACTIONS_COMMENTS_BY_ID_CARD"],
  },
  monday: {
    list: ["MONDAY_LIST_BOARD_ITEMS"],
    create: ["MONDAY_CREATE_ITEM"],
  },
  shortcut: {
    list: ["SHORTCUT_LIST_STORIES"],
    search: ["SHORTCUT_SEARCH_STORIES"],
    read: ["SHORTCUT_GET_STORY"],
    create: ["SHORTCUT_CREATE_STORY"],
    update: ["SHORTCUT_UPDATE_STORY"],
    comment: ["SHORTCUT_CREATE_STORY_COMMENT"],
  },
  wrike: {
    list: ["WRIKE_FETCH_ALL_TASKS"],
    read: ["WRIKE_GET_TASK_BY_ID"],
    create: ["WRIKE_CREATE_TASK"],
    update: ["WRIKE_MODIFY_TASK"],
  },
  freshdesk: {
    list: ["FRESHDESK_LIST_ALL_TICKETS"],
    read: ["FRESHDESK_VIEW_TICKET"],
    create: ["FRESHDESK_CREATE_TICKET"],
    reply: ["FRESHDESK_REPLY_TICKET"],
  },
  sentry: {
    list: ["SENTRY_RETRIEVE_PROJECT_ISSUES_LIST"],
    search: ["SENTRY_RETRIEVE_PROJECT_ISSUES_LIST"],
    read: ["SENTRY_GET_ORGANIZATION_ISSUE_DETAILS"],
  },
  googlecalendar: {
    list: ["GOOGLECALENDAR_FIND_EVENT", "GOOGLECALENDAR_EVENTS_LIST"],
    search: ["GOOGLECALENDAR_FIND_EVENT"],
    read: ["GOOGLECALENDAR_EVENTS_INSTANCES"],
    create: ["GOOGLECALENDAR_CREATE_EVENT"],
    update: ["GOOGLECALENDAR_PATCH_EVENT", "GOOGLECALENDAR_UPDATE_EVENT"],
  },
  googlemeet: {
    list: ["GOOGLEMEET_LIST_CONFERENCE_RECORDS"],
    search: ["GOOGLEMEET_GET_CONFERENCE_RECORD_FOR_MEET"],
    read: ["GOOGLEMEET_GET_MEET"],
    create: ["GOOGLEMEET_CREATE_MEET"],
    update: ["GOOGLEMEET_UPDATE_SPACE"],
  },
  zoom: {
    list: ["ZOOM_LIST_MEETINGS"],
    read: ["ZOOM_GET_A_MEETING"],
    create: ["ZOOM_CREATE_A_MEETING"],
    update: ["ZOOM_UPDATE_A_MEETING"],
  },
  googledrive: {
    list: ["GOOGLEDRIVE_LIST_FILES"],
    search: ["GOOGLEDRIVE_FIND_FILE"],
    read: ["GOOGLEDRIVE_GET_FILE_METADATA", "GOOGLEDRIVE_DOWNLOAD_FILE"],
    create: ["GOOGLEDRIVE_CREATE_FILE_FROM_TEXT", "GOOGLEDRIVE_CREATE_FILE"],
    update: ["GOOGLEDRIVE_EDIT_FILE", "GOOGLEDRIVE_UPDATE_FILE_PUT"],
  },
  dropbox: {
    list: ["DROPBOX_LIST_FILES_IN_FOLDER", "DROPBOX_LIST_FOLDERS"],
    search: ["DROPBOX_SEARCH_FILE_OR_FOLDER"],
    read: ["DROPBOX_READ_FILE"],
  },
  box: {
    list: ["BOX_LIST_ITEMS_IN_FOLDER"],
    search: ["BOX_SEARCH_FOR_CONTENT"],
    read: ["BOX_GET_FILE_INFORMATION", "BOX_DOWNLOAD_FILE"],
  },
  hubspot: {
    list: ["HUBSPOT_HUBSPOT_LIST_CONTACTS"],
    search: ["HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA"],
    read: ["HUBSPOT_HUBSPOT_READ_CONTACT"],
    create: ["HUBSPOT_CREATE_CONTACT"],
    update: ["HUBSPOT_HUBSPOT_UPDATE_CONTACT"],
  },
  salesforce: {
    list: ["SALESFORCE_LIST_CONTACTS"],
    search: ["SALESFORCE_SEARCH_CONTACTS"],
    read: ["SALESFORCE_GET_CONTACT", "SALESFORCE_RETRIEVE_SPECIFIC_CONTACT_BY_ID"],
    create: ["SALESFORCE_CREATE_CONTACT"],
    update: ["SALESFORCE_UPDATE_CONTACT"],
  },
  linkedin: {
    list: ["LINKEDIN_GET_COMPANY_INFO"],
    read: ["LINKEDIN_GET_MY_INFO", "LINKEDIN_GET_COMPANY_INFO"],
    create: ["LINKEDIN_CREATE_LINKED_IN_POST"],
  },
  pipedrive: {
    list: ["PIPEDRIVE_GET_ALL_PERSONS"],
    search: ["PIPEDRIVE_SEARCH_PERSONS"],
    read: ["PIPEDRIVE_GET_DETAILS_OF_A_PERSON"],
  },
  googlesheets: {
    list: ["GOOGLESHEETS_SEARCH_SPREADSHEETS", "GOOGLESHEETS_GET_SHEET_NAMES"],
    search: ["GOOGLESHEETS_SEARCH_SPREADSHEETS", "GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW"],
    create: ["GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND", "GOOGLESHEETS_CREATE_SPREADSHEET_ROW"],
  },
  airtable: {
    list: ["AIRTABLE_LIST_BASES", "AIRTABLE_LIST_RECORDS"],
    read: ["AIRTABLE_GET_RECORD"],
    create: ["AIRTABLE_CREATE_RECORD"],
    update: ["AIRTABLE_UPDATE_RECORD"],
  },
};

export function getProviderActionPreferences(app: string): ProviderActionPreferences {
  return PROVIDER_ACTION_MAP[app] ?? {};
}
