# Composio Provider Normalization Audit

Last updated: 2026-04-19

## Scope

This file is the current source of truth for:

- what Composio actually exposes today for the providers Flazz cares about
- what the Flazz normalized layer currently supports
- which gaps are only catalog/action-map gaps
- which gaps still need deeper transformer or contract work

## Snapshot Method

Audit inputs used on 2026-04-19:

- local Flazz provider registry:
  - `/D:/flazz/packages/core/src/integrations/provider-catalog.ts`
  - `/D:/flazz/packages/core/src/integrations/provider-action-map.ts`
- live Composio toolkit inventory via `GET https://backend.composio.dev/api/v3/tools?toolkit_slug=<provider>&limit=200`
- official Composio docs:
  - [Enable and disable toolkits](https://docs.composio.dev/docs/toolkits/enable-and-disable-toolkits)
  - [GitHub MCP](https://mcp.composio.dev/github/)
  - [Google Calendar MCP](https://mcp.composio.dev/googlecalendar)
  - [LinkedIn MCP](https://mcp.composio.dev/linkedin)
  - [Google Docs MCP](https://mcp.composio.dev/googledocs)

Composio version in Flazz runtime:

- `@composio/core`: `0.6.2`

## Current Flazz Rule

Do not mark a provider as normalized just because Composio has many actions.

Promote a provider or capability only when at least one of these is true:

1. the generic Flazz contract can already map the required fields safely
2. the provider-specific extra scope can be passed through `additionalInput`
3. the normalized read/write result still produces a stable normalized resource shape

If none of those are true, keep the provider constrained and document the reason here.

## Provider Matrix

| Provider | Resource | Composio snapshot | Flazz normalized | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| gmail | message | 23 tools | list, search, read, reply, create | aligned | Dedicated Gmail pipeline already exists. |
| outlook | message | 43 tools | list, search, read, reply, create | aligned | Broad toolkit; normalized mail path is already adequate. |
| slack | message | 133 tools | list, search, read, reply | intentionally constrained | Toolkit is much broader, but Flazz only normalizes conversation flows today. |
| zendesk | message | 12 tools | list, read, reply | intentionally constrained | Ticket create exists in Composio, but Flazz currently treats Zendesk under message-style reply flows only. |
| intercom | message | 51 tools | list, search, read, reply | intentionally constrained | Toolkit has larger CRM/help-center surface than current message contract. |
| notion | document | 28 tools | list, search, read, create, update | aligned | Good fit for current normalized document contract. |
| googledocs | document | 32 tools | list, search, read, create, update | aligned | Good fit for current normalized document contract. |
| confluence | document | 57 tools | list, search, read, create, update | expanded in this pass | Requires explicit space and optional parent page context through `additionalInput`. |
| coda | document | 101 tools | list, search, read | intentionally constrained | Composio is much broader, but page/doc writes still need provider-specific context and better action selection. |
| miro | document | 14 tools | list, search, read | intentionally constrained | Board create exists, but team/project scope is still too provider-specific for the current generic contract. |
| jira | ticket | many | list, search, read, create, update, comment | aligned | Good fit for current ticket contract. |
| linear | ticket | many | list, read, create, update, comment | acceptable | No dedicated free-text search action in current normalized layer. |
| github | ticket | 200+ tools | list, search, read, create, update, comment | improved in this pass | Flazz now defaults `owner`/`repo` from `repository` context and prefers issue/PR number as normalized id. Repo-scoped detail flows are better, but still depend on callers passing repository context for many reads and writes. |
| asana | ticket | many | list, read, comment | intentionally constrained | Create/update payloads are still too nested for the current generic contract. |
| clickup | ticket | many | list, read, create, update | intentionally constrained | Comment flow still needs provider-specific handling. |
| trello | ticket | many | list, read, create, update, comment | aligned | Board/card model fits current contract reasonably well. |
| monday | ticket | many | list, create | intentionally constrained | No clean single-item read/update path mapped yet. |
| shortcut | ticket | many | list, search, read, create, update, comment | aligned | Good fit. |
| wrike | ticket | many | list, read, create, update | intentionally constrained | Search/comment remain provider-specific. |
| freshdesk | ticket | many | list, read, create, reply | intentionally constrained | Update flow still needs extra metadata. |
| sentry | ticket | many | list, search, read | intentionally constrained | Write/status routing still too provider-specific. |
| googlecalendar | event | 28 tools | list, search, read, create, update | expanded in this pass | `read` is implemented as best-effort event lookup via `EVENTS_INSTANCES`, defaulting to `calendarId=primary` when explicit calendar scope is missing. |
| googlemeet | event | 9 tools | list, search, read, create, update | added in this pass | Flazz now normalizes meet-space and conference-record flows. `read` responses are enriched with conference-record, recording, and transcript metadata, but those artifacts are still not promoted as first-class generic resources. |
| zoom | event | many | list, read, create, update | aligned | Search still omitted because toolkit search is not generic enough. |
| googledrive | file | 50+ tools | list, search, read, create, update | expanded in this pass | Text-oriented file create/edit now normalized; binary upload/comment/permission flows remain provider-specific. |
| dropbox | file | many | list, search, read | intentionally constrained | Create/update not promoted yet. |
| box | file | many | list, search, read | intentionally constrained | Create/update not promoted yet. |
| hubspot | record | 200+ tools | list, search, read, create, update | improved in this pass | Still centered on contacts, but normalized shaping now extracts person/company/title/email context more reliably. |
| salesforce | record | 97 tools | list, search, read, create, update | improved in this pass | Still centered on contacts, but normalized shaping now extracts contact/account/title/email context more reliably. |
| linkedin | record | 4 tools | list, read, create | aligned with toolkit | Toolkit itself is narrow: profile/company read plus post create/delete. |
| pipedrive | record | 200+ tools | list, search, read | improved in this pass | Normalized shaping is better for person/org/email/phone context, but generic writes are still intentionally disabled. |
| googlesheets | spreadsheet | 36 tools | list, search, create | improved in this pass | `create` is now more usable through default `valueInputOption`, spreadsheet id mirroring, and content-to-values coercion. Generic row `read`/`update` are still intentionally disabled. |
| airtable | spreadsheet | 17 tools | list, read, create, update | aligned | Good fit for explicit base/table context. |

## Immediate Gaps Still Open

### 1. GitHub deep reads

Current state:

- toolkit surface is large enough
- normalized `read` works for many issue/PR cases
- Flazz now defaults `owner` / `repo` from `repository` context and treats issue/PR number as the preferred normalized id
- detailed reads still require explicit repository context for many flows

Decision:

- keep current normalized support
- next work should focus on repository context propagation from UI/runtime, not only service defaults

### 2. HubSpot / Salesforce / Pipedrive breadth

Current state:

- Composio surface is far larger than Flazz normalized `record` handling
- Flazz now shapes contacts/people more cleanly for the current actions
- but the normalized contract still does not distinguish cleanly between contact/company/deal/opportunity/person/org variants

Decision:

- do not widen catalog yet
- next step is provider-specific record shaping before exposing more write capabilities

### 3. Google Sheets row semantics

Current state:

- toolkit has many spreadsheet actions
- current Flazz spreadsheet contract still does not represent sheet plus row identity cleanly enough for generic update flows
- `create` is now more usable for append-style writes, but row-level read/update remain underspecified

Decision:

- keep current conservative catalog until row-level normalized reads and updates are explicit

### 4. Google Meet recordings and transcripts

Current state:

- Composio exposes:
  - `GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID`
  - `GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID`
- Flazz normalizes the core meet-space and conference-record flows as `event`
- Flazz now enriches `googlemeet` read responses with conference-record, recording, and transcript metadata
- the current generic contract still has no clean first-class resource type for transcript artifacts or recording assets

Decision:

- keep `googlemeet` normalized at the event level for now
- use enriched read payloads as the bridge into future note creation and meeting-memory flows
- revisit first-class artifact normalization when Flazz adds a dedicated meeting artifact or transcript-document contract

## Next Normalization Order

Recommended order for future work:

1. `github`
   - improve repo-scoped read/write context mapping
2. `hubspot`
   - split normalized record flows by contact/company/deal
3. `salesforce`
   - split normalized record flows by contact/account/opportunity
4. `pipedrive`
   - split normalized record flows by person/org/deal
5. `googlesheets`
   - introduce stable row identity and row update semantics
6. `dropbox` / `box`
   - evaluate text-file create/update feasibility

## Changes Made In This Pass

- enabled normalized `create` and `update` for `confluence`
- enabled normalized `create` and `update` for `googledrive`
- enabled best-effort normalized `read` for `googlecalendar` using event id plus `calendarId=primary` defaulting
- improved GitHub normalized scope defaults and issue-number handling
- improved HubSpot, Salesforce, and Pipedrive record shaping
- improved Google Sheets create defaults and spreadsheet result shaping without falsely enabling row read/update
- added Google Meet to the normalized catalog, UI picker, and event transformer
