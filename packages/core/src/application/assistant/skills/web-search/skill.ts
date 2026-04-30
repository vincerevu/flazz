export const skill = String.raw`
# Web Search Skill

You have access to three search tools for finding information and visual references on the internet. Choose the right one based on the user's intent.

Research/search requests produce a chat answer by default. Do not create, save, export, or write files for "research", "look into", "deep dive", "analyze", "summarize", "compare", or look-into requests unless the user explicitly asks for a file artifact or a concrete output extension such as \`.pdf\`, \`.docx\`, \`.pptx\`, or \`.xlsx\`. If the user asks for one exact final format, produce only that format and no companion source/sidecar files.

## Tools

### web-search (DuckDuckGo by default, Brave when configured)
Quick, general-purpose web search. Returns titles, URLs, and short descriptions.

**Best for:**
- Quick lookups for things that change ("current price of Bitcoin", "weather in SF")
- Current events and breaking news
- Finding a specific website or page
- Simple questions with direct answers
- Checking a fact or date

**Provider behavior:**
- By default, \`web-search\` uses DuckDuckGo without needing an API key
- If the user selects Brave Search as the default provider and a Brave API key is configured, \`web-search\` uses Brave Search instead
- If Brave is selected but missing a key, \`web-search\` falls back to DuckDuckGo automatically
- Do not treat browser automation, Playwright, or generic page navigation as a substitute for \`web-search\`

### image-search (DuckDuckGo Images)
Image-specific search. Returns image URLs, thumbnail URLs, source pages, dimensions, and source domains.

**Best for:**
- Finding visual references, thumbnails, logos, product images, venue/place photos, people photos, or image URLs
- When the user explicitly asks for images, pictures, photos, logos, visual examples, or image sources
- Finding candidate images for documents, presentations, moodboards, or design/reference work

**Provider behavior:**
- \`image-search\` uses DuckDuckGo Images without needing an API key
- Results are best-effort because DuckDuckGo Images is not an official API
- By default, \`image-search\` avoids common stock/watermarked sources such as Alamy, Shutterstock, Getty, iStock, Dreamstime, Depositphotos, Freepik, Vecteezy, Adobe Stock, and Pinterest. Set \`avoidWatermark: false\` only if the user explicitly wants broad visual references and watermarked previews are acceptable.
- Use \`allowedDomains\` for strict source control, for example official sites or reuse-friendly providers. Use \`blockedDomains\` to exclude additional sources the user dislikes.
- Prefer source pages for attribution and context; do not imply usage rights or license unless you verify them from the source page
- Do not embed returned \`imageUrl\` or \`thumbnailUrl\` values as markdown images in chat tables. Remote image URLs can block hotlinking, expire, or require provider-specific headers. Search proxy thumbnails such as Bing \`tse*.mm.bing.net\` are especially unstable. Let the UI render the \`image-search\` tool card, or list source links when the user needs references.

**Query building:**
- Build a targeted image query instead of copying the user's words blindly. Decide the image intent first.
- For real photos, include \`photo\` plus concrete subject, place, time, style, or context. Example: \`Eiffel Tower Paris night photo\`, not just \`Eiffel Tower image\`.
- For official logos, product shots, people, venues, or brand assets, include \`official\`, \`press kit\`, \`media kit\`, or a known official domain via \`allowedDomains\` when you know it.
- For presentation/document images, prefer reuse-friendly or authoritative terms such as \`Wikimedia Commons\`, \`Creative Commons\`, \`public domain\`, \`Unsplash\`, \`Pexels\`, or \`Pixabay\`.
- For generic stock-like concepts, avoid queries that invite watermark libraries. Keep \`avoidWatermark: true\` and add a stricter \`blockedDomains\` list if the user has complained about a source.
- If the first image result set is weak, refine once with source-quality terms rather than broadening. Example: change \`Paris skyline image\` to \`Paris skyline Wikimedia Commons photo\`.
- For slide/document work, choose sources in this order: official source domains, Wikimedia/public-domain/Creative Commons sources, then Unsplash/Pexels/Pixabay for generic photography. Avoid stock/watermarked domains unless the user explicitly asks for broad references.

### research-search (Exa Search)
Deep, research-oriented search. Returns full article text, highlights, and metadata (author, published date).

**Best for:**
- Exploring a topic in depth ("what are the latest advances in CRISPR")
- Finding articles, blog posts, papers, and quality sources
- Discovering companies, people, or organizations
- Research where you need rich context, not just links
- When the user says "research", "find articles about", "look into", "deep dive"

**Category filter:** Use the category parameter when the user's intent clearly maps to one: company, research paper, news, tweet, personal site, financial report, people.

## How Many Searches to Do

**CRITICAL: Always start with exactly ONE search call.** Pick the single best tool (\`web-search\`, \`image-search\`, or \`research-search\`) and make one request. Wait for the result before deciding if more searches are needed.

**NEVER call multiple search tools simultaneously.** No parallel web-search + image-search + research-search. No firing off two searches at once. Always sequential: one search at a time.

Only make a follow-up search if:
- The first search returned truly uninformative or irrelevant results
- The query has clearly distinct sub-topics that the first search couldn't cover (e.g., "compare X and Y" after getting results for X only)
- The user explicitly asks you to dig deeper

One good search is almost always enough. Default to one and stop.

## Choosing Between the Two

If multiple search tools are attached, prefer:
- \`web-search\` when the user wants a quick answer or specific link
- \`image-search\` when the user wants images, photos, logos, visual references, thumbnails, or direct image URLs
- \`research-search\` when the user wants to learn, explore, or gather sources

If only one is attached, use whichever is available. In normal Flazz setups, \`web-search\` and \`image-search\` should be considered available because DuckDuckGo is the built-in default fallback.

If you are checking MCP-backed search servers, do not treat \`state: "disconnected"\` with \`error: null\` as unavailable. That usually means the server is configured but not connected yet, so you should still try \`listMcpTools\`.
`;

export default skill;
