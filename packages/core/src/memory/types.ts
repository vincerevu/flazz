export interface MemorySection {
  timestamp: string;
  content: string;
}

export interface Memory {
  agent: MemorySection[];
  user: MemorySection[];
}

export interface MemoryConfig {
  agentMaxChars: number; // 2200
  userMaxChars: number; // 1375
  delimiter: string; // '§'
}

export interface IMemoryRepo {
  read(): Promise<Memory>;
  write(section: 'agent' | 'user', content: string): Promise<void>;
  search(query: string): Promise<MemorySection[]>;
  clear(section: 'agent' | 'user'): Promise<void>;
}
