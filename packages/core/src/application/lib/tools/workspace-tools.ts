import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { glob } from "glob";
import { WorkDir } from "../../../config/config.js";
import { execFileSync, execSync } from "child_process";
import * as workspace from "../../../workspace/workspace.js";
import { generateText } from "ai";
import { createProvider } from "../../../models/models.js";
import { IModelConfigRepo } from "../../../models/repo.js";
import container from "../../../di/container.js";

// ─── File size guards ─────────────────────────────────────────────────────────
// Prevent large files from flooding the LLM context window.

/** Max bytes returned raw from workspace-readFile (~50k tokens at 4 chars/token) */
const READ_FILE_MAX_BYTES = 200_000;

/** Max bytes accepted by parseFile / LLMParse before returning a helpful error */
const PARSE_FILE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Max total chars for workspace-grep result payload (~15k tokens).
 * Prevents a single grep from flooding the conversation history.
 * Individual match content is also capped at 300 chars.
 */
const GREP_MAX_OUTPUT_CHARS = 60_000;
const GREP_MATCH_CONTENT_MAX_CHARS = 300;

/** Suffix appended when a text file is truncated */
const READ_FILE_TRUNCATE_NOTICE = `\n\n...[File truncated: content exceeded ${READ_FILE_MAX_BYTES.toLocaleString()} bytes. Use workspace-grep or request specific sections.]`;

// Parser libraries are loaded dynamically inside parseFile.execute()
// to avoid pulling pdfjs-dist's DOM polyfills into the main bundle.
// Import paths are computed so esbuild cannot statically resolve them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _importDynamic = new Function('mod', 'return import(mod)') as (mod: string) => Promise<any>;

const LLMPARSE_MIME_TYPES: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".html": "text/html",
    ".htm": "text/html",
    ".png": "image/png",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
};

async function grepFallbackSearch({
    pattern,
    resolvedTargetPath,
    fileGlob,
    maxResults,
}: {
    pattern: string;
    resolvedTargetPath: string;
    fileGlob?: string;
    maxResults: number;
}) {
    const regex = new RegExp(pattern, "i");
    const stats = await fs.lstat(resolvedTargetPath);
    const files = stats.isDirectory()
        ? await glob(fileGlob ?? "**/*", {
            cwd: resolvedTargetPath,
            absolute: true,
            nodir: true,
            dot: false,
        })
        : [resolvedTargetPath];

    const matches: Array<{ file: string; line: number; content: string }> = [];
    for (const file of files) {
        let content: string;
        try {
            content = await fs.readFile(file, "utf8");
        } catch {
            continue;
        }

        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index]!;
            if (!regex.test(line)) continue;
            matches.push({
                file: path.relative(WorkDir, file),
                line: index + 1,
                content: line.trim(),
            });
            if (matches.length >= maxResults) {
                return {
                    matches,
                    count: matches.length,
                    tool: 'js-grep',
                };
            }
        }
    }

    return {
        matches,
        count: matches.length,
        tool: 'js-grep',
    };
}

