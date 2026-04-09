import { z } from "zod";
import * as path from "path";
import * as fs from "fs/promises";
import { glob } from "glob";
import { WorkDir } from "../../../config/config.js";
import { execSync } from "child_process";
import * as workspace from "../../../workspace/workspace.js";
import { generateText } from "ai";
import { createProvider } from "../../../models/models.js";
import { IModelConfigRepo } from "../../../models/repo.js";
import container from "../../../di/container.js";

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
        description: 'List directory contents. Can recursively explore directory structure with options.',
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
                return entries;
            } catch (error) {
                return {
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        },
    },

    'workspace-readFile': {
        description: 'Read file contents from the workspace. Supports utf8, base64, and binary encodings.',
        inputSchema: z.object({
            path: z.string().min(1).describe('Workspace-relative file path'),
            encoding: z.enum(['utf8', 'base64', 'binary']).optional().describe('File encoding (default: utf8)'),
        }),
        execute: async ({ path: relPath, encoding = 'utf8' }: { path: string; encoding?: 'utf8' | 'base64' | 'binary' }) => {
            try {
                return await workspace.readFile(relPath, encoding);
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
        description: 'Search file contents using regex. Returns matching files and lines. Uses ripgrep if available, falls back to grep.',
        inputSchema: z.object({
            pattern: z.string().describe('Regex pattern to search for'),
            searchPath: z.string().optional().describe('Directory or file to search, relative to workspace root (default: workspace root)'),
            fileGlob: z.string().optional().describe('File pattern filter (e.g., "*.ts", "*.md")'),
            contextLines: z.number().optional().describe('Lines of context around matches (default: 0)'),
            maxResults: z.number().optional().describe('Maximum results to return (default: 100)'),
        }),
        execute: async ({
            pattern,
            searchPath,
            fileGlob,
            contextLines = 0,
            maxResults = 100
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

                // Try ripgrep first
                try {
                    const rgArgs = [
                        '--json',
                        '-e', JSON.stringify(pattern),
                        contextLines > 0 ? `-C ${contextLines}` : '',
                        fileGlob ? `--glob ${JSON.stringify(fileGlob)}` : '',
                        `--max-count ${maxResults}`,
                        '--ignore-case',
                        JSON.stringify(resolvedTargetPath),
                    ].filter(Boolean).join(' ');

                    const output = execSync(`rg ${rgArgs}`, {
                        encoding: 'utf8',
                        maxBuffer: 10 * 1024 * 1024,
                        cwd: WorkDir,
                    });

                    const matches = output.trim().split('\n')
                        .filter(Boolean)
                        .map(line => {
                            try {
                                return JSON.parse(line);
                            } catch {
                                return null;
                            }
                        })
                        .filter(m => m && m.type === 'match');

                    return {
                        matches: matches.map(m => ({
                            file: path.relative(WorkDir, m.data.path.text),
                            line: m.data.line_number,
                            content: m.data.lines.text.trim(),
                        })),
                        count: matches.length,
                        tool: 'ripgrep',
                    };
                } catch (_rgError) { // eslint-disable-line @typescript-eslint/no-unused-vars
                    // Fallback to basic grep if ripgrep not available or failed
                    const grepArgs = [
                        '-rn',
                        fileGlob ? `--include=${JSON.stringify(fileGlob)}` : '',
                        JSON.stringify(pattern),
                        JSON.stringify(resolvedTargetPath),
                        `| head -${maxResults}`,
                    ].filter(Boolean).join(' ');

                    try {
                        const output = execSync(`grep ${grepArgs}`, {
                            encoding: 'utf8',
                            maxBuffer: 10 * 1024 * 1024,
                            shell: '/bin/sh',
                        });

                        const lines = output.trim().split('\n').filter(Boolean);
                        return {
                            matches: lines.map(line => {
                                const match = line.match(/^(.+?):(\d+):(.*)$/);
                                if (match) {
                                    return {
                                        file: path.relative(WorkDir, match[1]),
                                        line: parseInt(match[2], 10),
                                        content: match[3].trim(),
                                    };
                                }
                                return { file: '', line: 0, content: line };
                            }),
                            count: lines.length,
                            tool: 'grep',
                        };
                    } catch {
                        // No matches found (grep returns non-zero on no matches)
                        return { matches: [], count: 0, tool: 'grep' };
                    }
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
