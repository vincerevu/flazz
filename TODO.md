
# Flazz Architecture Refactor — Jules Task List (Task 6–20)

## Context

Task 1–5 đã hoàn thành:
- Task 1: Architecture baseline docs (`.local/architecture/`)
- Task 2: Renderer app shell tách khỏi App.tsx
- Task 3: Renderer chat domain module hóa
- Task 4: Renderer knowledge domain module hóa
- Task 5: IPC service adapters tạo tại `apps/renderer/src/services/` — toàn bộ `window.ipc` đã được route qua adapters

Base branch để checkout từ: `main`

Mỗi task = 1 branch riêng. Mỗi step = 1 commit. Không gộp task.

Thứ tự thực hiện để tránh conflict:
6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20

---

## TASK 6 — Main process IPC modularization

**Branch:** `refactor/main-ipc-modularization`
**Checkout từ:** `main`
**Files chính đụng:** `apps/main/src/ipc.ts` (file này rất lớn, đa domain)
**Không đụng:** renderer, packages/core, packages/shared

### Mục tiêu
Tách `apps/main/src/ipc.ts` thành các module handler theo domain. File gốc chỉ còn là composition root — import và register các handler module.

### Cấu trúc đích
Tạo thư mục `apps/main/src/ipc/` với các file:
- `workspace.ts` — handlers cho channel `workspace:*`
- `shell.ts` — handlers cho channel `shell:*`
- `runs.ts` — handlers cho channel `runs:*`
- `models.ts` — handlers cho channel `models:*`
- `search.ts` — handlers cho channel `search:*`
- `auth.ts` — handlers cho channel `oauth:*`
- `schedule.ts` — handlers cho channel `agent-schedule:*`
- `integrations.ts` — handlers cho channel `composio:*`, `granola:*`, `mcp:*`
- `knowledge.ts` — handlers cho channel `knowledge:*`
- `app.ts` — handlers cho channel `app:*`
- `index.ts` — composition root: import tất cả modules trên và gọi register

File `apps/main/src/ipc.ts` sau khi xong chỉ còn gọi `registerAllHandlers(ipcMain, container)` hoặc tương đương.

### Steps (mỗi step = 1 commit)
1. `refactor(main): extract workspace and shell ipc handlers`
2. `refactor(main): extract runs models and search ipc handlers`
3. `refactor(main): extract auth integration and scheduling ipc handlers`
4. `refactor(main): slim down ipc bootstrap to composition root`

### Rules
- Không đổi tên channel IPC — giữ nguyên string channel name
- Không đổi logic handler — chỉ move code
- Không thêm dependency mới
- Sau mỗi step: `npx tsc --noEmit` trong `apps/main` phải pass

### Verification
- `apps/main` build pass
- Grep `window.ipc.invoke` từ renderer vẫn match đúng channel name

---

## TASK 7 — Platform-safe build and dev workflow

**Branch:** `refactor/platform-build-workflow`
**Checkout từ:** `main`
**Files chính đụng:** `package.json` (root), `apps/main/package.json`, `apps/renderer/package.json`, `packages/core/package.json`
**Không đụng:** source code logic

### Mục tiêu
Đảm bảo tất cả npm scripts trong repo chạy được trên Windows PowerShell — không dùng `rm -rf`, `&&`, `cp`, `mv` Unix-style.

### Cách làm
1. Scan tất cả `"scripts"` trong mọi `package.json` trong repo
2. Thay `rm -rf` bằng `rimraf` hoặc `npx rimraf`
3. Thay `&&` chaining bằng `npm-run-all` hoặc tách thành scripts riêng
4. Thay `cp`, `mv` Unix bằng `cpx`, `shx cp`, hoặc Node script
5. Nếu cần thêm devDependency (`rimraf`, `shx`, `npm-run-all`), thêm vào đúng package
6. Viết note ngắn vào `.local/architecture/platform-build-notes.md`

