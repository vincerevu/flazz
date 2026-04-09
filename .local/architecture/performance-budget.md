# Performance Budget and Scaling Strategy

## Performance Budget

This document outlines the baseline performance metrics and budgets for the application.

| Metric | Target | Warning Trigger | Notes |
| :--- | :--- | :--- | :--- |
| **App Cold Start** | < 2s | > 3s | Measured from launch (`console.time('app-startup')`) to UI ready (`app.whenReady()`). |
| **Search (100 files)** | < 50ms | > 100ms | Includes both knowledge and chat history scans. |
| **Search (1000 files)** | < 100ms | > 200ms | Varies based on fs cache (`console.time('search-query')`). |
| **Render Time (50 msgs)** | < 50ms | > 100ms | Time for UI to render a conversation of 50 messages. |
| **Knowledge Index Build (1k files)** | < 200ms | > 500ms | Scan and index time (`console.time('build-knowledge-index')`). |

## Hot Paths Identified

1. **Runtime Loop (`packages/core/src/agents/runtime.ts`)**
   - **Why**: Handles streaming from LLM, invoking tools, context handling, and maintaining state.
   - **Concern**: Slow or blocking tool invocations can freeze loop iterations. Large message arrays impact LLM context processing time.

2. **Search Scan (`packages/core/src/search/search.ts` & providers)**
   - **Why**: Uses a pure Node.js `fs`-based search.
   - **Concern**: Scaling with the number of files. With 1000+ files, naive recursive text search will hit I/O bottlenecks and memory limits.

3. **Knowledge Graph Build (`packages/core/src/knowledge/knowledge_index.ts`)**
   - **Why**: Parses entire knowledge workspace content to rebuild the index.
   - **Concern**: Rebuilding on a large dataset recursively (`scanDirectoryRecursive`) scales linearly with the number of markdown files.

## Scaling Strategy

* **Startup Optimization**:
  - Defer non-critical services (sync tasks, heavy IO operations) until after the main window renders.
* **Search Optimization**:
  - Move from full regex scan to a persistent inverted index (e.g. SQLite, Lunr) if workspace scales beyond 10,000 files.
  - Implement caching for unmodified files.
* **Knowledge Index Optimization**:
  - Adopt incremental indexing (only rebuild files triggered by file system watchers) rather than full sweeps.
* **Render Loop Optimization**:
  - Implement virtualization/pagination in the Chat UI when messages exceed ~100 items.
