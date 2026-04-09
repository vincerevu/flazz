import { search } from '../../../packages/core/src/search/search.js';
import { buildKnowledgeIndex } from '../../../packages/core/src/knowledge/knowledge_index.js';
import fs from 'fs';
import path from 'path';

// WARNING: This script does not override WorkDir and relies on the user's actual Flazz directory.
// DO NOT use this script to create or delete files. It is strictly a read-only execution
// to establish baseline times on whatever files currently exist in the user's workspace.
async function runBenchmark() {
    console.log('--- Benchmarking Search (Read Only) ---');
    console.log('Query: "project"');
    await search('project', 20);

    console.log('\n--- Benchmarking Knowledge Graph Build (Read Only) ---');
    await buildKnowledgeIndex();

    console.log('\nDone.');
}

runBenchmark().catch(console.error);