### Steps
1. `build(devx): replace unix-only cleanup scripts with rimraf`
2. `build(devx): replace unix-only chaining and move logic`
3. `build(devx): standardize workspace build order`
4. `docs(devx): add platform build notes`

### Verification
- Chạy `npm run build` hoặc `npm run dev` từ PowerShell không lỗi shell syntax

---

## TASK 8 — Portable search and workspace safety

**Branch:** `refactor/search-workspace-safety`
**Checkout từ:** `main`
**Files chính đụng:**
- `packages/core/src/search/search.ts`
- `packages/core/src/workspace/workspace.ts`
**Không đụng:** renderer, apps/main

### Mục tiêu
1. Search không dùng `grep` hay shell command — dùng Node.js `fs` + string matching thuần
2. Workspace path safety có test rõ ràng — không cho path traversal ra ngoài workspace root

### Cách làm search
- Đọc file bằng `fs.readFile` / `fs.readdir` recursive
- Match bằng string `includes()` hoặc regex thuần JS
- Tách interface `SearchProvider` với method `search(query, options): Promise<SearchResult[]>`
- Implement `KnowledgeSearchProvider` và `RunsSearchProvider` riêng

### Cách làm workspace safety
- Đảm bảo mọi path operation trong `workspace.ts` đều gọi một hàm `assertSafePath(root, target)` trước khi đọc/ghi
- `assertSafePath` throw nếu `path.resolve(target)` không bắt đầu bằng `path.resolve(root)`
- Viết unit test cho `assertSafePath` với các case: normal path, `../` traversal, absolute path ngoài root, symlink-like

### Steps
1. `refactor(search): extract search provider interface`
2. `refactor(search): implement node-based knowledge and run search`
3. `refactor(workspace): enforce path safety guard`
4. `test(core): add workspace path safety and search coverage`

### Verification
- `packages/core` typecheck pass
- Tests pass: `npm test` trong `packages/core`

---

## TASK 9 — Builtin-tools modularization

**Branch:** `refactor/builtin-tools-modularization`
**Checkout từ:** `main`
**Files chính đụng:**
- `packages/core/src/application/lib/builtin-tools.ts` (file lớn, đa domain)
**Không đụng:** renderer, apps/main, packages/shared

### Mục tiêu
Tách `builtin-tools.ts` thành các module tool theo domain. File gốc chỉ còn là registry composer.

### Cấu trúc đích
Tạo `packages/core/src/application/lib/tools/`:
- `workspace-tools.ts` — tools đọc/ghi workspace files
- `shell-tools.ts` — tools chạy shell command
- `mcp-tools.ts` — tools liên quan MCP
- `research-tools.ts` — tools search/web research
- `integration-tools.ts` — tools Slack, Composio, external APIs
- `agent-tools.ts` — tools subflow/agent delegation
- `index.ts` — compose và export registry đầy đủ

File `builtin-tools.ts` sau khi xong chỉ còn import từ `tools/index.ts` và export registry.

### Steps
1. `refactor(tools): extract workspace and shell tools`
2. `refactor(tools): extract mcp and agent tools`
3. `refactor(tools): extract research and integration tools`
4. `refactor(tools): rebuild registry composer in builtin-tools`

### Rules
- Không đổi tên tool — giữ nguyên `name` field của mỗi tool
- Không đổi logic tool — chỉ move code
- Sau mỗi step: `npx tsc --noEmit` trong `packages/core` phải pass

### Verification
- `packages/core` build pass
- Smoke test: app khởi động, gửi message có tool call, tool chạy được

---

## TASK 10 — Runtime decomposition

**Branch:** `refactor/runtime-decomposition`
**Checkout từ:** `main` (sau khi Task 9 merge)
**Files chính đụng:**
- `packages/core/src/agents/runtime.ts` (hotspot lớn nhất)
**Không đụng:** renderer, apps/main, packages/shared

### Mục tiêu
Tách `runtime.ts` thành các module nhỏ theo trục trách nhiệm. File gốc chỉ còn là orchestration loop.

