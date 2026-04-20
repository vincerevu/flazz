# Composio Provider Normalization Audit

Last updated: 2026-04-20

## Pexels

- Toolkit slug: `pexels`
- Source: [Composio Pexels toolkit docs](https://docs.composio.dev/toolkits/pexels)
- Authentication: API key
- Toolkit status in Flazz: normalized, read-only

### Official toolkit tools

1. `PEXELS_COLLECTION_MEDIA`
2. `PEXELS_CURATED_PHOTOS`
3. `PEXELS_FEATURED_COLLECTIONS`
4. `PEXELS_GET_PHOTO`
5. `PEXELS_MY_COLLECTIONS`
6. `PEXELS_POPULAR_VIDEOS`
7. `PEXELS_SEARCH_PHOTOS`
8. `PEXELS_SEARCH_VIDEOS`

### Normalized mapping in Flazz

- Resource type: `file`
- Capabilities:
  - `list`
  - `search`
  - `read`
- Support level: `read_only`

### Mapping details

- `list`
  - default: `PEXELS_CURATED_PHOTOS`
  - `additionalInput.mediaType = "video"` or `listMode = "popular_videos"` -> `PEXELS_POPULAR_VIDEOS`
  - `additionalInput.listMode = "featured_collections"` -> `PEXELS_FEATURED_COLLECTIONS`
  - `additionalInput.listMode = "my_collections"` -> `PEXELS_MY_COLLECTIONS`
  - `additionalInput.collectionId` or `collection_id` -> `PEXELS_COLLECTION_MEDIA`

- `search`
  - default: `PEXELS_SEARCH_PHOTOS`
  - `additionalInput.mediaType = "video"` -> `PEXELS_SEARCH_VIDEOS`

- `read`
  - `PEXELS_GET_PHOTO`

### Current gap

- The current Composio Pexels toolkit docs do not expose a dedicated `get video by id` action.
- Because of that, normalized `read` is photo-oriented while video discovery remains available through `list` and `search`.
