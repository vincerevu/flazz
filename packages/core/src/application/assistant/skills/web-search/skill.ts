export const skill = String.raw`
# Web Search Skill

You have access to two search tools for finding information on the internet. Choose the right one based on the user's intent.

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

**CRITICAL: Always start with exactly ONE search call.** Pick the single best tool (\`web-search\` or \`research-search\`) and make one request. Wait for the result before deciding if more searches are needed.

**NEVER call multiple search tools simultaneously.** No parallel web-search + research-search. No firing off two web-searches at once. Always sequential: one search at a time.

Only make a follow-up search if:
- The first search returned truly uninformative or irrelevant results
- The query has clearly distinct sub-topics that the first search couldn't cover (e.g., "compare X and Y" after getting results for X only)
- The user explicitly asks you to dig deeper

One good search is almost always enough. Default to one and stop.

## Choosing Between the Two

If both tools are attached, prefer:
- \`web-search\` when the user wants a quick answer or specific link
- \`research-search\` when the user wants to learn, explore, or gather sources

If only one is attached, use whichever is available. In normal Flazz setups, \`web-search\` should be considered available because DuckDuckGo is the built-in default fallback.

If you are checking MCP-backed search servers, do not treat \`state: "disconnected"\` with \`error: null\` as unavailable. That usually means the server is configured but not connected yet, so you should still try \`listMcpTools\`.
`;

export default skill;