### Cấu trúc đích
Tạo `packages/core/src/agents/runtime/`:
- `agent-state.ts` — AgentState type, khởi tạo state, event replay từ run log
- `stream-pipeline.ts` — normalize LLM stream events, build assistant message
- `tool-orchestrator.ts` — execute tool calls, map results
- `subflow-orchestrator.ts` — handle subflow delegation
- `permission-orchestrator.ts` — handle permission request/response flow
- `index.ts` — export public API

File `runtime.ts` sau khi xong chỉ còn là loop chính gọi các module trên.

### Steps
1. `refactor(runtime): extract agent state and event replay`
2. `refactor(runtime): extract llm stream pipeline and message builder`
3. `refactor(runtime): extract tool and subflow orchestration`
4. `test(runtime): add regression coverage for permission and subflow flows`

### Rules
- Không đổi run event schema — giữ nguyên event types từ `packages/shared`
- Không đổi thứ tự event emit
- Sau mỗi step: `npx tsc --noEmit` trong `packages/core` phải pass

### Verification
- `packages/core` build pass
- Smoke test: new chat → send message → tool call → permission prompt → approve → result

---

## TASK 11 — Integrations architecture

**Branch:** `refactor/integrations-architecture`
**Checkout từ:** `main`
**Files chính đụng:**
- `packages/core/src/mcp/mcp.ts`
- `packages/core/src/mcp/repo.ts`
- `apps/main/src/oauth-handler.ts`
- `apps/main/src/composio-handler.ts`
- `packages/core/src/models/models.ts`
**Không đụng:** renderer, packages/shared

### Mục tiêu
Mỗi integration lớn có interface + adapter riêng. Không trộn lifecycle management với use case logic.

### Cách làm
**MCP:**
- Tách `McpClientAdapter` interface: `connect()`, `disconnect()`, `listTools()`, `callTool()`
- `mcp.ts` chỉ còn orchestration, không chứa raw client code

**OAuth/Composio (apps/main):**
- Tách `OAuthAdapter` interface với `startFlow()`, `handleCallback()`, `getState()`
- `oauth-handler.ts` implement interface, không chứa business logic
- Tương tự cho `composio-handler.ts`

**Models/Providers:**
- Tách `ProviderAdapter` interface: `createModel()`, `testConnection()`
- `models.ts` chỉ còn factory, không chứa provider-specific quirks inline

### Steps
1. `refactor(integrations): isolate mcp client adapter interface`
2. `refactor(integrations): isolate oauth and composio adapters`
3. `refactor(integrations): standardize provider factory interface`
4. `docs(integrations): add integration boundary notes`

### Verification
- `apps/main` và `packages/core` build pass
- Smoke test: connect provider, list MCP tools, OAuth callback

---

## TASK 12 — Background jobs and service lifecycle

**Branch:** `refactor/background-jobs-lifecycle`
**Checkout từ:** `main`
**Files chính đụng:**
- `apps/main/src/main.ts`
- `packages/core/src/services/service_bus.ts`
- `packages/core/src/agent-schedule/runner.ts`
- `packages/core/src/knowledge/` (sync services)
**Không đụng:** renderer, packages/shared

### Mục tiêu
Startup/shutdown của tất cả background services phải đi qua một lifecycle contract thống nhất. `main.ts` không chứa service logic inline.

### Cách làm
1. Định nghĩa interface `BackgroundService` trong `packages/core/src/services/`:
   ```ts
   interface BackgroundService {
     name: string
     start(): Promise<void>
     stop(): Promise<void>
   }
   ```
2. Wrap mỗi service (graph builder, sync services, schedule runner, watcher) thành `BackgroundService`
3. Tạo `ServiceRegistry` — register, startAll, stopAll
4. `main.ts` chỉ còn: `registry.startAll()` on ready, `registry.stopAll()` on quit

