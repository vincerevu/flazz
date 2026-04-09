export interface SearchResult {
  type: 'knowledge' | 'chat';
  title: string;
  preview: string;
  path: string;
}

export interface SearchProvider {
  search(query: string, limit: number): Promise<SearchResult[]>;
}
