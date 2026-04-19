export interface SearchResult {
  type: 'memory' | 'chat';
  title: string;
  preview: string;
  path: string;
  score?: number;
  scoreBreakdown?: {
    keyword: number;
    graph: number;
    recency: number;
    total: number;
  };
}

export interface SearchProvider {
  search(query: string, limit: number): Promise<SearchResult[]>;
}
