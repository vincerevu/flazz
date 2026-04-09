import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'test_benchmark_files');
fs.mkdirSync(TEST_DIR, { recursive: true });
const filePaths: string[] = [];
// simulate lots of large files
for (let i = 0; i < 50; i++) {
    const filePath = path.join(TEST_DIR, `file_${i}.txt`);
    fs.writeFileSync(filePath, 'hello world '.repeat(1000000)); // ~12MB each
    filePaths.push(filePath);
}

async function readFileContentsOld(filePaths: string[]): Promise<{ path: string; content: string }[]> {
    const files: { path: string; content: string }[] = [];
    for (const filePath of filePaths) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            files.push({ path: filePath, content });
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
        }
    }
    return files;
}

// FULLY UNBATCHED PROMISE.ALL
async function readFileContentsNew(filePaths: string[]): Promise<{ path: string; content: string }[]> {
    const files = await Promise.all(
        filePaths.map(async (filePath) => {
            try {
                const content = await fs.promises.readFile(filePath, 'utf-8');
                return { path: filePath, content };
            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
                return null;
            }
        })
    );
    return files.filter((f): f is { path: string; content: string } => f !== null);
}

function measureEventLoopLag() {
    let maxLag = 0;
    let lastTime = performance.now();
    const interval = setInterval(() => {
        const now = performance.now();
        const lag = now - lastTime - 10;
        if (lag > maxLag) maxLag = lag;
        lastTime = now;
    }, 10);
    return {
        stop: () => {
            clearInterval(interval);
            const now = performance.now();
            const finalLag = now - lastTime - 10;
            if (finalLag > maxLag) maxLag = finalLag;
            return maxLag;
        }
    };
}

async function runBenchmark() {
    // Warmup
    await readFileContentsOld(filePaths.slice(0, 2));
    await readFileContentsNew(filePaths.slice(0, 2));

    console.log('Running Old (Synchronous)...');
    let trackerOld = measureEventLoopLag();
    let startOld = performance.now();
    await readFileContentsOld(filePaths);
    let timeOld = performance.now() - startOld;
    let lagOld = trackerOld.stop();
    console.log(`Old took ${timeOld.toFixed(2)}ms, max event loop block: ${lagOld.toFixed(2)}ms`);

    await new Promise(r => setTimeout(r, 1000));

    console.log('Running New (Asynchronous)...');
    let trackerNew = measureEventLoopLag();
    let startNew = performance.now();
    await readFileContentsNew(filePaths);
    let timeNew = performance.now() - startNew;
    let lagNew = trackerNew.stop();
    console.log(`New took ${timeNew.toFixed(2)}ms, max event loop block: ${lagNew.toFixed(2)}ms`);

    // clean up
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
}

runBenchmark();