### Steps
1. `refactor(services): define BackgroundService interface and registry`
2. `refactor(services): wrap sync and graph services`
3. `refactor(services): wrap schedule runner and watcher`
4. `refactor(services): wire registry into main bootstrap`

### Verification
- `apps/main` build pass
- App khởi động và tắt không có dangling process

---

## TASK 13 — Config and security architecture

**Branch:** `refactor/config-security-architecture`
**Checkout từ:** `main`
**Files chính đụng:**
- `packages/core/src/config/config.ts`
- `packages/core/src/config/security.ts`
- `packages/core/src/config/initConfigs.ts`
**Không đụng:** renderer, apps/main, packages/shared

### Mục tiêu
Phân biệt rõ 3 loại config:
- **User config**: settings do user chọn (model, theme, preferences)
- **System policy**: security allowlist, command permissions — không user-editable
- **Runtime defaults**: giá trị mặc định khi chưa có config

### Cách làm
1. Tạo `packages/core/src/config/user-config.ts` — đọc/ghi user settings
2. Tạo `packages/core/src/config/system-policy.ts` — security rules, allowlist, command policy
3. Tạo `packages/core/src/config/runtime-defaults.ts` — default values
4. `config.ts` chỉ còn compose 3 module trên
5. Thêm test cho command policy: allowed commands pass, blocked commands throw

### Steps
1. `refactor(config): extract user config repository`
2. `refactor(security): isolate command policy and allowlist`
3. `refactor(config): extract runtime defaults`
4. `test(security): add command policy regression tests`

### Verification
- `packages/core` build pass
- Test pass cho security policy
- Smoke test: settings save/load, command execution với allowed/blocked command

---

## TASK 14 — Test architecture

**Branch:** `arch/test-architecture`
**Checkout từ:** `main`
**Files chính đụng:** test config files, thêm test files mới
**Không đụng:** source code logic

### Mục tiêu
Thiết lập test pyramid rõ ràng. Mọi task sau biết test nên đặt ở đâu.

### Cách làm
1. Xác định test runner đang dùng (check `package.json` scripts)
2. Tạo convention:
   - `*.unit.test.ts` — unit tests, không cần Electron, không cần filesystem
   - `*.integration.test.ts` — test với filesystem hoặc IPC mock
   - `*.smoke.test.ts` — test cần app chạy thật (manual hoặc playwright)
3. Viết ít nhất 3 unit test mẫu cho các boundary quan trọng:
   - `workspace path safety` (từ Task 8 nếu chưa có)
   - `run event hydration` trong `use-chat-runtime`
   - `ipc adapter` — mock `window.ipc` và verify adapter gọi đúng channel
4. Viết `.local/architecture/test-strategy.md` mô tả pyramid

### Steps
1. `test(arch): define test layers and runner conventions`
2. `test(core): add unit tests for workspace and run event boundary`
3. `test(renderer): add unit tests for ipc adapter layer`
4. `docs(arch): add test strategy document`

### Verification
- `npm test` chạy được và pass

---

## TASK 15 — Observability and diagnostics

**Branch:** `refactor/observability-diagnostics`
**Checkout từ:** `main`
**Files chính đụng:**
- `packages/core/src/services/service_logger.ts`
- `packages/core/src/agents/runtime.ts` (hoặc runtime modules sau Task 10)
- `packages/core/src/runs/runs.ts`
**Không đụng:** renderer UI, packages/shared schema

### Mục tiêu
Mỗi run có correlation ID xuyên suốt từ renderer → main → core → provider. Log có đủ field để debug không cần đoán.

### Cách làm
1. Đảm bảo mỗi run event có `runId` field (đã có trong shared schema)
2. Thêm `correlationId` vào log context của runtime và service logger
3. Chuẩn hóa log format: `{ ts, level, service, runId?, correlationId?, message, ...extra }`
4. Thêm log rõ ràng tại: run start, tool call start/end, provider error, permission request
5. Viết `.local/architecture/troubleshooting-guide.md`

