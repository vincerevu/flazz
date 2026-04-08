# Flazz Architecture Refactoring: MASTER TODO

This file tracks the architecture roadmap from Task 1 to 20. Detailed execution specs for each remaining task are included below.

---

## 🟢 Completed / Ongoing Foundations
- [x] **Task 1**: Architecture baseline và governance
- [x] **Task 2**: Renderer app shell modularization
- [x] **Task 3**: Renderer chat domain extraction (`src/features/chat`)
- [x] **Task 4**: Renderer knowledge domain extraction (`src/features/knowledge`)
- [/] **Task 5**: Renderer state and data boundary (IPC adapters initialized)

---

## 🛠️ Upcoming Tasks (6-20) - For Execution by Jules

## Task 6. Main process IPC modularization

Branch khuyến nghị:

- `refactor/main-ipc-modularization`

Mục tiêu:

- biến `ipc.ts` thành composition root

Vấn đề cần giải quyết:

- `apps/main/src/ipc.ts` đang là file đa domain, khó tìm handler và khó verify impact

Scope chính:

- tách handler theo domain:
  - workspace
  - shell
  - models
  - runs
  - search
  - auth
  - schedule
  - integrations
- để file root chỉ register và compose

File dự kiến đụng:

- `apps/main/src/ipc.ts`
- `apps/main/src/ipc/*`

Deliverable:

- handler modules theo domain
- root IPC file ngắn và dễ đọc

Verification:

- main build
- smoke test invoke path của các domain đã tách

Định nghĩa xong:

- thêm channel mới không cần sửa file khổng lồ nữa

---

## Task 7. Platform-safe build and dev workflow

Branch khuyến nghị:

- `refactor/platform-build-workflow`

Mục tiêu:

- build/dev chạy deterministic trên Windows

Vấn đề cần giải quyết:

- scripts vẫn còn nguy cơ lệ thuộc Unix conventions, thứ tự build chưa thật rõ

Scope chính:

- thay script Unix-only còn sót
- chuẩn hóa clean/build sequence
- xác định workspace build order rõ
- viết local dev notes nội bộ

File dự kiến đụng:

- root `package.json`
- package-level `package.json`
- build helper scripts nếu cần
- `.local/architecture/*` notes liên quan

Deliverable:

- dev/build workflow chạy ổn định trên PowerShell

Verification:

- install, build, lint hoặc typecheck theo chuỗi chính từ Windows

Định nghĩa xong:

- không còn phụ thuộc ngầm `rm`, `mv`, shell chaining kiểu Unix cho flow chuẩn

---

## Task 8. Portable search and workspace safety

Branch khuyến nghị:

- `refactor/search-workspace-safety`

Mục tiêu:

- portable hóa search và khóa path safety bằng test

Vấn đề cần giải quyết:

- search hiện có lịch sử phụ thuộc shell tools
- filesystem invariants là boundary bảo mật cao nhưng chưa được test chặt

Scope chính:

- tách search provider interface
- search knowledge bằng Node API
- search runs bằng Node API
- thêm tests cho path traversal/workspace invariant

File dự kiến đụng:

- `packages/core/src/search/search.ts`
- `packages/core/src/workspace/workspace.ts`
- test files liên quan

Deliverable:

- search portable
- workspace safety có regression tests

Verification:

- core build/typecheck
- smoke test search flow
- run tests cho path safety

Định nghĩa xong:

- không còn phụ thuộc `grep` và path traversal guard được test rõ

---

## Task 9. Builtin-tools modularization

Branch khuyến nghị:

- `refactor/builtin-tools-modularization`

Mục tiêu:

- chia tool registry theo domain

Vấn đề cần giải quyết:

- `builtin-tools.ts` vừa là registry vừa chứa implementation chi tiết, rất dễ phình

Scope chính:

- tách workspace/shell tools
- tách MCP/skill tools
- tách research/external tools
- giữ file root như registry composer

File dự kiến đụng:

- `packages/core/src/application/lib/builtin-tools.ts`
- modules mới dưới `packages/core/src/application/lib/tools/*`

Deliverable:

- registry root gọn
- implementation nằm theo domain

Verification:

- core build/typecheck
- smoke test ít nhất một tool ở mỗi nhóm

Định nghĩa xong:

- `builtin-tools.ts` không còn là file phình vô hạn

---

## Task 10. Runtime decomposition

Branch khuyến nghị:

- `refactor/runtime-decomposition`

Mục tiêu:

- tách `runtime.ts` thành các module nhỏ đúng trách nhiệm

Vấn đề cần giải quyết:

