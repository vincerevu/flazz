import { performance } from 'perf_hooks';
import { getNoteCreationStrictness } from './note_creation_config.js';

function runBenchmark() {
    const iterations = 10000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        getNoteCreationStrictness();
    }
    const end = performance.now();
    console.log(`Executed ${iterations} reads in ${(end - start).toFixed(2)} ms`);
}

runBenchmark();
