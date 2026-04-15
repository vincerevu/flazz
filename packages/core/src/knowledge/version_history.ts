import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import { WorkDir } from '../config/config.js';

const MEMORY_DIR = path.join(WorkDir, 'memory');

// Simple promise-based mutex to serialize commits
let commitLock: Promise<void> = Promise.resolve();

// Commit listeners for notifying other layers (e.g. renderer refresh)
type CommitListener = () => void;
const commitListeners: CommitListener[] = [];

export function onCommit(listener: CommitListener): () => void {
    commitListeners.push(listener);
    return () => {
        const idx = commitListeners.indexOf(listener);
        if (idx >= 0) commitListeners.splice(idx, 1);
    };
}

/**
 * Initialize a git repo in the memory directory if one doesn't exist.
 * Stages all existing .md files and makes an initial commit.
 */
export async function initRepo(): Promise<void> {
    const gitDir = path.join(MEMORY_DIR, '.git');
    if (fs.existsSync(gitDir)) {
        return;
    }

    // Ensure memory dir exists
    if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    await git.init({ fs, dir: MEMORY_DIR });

    // Stage all existing .md files
    const files = getAllMdFiles(MEMORY_DIR, '');
    for (const file of files) {
        await git.add({ fs, dir: MEMORY_DIR, filepath: file });
    }

    if (files.length > 0) {
        await git.commit({
            fs,
            dir: MEMORY_DIR,
            message: 'Initial snapshot',
            author: { name: 'Flazz', email: 'local' },
        });
    }
}

/**
 * Recursively find all .md files relative to the memory dir.
 */
function getAllMdFiles(baseDir: string, relDir: string): string[] {
    const results: string[] = [];
    const absDir = relDir ? path.join(baseDir, relDir) : baseDir;
    let entries: string[];
    try {
        entries = fs.readdirSync(absDir);
    } catch {
        return results;
    }
    for (const entry of entries) {
        if (entry === '.git' || entry.startsWith('.')) continue;
        const fullPath = path.join(absDir, entry);
        const relPath = relDir ? `${relDir}/${entry}` : entry;
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            results.push(...getAllMdFiles(baseDir, relPath));
        } else if (entry.endsWith('.md')) {
            results.push(relPath);
        }
    }
    return results;
}

/**
 * Stage all changes to .md files and commit. No-op if nothing changed.
 * Serialized via a promise lock to prevent concurrent git index corruption.
 */
export async function commitAll(message: string, authorName: string): Promise<void> {
    const prev = commitLock;
    let resolve: () => void;
    commitLock = new Promise(r => { resolve = r; });

    await prev;
    try {
        await commitAllInner(message, authorName);
    } finally {
        resolve!();
    }
}

async function commitAllInner(message: string, authorName: string): Promise<void> {
    const matrix = await git.statusMatrix({ fs, dir: MEMORY_DIR });

    let hasChanges = false;
    for (const [filepath, head, workdir, stage] of matrix) {
        // Skip non-md files
        if (!filepath.endsWith('.md')) continue;

        // [filepath, HEAD, WORKDIR, STAGE]
        // Unchanged: [f, 1, 1, 1]
        if (head === 1 && workdir === 1 && stage === 1) continue;

        hasChanges = true;

        if (workdir === 0) {
            // File deleted from workdir
            await git.remove({ fs, dir: MEMORY_DIR, filepath });
        } else {
            // File added or modified
            await git.add({ fs, dir: MEMORY_DIR, filepath });
        }
    }

    if (!hasChanges) return;

    await git.commit({
        fs,
        dir: MEMORY_DIR,
        message,
        author: { name: authorName, email: 'local' },
    });

    for (const listener of commitListeners) {
        try { listener(); } catch { /* ignore */ }
    }
}

export interface CommitInfo {
    oid: string;
    message: string;
    timestamp: number;
    author: string;
}

const MAX_FILE_HISTORY = 50;

/**
 * Get commit history for a specific file.
 * Returns commits where the file content changed, most recent first.
 * Capped at MAX_FILE_HISTORY entries.
 */
export async function getFileHistory(memoryRelPath: string): Promise<CommitInfo[]> {
    // Normalize path separators for git (always forward slashes)
    const filepath = memoryRelPath.replace(/\\/g, '/');

    let commits: Awaited<ReturnType<typeof git.log>>;
    try {
        commits = await git.log({ fs, dir: MEMORY_DIR });
    } catch {
        return [];
    }

    if (commits.length === 0) return [];

    const result: CommitInfo[] = [];

    // Walk through commits and check if file changed between consecutive commits
    for (let i = 0; i < commits.length; i++) {
        if (result.length >= MAX_FILE_HISTORY) break;

        const commit = commits[i]!;
        const parentCommit = commits[i + 1]; // undefined for the first (oldest) commit

        const currentOid = await getBlobOidAtCommit(commit.oid, filepath);
        const parentOid = parentCommit
            ? await getBlobOidAtCommit(parentCommit.oid, filepath)
            : null;

        // Include this commit if:
        // - The file existed and changed from parent
        // - The file was added (parentOid is null but currentOid exists)
        // - The file was deleted (currentOid is null but parentOid exists)
        if (currentOid !== parentOid) {
            result.push({
                oid: commit.oid,
                message: commit.commit.message.trim(),
                timestamp: commit.commit.author.timestamp,
                author: commit.commit.author.name,
            });
        }
    }

    return result;
}

/**
 * Get the blob OID for a file at a specific commit, or null if not found.
 */
async function getBlobOidAtCommit(commitOid: string, filepath: string): Promise<string | null> {
    try {
        const result = await git.readBlob({
            fs,
            dir: MEMORY_DIR,
            oid: commitOid,
            filepath,
        });
        // Compute a content hash from the blob to compare
        return result.oid;
    } catch {
        return null;
    }
}

/**
 * Read file content at a specific commit.
 */
export async function getFileAtCommit(memoryRelPath: string, oid: string): Promise<string> {
    const filepath = memoryRelPath.replace(/\\/g, '/');
    const result = await git.readBlob({
        fs,
        dir: MEMORY_DIR,
        oid,
        filepath,
    });
    return Buffer.from(result.blob).toString('utf-8');
}

/**
 * Restore a file to its content at a given commit, then commit the restoration.
 */
export async function restoreFile(memoryRelPath: string, oid: string): Promise<void> {
    const content = await getFileAtCommit(memoryRelPath, oid);
    const absPath = path.join(MEMORY_DIR, memoryRelPath);

    // Ensure parent directory exists
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(absPath, content, 'utf-8');

    const filename = path.basename(memoryRelPath);
    await commitAll(`Restored ${filename}`, 'You');
}