- `runtime.ts` là hotspot lớn nhất của core, đang ôm loop, stream normalization, tool orchestration và subflow

Scope chính:

- extract `AgentState`
- extract stream normalization/message building
- extract tool orchestration
- extract subflow orchestration
- extract compatibility policy

File dự kiến đụng:

- `packages/core/src/agents/runtime.ts`
- `packages/core/src/agents/*`

Deliverable:

- runtime folder có module rõ ràng theo responsibility

Verification:

- core typecheck/build
- smoke test run with tools, run without tools, permission flow

Dependency:

- nên làm sau Task 9

Định nghĩa xong:

- loop chính ngắn hơn và dễ reason/debug hơn

---

## Task 11. Integrations architecture

Branch khuyến nghị:

- `refactor/integrations-architecture`

Mục tiêu:

- tách integration thành adapter + service + orchestration

Vấn đề cần giải quyết:

- MCP, OAuth, Composio, provider factory đang có chỗ trộn adapter logic và orchestration

Scope chính:

- chuẩn hóa MCP lifecycle
- tách OAuth/Composio adapters
- chuẩn hóa provider factory interfaces
- ghi boundary notes nội bộ

File dự kiến đụng:

- `packages/core/src/mcp/*`
- `apps/main/src/oauth-handler.ts`
- `apps/main/src/composio-handler.ts`
- provider-related core modules

Deliverable:

- integration code đi theo pattern thống nhất hơn

Verification:

- build main/core
- smoke test provider connect, MCP listing, auth callback flow

Định nghĩa xong:

- integration code không còn lẫn use case và adapter logic

---

## Task 12. Background jobs and service lifecycle

Branch khuyến nghị:

- `refactor/background-jobs-lifecycle`

Mục tiêu:

- startup/shutdown dịch vụ nền predictable

Vấn đề cần giải quyết:

- service startup hiện còn phân tán giữa bootstrap và implementation

Scope chính:

- định nghĩa lifecycle contract
- gom startup/shutdown orchestration
- tách job registration khỏi bootstrap

File dự kiến đụng:

- `apps/main/src/main.ts`
- background service modules trong `packages/core`

Deliverable:

- service lifecycle contract và bootstrap flow rõ

Verification:

- main build
- smoke test startup/shutdown
- kiểm tra app close không để service dangling

Định nghĩa xong:

- `main.ts` nhẹ hơn và startup sequence đọc được

---

## Task 13. Config and security architecture

Branch khuyến nghị:

- `refactor/config-security-architecture`

Mục tiêu:

- gom config và policy thành subsystem rõ ràng

Vấn đề cần giải quyết:

- config người dùng, runtime defaults và security policy có nguy cơ lẫn nhau

Scope chính:

- chuẩn hóa config repositories
- tách security policy khỏi user settings
- chuẩn hóa runtime defaults
- rà allowlist/permission boundaries

File dự kiến đụng:

- `packages/core/src/config/*`
- `packages/core/src/security/*`
- related settings readers/writers

Deliverable:

- config model rõ: user config, defaults, policy, secrets

Verification:

- core build/typecheck
- smoke test read/write config, command policy, security prompt flow

Định nghĩa xong:

- nhìn file là biết đó là user settings hay system policy

---

## Task 14. Test architecture

Branch khuyến nghị:

- `arch/test-architecture`

Mục tiêu:

- có chiến lược test đủ dùng cho refactor dài hạn

Vấn đề cần giải quyết:

- chưa có guidance rõ “boundary nào test bằng unit, cái nào cần integration, cái nào chỉ smoke”

Scope chính:

- định nghĩa unit/integration/smoke layers
- thêm test conventions
- thêm test cho invariants quan trọng
- ghi note location và naming

File dự kiến đụng:

- test setup files
- docs nội bộ trong `.local/architecture`
- test files cho hotspot boundaries

Deliverable:

- internal testing strategy rõ
- vài test mẫu cho boundary quan trọng

Verification:

- chạy được test layers đã định nghĩa

Định nghĩa xong:

- task sau biết nên thêm test ở đâu thay vì đoán

---

## Task 15. Observability and diagnostics

Branch khuyến nghị:

- `refactor/observability-diagnostics`

Mục tiêu:

- dễ debug run, service và provider issues

Vấn đề cần giải quyết:

- log hiện hữu nhưng chưa có taxonomy và correlation rõ

Scope chính:

- chuẩn hóa log fields
- thêm correlation id
- thêm debug surfaces cho failures
- viết troubleshooting guide nội bộ

File dự kiến đụng:

- runtime/service/provider modules
- logs/helpers modules
- `.local/architecture/*` troubleshooting docs

