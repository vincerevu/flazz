import { search } from '@flazz/core/dist/search/search.js';
import type { InvokeHandlers } from '../ipc.js';

export function registerSearchHandlers(handlers: Partial<InvokeHandlers>) {
  handlers['search:query'] = async (_event, args) => {
    return search(args.query, args.limit, args.types);
  };
}