### Steps
1. `feat(obs): standardize log format and fields`
2. `feat(obs): add correlation id to run and service logs`
3. `feat(obs): add debug log points for tool and provider failures`
4. `docs(obs): add troubleshooting guide`

### Verification
- Chạy một run có tool call, xem log có đủ runId và correlation không

---

## TASK 16 — CI and release discipline

**Branch:** `arch/ci-release-discipline`
**Checkout từ:** `main`
**Files chính đụng:** `.github/workflows/` (tạo mới nếu chưa có), root `package.json`
**Không đụng:** source code logic

### Mục tiêu
Mọi PR vào `main` phải pass: typecheck + lint + build. Không merge mù.

### Cách làm
1. Tạo `.github/workflows/ci.yml`:
   - Trigger: `push` và `pull_request` vào `main`
   - Steps: `npm ci` → `npm run lint` → typecheck từng package → build
2. Thêm script `npm run check` ở root chạy: lint + typecheck tất cả packages
3. Viết `.local/architecture/release-checklist.md`:
   - Checklist trước khi merge refactor branch
   - Checklist trước khi release

### Steps
1. `ci: add github actions workflow for typecheck and lint`
2. `ci: add build validation step`
3. `docs(release): add merge and release checklist`
4. `ci: add root check script`

### Verification
- Push branch → CI chạy và pass

---

## TASK 17 — ADR and engineering docs

**Branch:** `arch/adr-engineering-docs`
**Checkout từ:** `main`
**Files chính đụng:** `.local/architecture/` (docs only)
**Không đụng:** source code

### Mục tiêu
Mọi quyết định kiến trúc lớn có ADR. Người mới đọc docs hiểu được tại sao code trông như vậy.

### Cách làm
1. Tạo `.local/architecture/adr/` folder
2. Tạo `adr/000-template.md` — template ADR chuẩn (title, date, status, context, decision, consequences)
3. Tạo `adr/001-ipc-adapter-layer.md` — ghi lại quyết định Task 5 (tại sao tạo services/ layer)
4. Tạo `adr/002-runtime-decomposition.md` — ghi lại quyết định Task 10
5. Tạo `adr/003-background-service-lifecycle.md` — ghi lại quyết định Task 12
6. Cập nhật `.local/architecture/README.md` để trỏ về ADR folder

### Steps
1. `docs(adr): add adr template and index`
2. `docs(adr): record ipc adapter and runtime decisions`
3. `docs(adr): record service lifecycle and config decisions`
4. `docs(eng): update architecture readme with adr references`

### Verification
- Đọc một ADR và hiểu được context + decision trong 2 phút

---

## TASK 18 — Extension and plugin boundary

**Branch:** `arch/extension-boundary`
**Checkout từ:** `main` (sau Task 9 và 10 merge)
**Files chính đụng:**
- `packages/core/src/application/lib/tools/index.ts` (từ Task 9)
- `packages/core/src/mcp/` (từ Task 11)
**Không đụng:** renderer, apps/main

### Mục tiêu
Thêm tool mới hoặc integration mới không cần sửa file trung tâm — chỉ cần tạo file mới và register.

### Cách làm
1. Định nghĩa `ToolDefinition` interface trong `packages/shared` hoặc `packages/core`:
   ```ts
   interface ToolDefinition {
     name: string
     description: string
     parameters: ZodSchema
     execute(params, context): Promise<unknown>
   }
   ```
2. Tool registry nhận `ToolDefinition[]` — không hardcode
3. Tạo `registerTool(def: ToolDefinition)` function
4. Viết doc `.local/architecture/extension-guide.md`: hướng dẫn thêm tool mới trong 5 bước

### Steps
1. `refactor(ext): define ToolDefinition interface and registry API`
2. `refactor(ext): migrate existing tools to use ToolDefinition`
3. `docs(ext): add extension guide for tools and integrations`
4. `test(ext): add smoke test for tool registration`

### Verification
- Thêm một tool giả lập mới chỉ bằng cách tạo 1 file và gọi `registerTool`