Deliverable:

- logging pattern thống nhất
- run tracing dễ theo dõi hơn

Verification:

- reproduce một run qua main/core/provider và theo được cùng correlation id

Định nghĩa xong:

- lần được 1 run xuyên qua main, core, service và provider không cần đoán log nào thuộc request nào

---

## Task 16. CI, release, migration discipline

Branch khuyến nghị:

- `arch/ci-release-discipline`

Mục tiêu:

- quality gate đủ mạnh để giữ architecture không bị thoái hóa

Vấn đề cần giải quyết:

- refactor lớn dễ merge mù nếu không có validation matrix và migration notes

Scope chính:

- validation matrix
- checks cho type/build/test
- migration notes cho change risk cao
- merge/release checklist

File dự kiến đụng:

- CI config files
- scripts validation
- `.local/architecture/*` release notes

Deliverable:

- pipeline validation tối thiểu cho refactor-heavy repo

Verification:

- CI/local matrix chạy được theo scope đã định

Định nghĩa xong:

- branch refactor lớn không merge mù và release không bỏ quên migration risk

---

## Task 17. ADR and engineering documentation system

Branch khuyến nghị:

- `arch/adr-and-engineering-docs`

Mục tiêu:

- mọi quyết định kiến trúc lớn có dấu vết

Vấn đề cần giải quyết:

- docs hiện còn rời rạc, thiếu ADR pattern và maintainer guide

Scope chính:

- ADR template
- ADR index
- maintainer docs
- thay README boilerplate bằng docs thật nếu cần public docs

File dự kiến đụng:

- `.local/architecture/*`
- repo docs nếu sau này quyết định public một phần

Deliverable:

- docs system có chỗ cho architecture decisions và maintainer notes

Verification:

- thử ghi một ADR mẫu và xem người mới có hiểu quyết định chính không

Định nghĩa xong:

- người mới đọc docs hiểu lý do các lựa chọn chính thay vì chỉ thấy code hiện trạng

---

## Task 18. Extension/plugin boundary

Branch khuyến nghị:

- `arch/extension-plugin-boundary`

Mục tiêu:

- mở đường cho extensibility sạch

Vấn đề cần giải quyết:

- thêm tool/integration mới hiện vẫn có xu hướng phải chạm file trung tâm

Scope chính:

- xác định extension points cho tools và integrations
- tách registration khỏi execution
- document contracts

File dự kiến đụng:

- tool registry modules
- integration registration modules
- docs nội bộ

Deliverable:

- extension contract và registration points rõ ràng

Verification:

- thử thêm một provider/tool giả lập với số file đụng ít hơn hiện tại

Định nghĩa xong:

- thêm tool/integration mới ít đụng file trung tâm và không phải chọc sâu vào runtime core

---

## Task 19. Performance and scaling roadmap

Branch khuyến nghị:

- `arch/performance-scaling-roadmap`

Mục tiêu:

- biết lúc nào system sẽ chậm và đo ở đâu

Vấn đề cần giải quyết:

- chưa có baseline startup, render, search và knowledge scale behavior

Scope chính:

- benchmark startup, render, search
- xác định hot path
- tài liệu chiến lược scale cho knowledge, runs, integrations

File dự kiến đụng:

- benchmark scripts hoặc internal notes
- runtime/search/render hotspots nếu cần instrumentation nhẹ

Deliverable:

- performance budget cơ bản và danh sách hot paths

Verification:

- có số đo baseline và tiêu chí cảnh báo cho các flow chính

Định nghĩa xong:

- team biết chỗ nào cần đo trước khi tối ưu, không tối ưu theo cảm giác

---

## Task 20. Final architecture hardening pass

Branch khuyến nghị:

- `arch/final-hardening-pass`

Mục tiêu:

- dọn artifact còn sót sau toàn bộ roadmap

Vấn đề cần giải quyết:

- sau nhiều sprint sẽ còn dead code, shim tạm, import direction lệch và docs lệch thực tế

Scope chính:

- enforce import direction
- xóa dead code và shim tạm
- publish final module index nội bộ
- ghi follow-up debt backlog

File dự kiến đụng:

- toàn bộ hotspot và docs nội bộ liên quan

Deliverable:

- final hardening report
- debt backlog sau roadmap

Verification:

- full pass typecheck/build theo scope chính
- rà import direction và temporary shims

Dependency:

- chỉ làm sau khi Task 2-19 cơ bản xong

Định nghĩa xong:

- codebase không còn refactor dở dang và có danh sách debt sau roadmap rõ ràng
