# Release and Merge Checklist

## Checklist trước khi merge refactor branch

- [ ] Đã run `npm run check` (hoặc `pnpm run check`) và pass tất cả lint & typecheck.
- [ ] Đã run `npm run test` và pass toàn bộ tests.
- [ ] Đã run build successful (`npm run build` hoặc các package tương ứng).
- [ ] Không có thay đổi nào làm break logic cũ (verify qua tests và smoke tests).
- [ ] Đã review code cẩn thận, đảm bảo tuân thủ architecture guidelines.
- [ ] Các thay đổi liên quan đến architecture đã được update trong `.local/architecture/`.

## Checklist trước khi release

- [ ] Tất cả PRs đã merge vào `main` đều pass CI (lint, typecheck, build, test).
- [ ] Đã bump version trong `package.json` theo semver.
- [ ] Đã update `CHANGELOG.md` với các thay đổi chính.
- [ ] Thực hiện manual smoke test trên các OS chính (nếu có thể).
- [ ] Đảm bảo artifact build thành công trên mọi platform hỗ trợ.
- [ ] Draft release notes trên GitHub.
