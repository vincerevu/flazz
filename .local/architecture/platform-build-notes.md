# Platform Build Workflow Refactor

## Changes
To support building on Windows PowerShell natively, the following refactoring steps were taken:

1. **Replaced Unix-only cleanup commands:**
   - Swapped `node -e "require('fs').rmSync('dist',{recursive:true,force:true})"` with `rimraf dist`.
   - `rimraf` was added to devDependencies.

2. **Replaced `&&` chaining with `npm-run-all`:**
   - Instead of chaining scripts sequentially via `&&` (which could fail or act unpredictably in some Windows shells if overly complex), we're now utilizing `npm-run-all` via `run-s` command.
   - Example: replaced `"build": "rimraf dist && tsc"` with `"build": "run-s clean build:tsc"` and split individual tasks into separate sub-scripts like `"clean": "rimraf dist"`.
   - `npm-run-all` was added to devDependencies.

3. **Retained `cd <dir> && npm run <script>` in Root:**
   - Root `package.json` coordinates building workspaces. We retained directory transitions within individual run steps (e.g. `cd packages/shared && npm run build`) mapped onto specific jobs, orchestrated sequentially through `run-s`.

4. **Eliminated complex bash/Node scripts embedded in package.json:**
   - Preload's `build` command was broken down logically so build steps are readable and independently testable across all environments.