export const workspaceTools = {
    'workspace-getRoot': {
        description: 'Get the workspace root directory path',
        inputSchema: z.object({}),
        execute: async () => {
            try {
                return await workspace.getRoot();
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-exists': {
        description: 'Check if a file or directory exists in the workspace',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative path to check'),
        }),
        execute: async ({ path: relPath }: { path: string }) => {
            try {
                return await workspace.exists(relPath);
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-stat': {
        description: 'Get file or directory statistics (size, modification time, etc.)',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative path to stat'),
        }),
        execute: async ({ path: relPath }: { path: string }) => {
            try {
                return await workspace.stat(relPath);
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-readdir': {
        description: 'List directory contents. Can recursively explore directory structure with options. Results are capped at 500 entries — use allowedExtensions or a specific subpath to narrow results for large directories.',
        inputSchema: z.object({
            path: z.string().describe('Workspace-relative directory path (empty string for root)'),
            recursive: z.boolean().optional().describe('Recursively list all subdirectories (default: false)'),
            includeStats: z.boolean().optional().describe('Include file stats like size and modification time (default: false)'),
            includeHidden: z.boolean().optional().describe('Include hidden files starting with . (default: false)'),
            allowedExtensions: z.array(z.string()).optional().describe('Filter by file extensions (e.g., [".json", ".ts"])'),
        }),
        execute: async ({
            path: relPath,
            recursive,
            includeStats,
            includeHidden,
            allowedExtensions
        }: {
            path: string;
            recursive?: boolean;
            includeStats?: boolean;
            includeHidden?: boolean;
            allowedExtensions?: string[];
        }) => {
            try {
                const entries = await workspace.readdir(relPath || '', {
                    recursive,
                    includeStats,
                    includeHidden,
                    allowedExtensions,
                });

                // Cap output to prevent context flooding on large recursive listings.
                const MAX_ENTRIES = 500;
                if (Array.isArray(entries) && entries.length > MAX_ENTRIES) {
                    return {
                        entries: entries.slice(0, MAX_ENTRIES),
                        count: entries.length,
                        returnedCount: MAX_ENTRIES,
                        truncated: true,
                        hint: `Directory listing truncated to ${MAX_ENTRIES} of ${entries.length} entries. Use allowedExtensions or a more specific subpath to narrow results.`,
                    };
                }

                return entries;
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-readFile': {
        description: 'Read file contents from the workspace. Supports utf8, base64, and binary encodings. Files larger than 200 KB are automatically truncated — use workspace-grep to search large files instead.',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative file path'),
            encoding: z.enum(['utf8', 'base64', 'binary']).optional().describe('File encoding (default: utf8)'),
        }),
        execute: async ({ path: relPath, encoding = 'utf8' }: { path: string; encoding?: 'utf8' | 'base64' | 'binary' }) => {
            try {
                const result = await workspace.readFile(relPath, encoding);

                // Gate: truncate oversized utf8 text to avoid flooding context.
                // Binary / base64 encodings are not truncated — callers handle them.
                if (encoding === 'utf8' && typeof result.data === 'string' && result.data.length > READ_FILE_MAX_BYTES) {
                    return {
                        ...result,
                        data: result.data.slice(0, READ_FILE_MAX_BYTES) + READ_FILE_TRUNCATE_NOTICE,
                        truncated: true,
                        originalBytes: Buffer.byteLength(result.data, 'utf8'),
                        hint: 'File was truncated. Use workspace-grep to search for specific content, or request a byte range.',
                    };
                }

                return result;
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-writeFile': {
        description: 'Write or update file contents in the workspace. Automatically creates parent directories and supports atomic writes.',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative file path'),
            data: z.string().describe('File content to write'),
            encoding: z.enum(['utf8', 'base64', 'binary']).optional().describe('Data encoding (default: utf8)'),
            atomic: z.boolean().optional().describe('Use atomic write (default: true)'),
            mkdirp: z.boolean().optional().describe('Create parent directories if needed (default: true)'),
            expectedEtag: z.string().optional().describe('ETag to check for concurrent modifications (conflict detection)'),
        }),
        execute: async ({
            path: relPath,
            data,
            encoding,
            atomic,
            mkdirp,
            expectedEtag
        }: {
            path: string;
            data: string;
            encoding?: 'utf8' | 'base64' | 'binary';
            atomic?: boolean;
            mkdirp?: boolean;
            expectedEtag?: string;
        }) => {
            try {
                return await workspace.writeFile(relPath, data, {
                    encoding,
                    atomic,
                    mkdirp,
                    expectedEtag,
                });
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-edit': {
        description: 'Make precise edits to a file by replacing specific text. Safer than rewriting entire files - produces smaller diffs and reduces risk of data loss.',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative file path'),
            oldString: z.string().describe('Exact text to find and replace'),
            newString: z.string().describe('Replacement text'),
            replaceAll: z.boolean().optional().describe('Replace all occurrences (default: false, fails if not unique)'),
        }),
        execute: async ({
            path: relPath,
            oldString,
            newString,
            replaceAll = false
        }: {
            path: string;
            oldString: string;
            newString: string;
            replaceAll?: boolean;
        }) => {
            try {
                const result = await workspace.readFile(relPath, 'utf8');
                const content = result.data;

                const occurrences = content.split(oldString).length - 1;

                if (occurrences === 0) {
                    return { error: 'oldString not found in file' };
                }

                if (occurrences > 1 && !replaceAll) {
                    return {
                        error: `oldString found ${occurrences} times. Use replaceAll: true or provide more context to make it unique.`
                    };
                }

                const newContent = replaceAll
                    ? content.replaceAll(oldString, newString)
                    : content.replace(oldString, newString);

                await workspace.writeFile(relPath, newContent, { encoding: 'utf8' });

                return {
                    success: true,
                    replacements: replaceAll ? occurrences : 1
                };
            } catch (error) {
                return { error: error instanceof Error ? error.message : 'Unknown error' };
            }
        },
    },

    'workspace-mkdir': {
        description: 'Create a directory in the workspace',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative directory path'),
            recursive: z.boolean().optional().describe('Create parent directories if needed (default: true)'),
        }),
        execute: async ({ path: relPath, recursive = true }: { path: string; recursive?: boolean }) => {
            try {
                return await workspace.mkdir(relPath, recursive);
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-rename': {
        description: 'Rename or move a file or directory in the workspace',
        inputSchema: z.object({
            from: z.string().min(1).describe('Source workspace-relative path'),
            to: z.string().min(1).describe('Destination workspace-relative path'),
            overwrite: z.boolean().optional().describe('Overwrite destination if it exists (default: false)'),
        }),
        execute: async ({ from, to, overwrite = false }: { from: string; to: string; overwrite?: boolean }) => {
            try {
                return await workspace.rename(from, to, overwrite);
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-copy': {
        description: 'Copy a file in the workspace (directories not supported)',
        inputSchema: z.object({
            from: z.string().min(1).describe('Source workspace-relative file path'),
            to: z.string().min(1).describe('Destination workspace-relative file path'),
            overwrite: z.boolean().optional().describe('Overwrite destination if it exists (default: false)'),
        }),
        execute: async ({ from, to, overwrite = false }: { from: string; to: string; overwrite?: boolean }) => {
            try {
                return await workspace.copy(from, to, overwrite);
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-remove': {
        description: 'Remove a file or directory from the workspace. Files are moved to trash by default for safety.',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative path to remove'),
            recursive: z.boolean().optional().describe('Required for directories (default: false)'),
            trash: z.boolean().optional().describe('Move to trash instead of permanent delete (default: true)'),
        }),
        execute: async ({ path: relPath, recursive, trash }: { path: string; recursive?: boolean; trash?: boolean }) => {
            try {
                return await workspace.remove(relPath, {
                    recursive,
                    trash,
                });
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-glob': {
        description: 'Find files matching a glob pattern (e.g., "**/*.ts", "src/**/*.json"). Much faster than recursive readdir for finding files.',
        inputSchema: z.object({
            pattern: z.string().describe('Glob pattern to match files'),
            cwd: z.string().optional().describe('Subdirectory to search in, relative to workspace root (default: workspace root)'),
        }),
        execute: async ({ pattern, cwd }: { pattern: string; cwd?: string }) => {
            try {
                const searchDir = cwd ? path.join(WorkDir, cwd) : WorkDir;

                // Ensure search directory is within workspace
                const resolvedSearchDir = path.resolve(searchDir);
                if (!resolvedSearchDir.startsWith(WorkDir)) {
                    return { error: 'Search directory must be within workspace' };
                }

                const files = await glob(pattern, {
                    cwd: searchDir,
                    nodir: true,
                    ignore: ['node_modules/**', '.git/**'],
                });

                return {
                    files,
                    count: files.length,
                    pattern,
                    cwd: cwd || '.',
                };
            } catch (error) {
                return { error: error instanceof Error ? error.message : 'Unknown error' };
            }
        },
    },

    'workspace-grep': {
        description: 'Search file contents using regex. Returns matching files and lines. Uses ripgrep if available, falls back to grep. Results are capped at 50 matches and total output is limited — use fileGlob and searchPath to narrow scope for large workspaces.',
        inputSchema: z.object({
            pattern: z.string().describe('Regex pattern to search for'),
            searchPath: z.string().optional().describe('Directory or file to search, relative to workspace root (default: workspace root)'),
            fileGlob: z.string().optional().describe('File pattern filter (e.g., "*.ts", "*.md")'),
            contextLines: z.number().optional().describe('Lines of context around matches (default: 0)'),
            maxResults: z.number().optional().describe('Maximum results to return (default: 50, max: 50)'),
        }),
        execute: async ({
            pattern,
            searchPath,
            fileGlob,
            contextLines = 0,
            maxResults = 50
        }: {
            pattern: string;
            searchPath?: string;
            fileGlob?: string;
            contextLines?: number;
            maxResults?: number;
        }) => {
            try {
                const targetPath = searchPath ? path.join(WorkDir, searchPath) : WorkDir;

                // Ensure target path is within workspace
                const resolvedTargetPath = path.resolve(targetPath);
                if (!resolvedTargetPath.startsWith(WorkDir)) {
                    return { error: 'Search path must be within workspace' };
                }

                // Hard cap: never return more than 50 results regardless of caller input.
                const effectiveMax = Math.min(maxResults, 50);

                /** Truncate a single match content line to prevent huge lines. */
                const capContent = (s: string) =>
                    s.length <= GREP_MATCH_CONTENT_MAX_CHARS
                        ? s
                        : s.slice(0, GREP_MATCH_CONTENT_MAX_CHARS) + '…';

                /** Cap the total serialized output size and add a truncation notice. */
                function capOutput(result: { matches: unknown[]; count: number; tool: string; truncated?: boolean }) {
                    const json = JSON.stringify(result);
                    if (json.length <= GREP_MAX_OUTPUT_CHARS) return result;
                    // Drop matches until we fit, then flag truncation.
                    let kept = result.matches;
                    while (kept.length > 1 && JSON.stringify({ ...result, matches: kept }).length > GREP_MAX_OUTPUT_CHARS) {
                        kept = kept.slice(0, Math.max(1, Math.floor(kept.length * 0.75)));
                    }
                    return { ...result, matches: kept, count: result.matches.length, returnedCount: kept.length, truncated: true, hint: 'Output truncated to fit context limit. Use searchPath or fileGlob to narrow the search.' };
                }

                // Try ripgrep first
                try {
                    const rgArgs = [
                        '--json',
                        '-e', pattern,
                        '--ignore-case',
                        '--max-count', String(effectiveMax),
                    ];
                    if (contextLines > 0) {
                        rgArgs.push('-C', String(contextLines));
                    }
                    if (fileGlob) {
                        rgArgs.push('--glob', fileGlob);
                    }
                    rgArgs.push(resolvedTargetPath);

                    const output = execFileSync('rg', rgArgs, {
                        encoding: 'utf8',
                        // 512 KB — enough for 50 matches with context, prevents memory blow-up.
                        maxBuffer: 512 * 1024,
                        cwd: WorkDir,
                    });

                    const matches = output.trim().split('\n')
                        .filter(Boolean)
                        .map(line => {
                            try { return JSON.parse(line); } catch { return null; }
                        })
                        .filter(m => m && m.type === 'match');

                    return capOutput({
                        matches: matches.map(m => ({
                            file: path.relative(WorkDir, m.data.path.text),
                            line: m.data.line_number,
                            content: capContent(m.data.lines.text.trim()),
                        })),
                        count: matches.length,
                        tool: 'ripgrep',
                    });
                } catch (_rgError) { // eslint-disable-line @typescript-eslint/no-unused-vars
                    const fallback = await grepFallbackSearch({
                        pattern,
                        resolvedTargetPath,
                        fileGlob,
                        maxResults: effectiveMax,
                    });
                    if ('matches' in fallback) {
                        return capOutput({
                            matches: (fallback.matches as Array<{ file: string; line: number; content: string }>).map(m => ({ ...m, content: capContent(m.content) })),
                            count: fallback.count,
                            tool: fallback.tool,
                        });
                    }
                    return fallback;
                }
            } catch (error) {
                return { error: error instanceof Error ? error.message : 'Unknown error' };
            }
        },
    },

    'parseFile': {
        description: 'Parse and extract text content from files (PDF, Excel, CSV, Word .docx). Auto-detects format from file extension.',
        inputSchema: z.object({
            path: z.string().min(1).describe('File path to parse. Can be an absolute path or a workspace-relative path.'),
        }),
        execute: async ({ path: filePath }: { path: string }) => {
            try {
                const fileName = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const supportedExts = ['.pdf', '.xlsx', '.xls', '.csv', '.docx'];

                if (!supportedExts.includes(ext)) {
                    return {
                        success: false,
                        error: `Unsupported file format '${ext}'. Supported formats: ${supportedExts.join(', ')}`,
                    };
                }

                // Gate: reject files that are too large to parse safely.
                const statResult = path.isAbsolute(filePath)
                    ? await fs.stat(filePath).catch(() => null)
                    : await workspace.stat(path.relative(WorkDir, path.resolve(WorkDir, filePath))).catch(() => null);
                const fileSizeBytes = (statResult as { size?: number } | null)?.size ?? 0;
                if (fileSizeBytes > PARSE_FILE_MAX_BYTES) {
                    return {
                        success: false,
                        error: `File is too large to parse (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum supported size is ${PARSE_FILE_MAX_BYTES / 1024 / 1024} MB.`,
                        fileSizeBytes,
                    };
                }

                // Read file as buffer — support both absolute and workspace-relative paths
                let buffer: Buffer;
                if (path.isAbsolute(filePath)) {
                    buffer = await fs.readFile(filePath);
                } else {
                    const result = await workspace.readFile(filePath, 'base64');
                    buffer = Buffer.from(result.data, 'base64');
                }

                if (ext === '.pdf') {
                    const { PDFParse } = await _importDynamic("pdf-parse");
                    const parser = new PDFParse({ data: new Uint8Array(buffer) });
                    try {
                        const textResult = await parser.getText();
                        const infoResult = await parser.getInfo();
                        return {
                            success: true,
                            fileName,
                            format: 'pdf',
                            content: textResult.text,
                            metadata: {
                                pages: textResult.total,
                                title: infoResult.info?.Title || undefined,
                                author: infoResult.info?.Author || undefined,
                            },
                        };
                    } finally {
                        await parser.destroy();
                    }
                }

                if (ext === '.xlsx' || ext === '.xls') {
                    const XLSX = await _importDynamic("xlsx");
                    const workbook = XLSX.read(buffer, { type: 'buffer' });
                    const sheets: Record<string, string> = {};
                    for (const sheetName of workbook.SheetNames) {
                        const sheet = workbook.Sheets[sheetName];
                        sheets[sheetName] = XLSX.utils.sheet_to_csv(sheet);
                    }
                    return {
                        success: true,
                        fileName,
                        format: ext === '.xlsx' ? 'xlsx' : 'xls',
                        content: Object.values(sheets).join('\n\n'),
                        metadata: {
                            sheetNames: workbook.SheetNames,
                            sheetCount: workbook.SheetNames.length,
                        },
                        sheets,
                    };
                }

                if (ext === '.csv') {
                    const Papa = (await _importDynamic("papaparse")).default;
                    const text = buffer.toString('utf8');
                    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
                    return {
                        success: true,
                        fileName,
                        format: 'csv',
                        content: text,
                        metadata: {
                            rowCount: parsed.data.length,
                            headers: parsed.meta.fields || [],
                        },
                        data: parsed.data,
                    };
                }

                if (ext === '.docx') {
                    const mammoth = (await _importDynamic("mammoth")).default;
                    const docResult = await mammoth.extractRawText({ buffer });
                    return {
                        success: true,
                        fileName,
                        format: 'docx',
                        content: docResult.value,
                    };
                }

                return { success: false, error: 'Unexpected error' };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'LLMParse': {
        description: 'Send a file to the configured LLM as a multimodal attachment and ask it to extract content as markdown. Best for scanned PDFs, images with text, complex layouts, or any format where local parsing falls short. Supports documents (PDF, Word, Excel, PowerPoint, CSV, TXT, HTML) and images (PNG, JPG, GIF, WebP, SVG, BMP, TIFF).',
        inputSchema: z.object({
            path: z.string().min(1).describe('File path to parse. Can be an absolute path or a workspace-relative path.'),
            prompt: z.string().optional().describe('Custom instruction for the LLM (defaults to "Convert this file to well-structured markdown.")'),
        }),
        execute: async ({ path: filePath, prompt }: { path: string; prompt?: string }) => {
            try {
                const fileName = path.basename(filePath);
                const ext = path.extname(filePath).toLowerCase();
                const mimeType = LLMPARSE_MIME_TYPES[ext];

                if (!mimeType) {
                    return {
                        success: false,
                        error: `Unsupported file format '${ext}'. Supported formats: ${Object.keys(LLMPARSE_MIME_TYPES).join(', ')}`,
                    };
                }

                // Gate: reject files that are too large to safely pass to the LLM.
                const statResult = path.isAbsolute(filePath)
                    ? await fs.stat(filePath).catch(() => null)
                    : await workspace.stat(path.relative(WorkDir, path.resolve(WorkDir, filePath))).catch(() => null);
                const fileSizeBytes = (statResult as { size?: number } | null)?.size ?? 0;
                if (fileSizeBytes > PARSE_FILE_MAX_BYTES) {
                    return {
                        success: false,
                        error: `File is too large for LLMParse (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum supported size is ${PARSE_FILE_MAX_BYTES / 1024 / 1024} MB.`,
                        fileSizeBytes,
                    };
                }

                // Read file as buffer — support both absolute and workspace-relative paths
                let buffer: Buffer;
                if (path.isAbsolute(filePath)) {
                    buffer = await fs.readFile(filePath);
                } else {
                    const result = await workspace.readFile(filePath, 'base64');
                    buffer = Buffer.from(result.data, 'base64');
                }

                const base64 = buffer.toString('base64');

                // Resolve model config from DI container
                const modelConfigRepo = container.resolve<IModelConfigRepo>('modelConfigRepo');
                const modelConfig = await modelConfigRepo.getConfig();
                const provider = createProvider(modelConfig.provider);
                const model = provider.languageModel(modelConfig.model);

                const userPrompt = prompt || 'Convert this file to well-structured markdown.';

                const response = await generateText({
                    model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: userPrompt },
                                { type: 'file', data: base64, mediaType: mimeType },
                            ],
                        },
                    ],
                });

                return {
                    success: true,
                    fileName,
                    format: ext.slice(1),
                    mimeType,
                    content: response.text,
                    usage: response.usage,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },


};
