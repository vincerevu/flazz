import { SearchResult } from './provider.js';
import { KnowledgeSearchProvider } from './knowledge_search.js';
import { RunsSearchProvider } from './runs_search.js';

type SearchType = 'knowledge' | 'chat';

/**
 * Search across knowledge files and chat history.
 * @param types - optional filter to search only specific types (default: both)
 */
export async function search(query: string, limit = 20, types?: SearchType[]): Promise<{ results: SearchResult[] }> {
  console.time('search-query');
  const trimmed = query.trim();
  if (!trimmed) {
    console.timeEnd('search-query');
    return { results: [] };
  }

  const searchKnowledgeEnabled = !types || types.includes('knowledge');
  const searchChatsEnabled = !types || types.includes('chat');

  const knowledgeProvider = new KnowledgeSearchProvider();
  const runsProvider = new RunsSearchProvider();

  const [knowledgeResults, chatResults] = await Promise.all([
    searchKnowledgeEnabled ? knowledgeProvider.search(trimmed, limit) : Promise.resolve([]),
    searchChatsEnabled ? runsProvider.search(trimmed, limit) : Promise.resolve([]),
  ]);

  const results = [...knowledgeResults, ...chatResults].slice(0, limit);
  console.timeEnd('search-query');
  return { results };
}
