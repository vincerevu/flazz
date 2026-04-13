export interface MemorySection {
  content: string; // Multiline content, no timestamp prefix
}

export interface Memory {
  agent: MemorySection[];
  user: MemorySection[];
}

export interface MemoryConfig {
  agentMaxChars: number; // 2200
  userMaxChars: number; // 1375
  delimiter: string; // '\n§\n' for multiline entries
}

export interface IMemoryRepo {
  read(): Promise<Memory>;
  write(section: 'agent' | 'user', content: string): Promise<void>;
  search(query: string): Promise<MemorySection[]>;
  clear(section: 'agent' | 'user'): Promise<void>;
  atomicWrite(section: 'agent' | 'user', entries: MemorySection[]): Promise<void>;
}
