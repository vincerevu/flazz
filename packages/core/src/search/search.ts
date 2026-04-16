import { SearchResult } from './provider.js';
import { MemorySearchProvider } from './memory_search.js';
import { RunsSearchProvider } from './runs_search.js';

type SearchType = 'memory' | 'chat';

/**
 * Search across memory notes and chat history.
 * @param types - optional filter to search only specific types (default: both)
 */
export async function search(query: string, limit = 20, types?: SearchType[]): Promise<{ results: SearchResult[] }> {
  console.time('search-query');
  const trimmed = query.trim();
  if (!trimmed) {
    console.timeEnd('search-query');
    return { results: [] };
  }

  const searchMemoryEnabled = !types || types.includes('memory');
  const searchChatsEnabled = !types || types.includes('chat');

  const memoryProvider = new MemorySearchProvider();
  const runsProvider = new RunsSearchProvider();

  const [memoryResults, chatResults] = await Promise.all([
    searchMemoryEnabled ? memoryProvider.search(trimmed, limit) : Promise.resolve([]),
    searchChatsEnabled ? runsProvider.search(trimmed, limit) : Promise.resolve([]),
  ]);

  const results = [...memoryResults, ...chatResults].slice(0, limit);
  console.timeEnd('search-query');
  return { results };
}