---

## TASK 19 — Performance and scaling roadmap

**Branch:** `arch/performance-scaling`
**Checkout từ:** `main`
**Files chính đụng:** `.local/architecture/` (docs + benchmark scripts)
**Không đụng:** source code logic

### Mục tiêu
Có baseline đo được cho startup, search, render. Biết khi nào cần tối ưu.

### Cách làm
1. Đo và ghi lại (thủ công hoặc script):
   - App cold start time (từ launch đến UI ready)
   - Search query time với 100 files, 1000 files
   - Render time của conversation với 50 messages
2. Xác định hot paths: runtime loop, search scan, knowledge graph build
3. Viết `.local/architecture/performance-budget.md`:
   - Budget cho mỗi metric (ví dụ: search < 200ms với 500 files)
   - Trigger để review (ví dụ: nếu startup > 3s thì investigate)
4. Thêm `console.time` / `performance.mark` tại các điểm đo chính (có thể remove sau)

### Steps
1. `perf: add baseline measurements for startup and search`
2. `perf: identify hot paths in runtime and knowledge graph`
3. `docs(perf): add performance budget and scaling strategy`
4. `perf: add performance marks at key boundaries`

### Verification
- Có file `performance-budget.md` với số đo thực tế

---

## TASK 20 — Final architecture hardening pass

**Branch:** `arch/final-hardening`
**Checkout từ:** `main` (sau tất cả task trên merge)
**Files đụng:** toàn bộ codebase — pass cuối

### Mục tiêu
Dọn sạch artifact còn sót. Đảm bảo boundary và docs đồng bộ với code thực tế.

### Checklist cần làm
1. **Import direction audit**: grep xem có `core` import `renderer` không, có `shared` import `core` không
2. **Dead code**: tìm file/function không được import ở đâu
3. **Temporary shims**: tìm comment `// TODO`, `// TEMP`, `// HACK` và xử lý hoặc ghi debt
4. **Docs sync**: đọc lại `current-state-map.md` và cập nhật theo trạng thái thực tế sau roadmap
5. **Final module index**: tạo `.local/architecture/module-index.md` liệt kê mọi module và owner

### Steps
1. `chore(arch): audit and fix import directions`
2. `chore(arch): remove dead code and temporary shims`
3. `docs(arch): update current-state map to post-roadmap reality`
4. `docs(arch): publish final module index and debt backlog`

### Verification
- `npm run check` (typecheck + lint) pass toàn bộ repo
- Không còn cross-layer import violation

---

## Thứ tự ưu tiên và dependency

```
Task 6  (main/ipc)          — độc lập, làm trước
Task 7  (build/platform)    — độc lập, làm song song được
Task 8  (search/workspace)  — độc lập với 6 và 7
Task 9  (builtin-tools)     — độc lập
Task 10 (runtime)           — nên sau Task 9
Task 11 (integrations)      — nên sau Task 6
Task 12 (service lifecycle) — nên sau Task 6
Task 13 (config/security)   — độc lập
Task 14 (test arch)         — nên sau Task 8, 9, 10
Task 15 (observability)     — nên sau Task 10
Task 16 (CI)                — độc lập
Task 17 (ADR docs)          — độc lập
Task 18 (extension)         — nên sau Task 9, 10
Task 19 (performance)       — nên sau Task 10
Task 20 (hardening)         — sau tất cả
```

## Conflict avoidance

- Task 6, 8, 9, 10, 11, 12, 13 đụng các file hoàn toàn khác nhau — có thể chạy song song
- Task 6 đụng `apps/main/src/ipc.ts` — không task nào khác đụng file này
- Task 9 đụng `builtin-tools.ts` — không task nào khác đụng file này
- Task 10 đụng `runtime.ts` — không task nào khác đụng file này
- Task 7 chỉ đụng `package.json` scripts — không conflict với logic code
- Task 14, 15, 16, 17, 19 chủ yếu thêm file mới — conflict thấp nhất
