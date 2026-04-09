1. **Implement `handleImageUpload` in `App.tsx`:**
   - Modify the `handleImageUpload` function to take the `File` object.
   - Convert the file to a base64 string.
   - Generate a safe filename, potentially appending a timestamp or unique ID to avoid collisions.
   - The path will be `knowledge/assets/${safeFilename}`.
   - Use `workspaceIpc.writeFile` with the `encoding: 'base64'` and `mkdirp: true` options to save the file.
   - Return `workspace://${path}` as the URL for the image so Tiptap can render it, but markdown saves the protocol for resolution. Wait, does electron app protocol handle `workspace://`? The acceptance criteria mentions: "hiện app:// của Electron không tự phục vụ workspace files, nên nếu cần hãy thêm lớp resolve image src tối thiểu và đúng kiến trúc để các path trong knowledge/assets/... hiển thị được".

2. **Add Workspace Protocol Support in `main.ts`:**
   - In `apps/main/src/main.ts`, register a custom protocol (e.g., `workspace://`) to serve files from the user's `WorkDir`.
   - Update `protocol.registerSchemesAsPrivileged` to include the `workspace` scheme, so it can be used for `img src` securely and bypasses standard restrictions if needed.
   - In `protocol.handle("workspace", ...)`, resolve the path against `WorkDir` and serve it using `net.fetch(pathToFileURL(...).toString())`.
   - Wait, `WorkDir` is available via `@flazz/core/dist/config/config.js` or `os.homedir() + '/Flazz'`.

3. **Check `App.tsx` markdown rendering:**
   - Return `workspace://${path}` from `handleImageUpload`.
   - Ensure the markdown string is valid, e.g., `workspace://knowledge/assets/my-image.png`.
   - Actually, TiPtap markdown editor might just use the returned string. `handleImageUpload` returns the URL string, not the markdown syntax. Wait! `return \`![${file.name}](pending-upload)\`` is currently returning a markdown string, but the `createImageUploadHandler` expects the image URL to insert it via `insertContentAt(pos, { type: 'image', attrs: { src: imageUrl } })`. The current code in `extensions/image-upload.tsx` expects `imageUrl`.
   - If `imageUrl` is returned, it will be inserted as `<img src="workspace://knowledge/assets/...">`. Then when serialized to markdown, it will become `![alt](workspace://knowledge/assets/...)`.

4. **Review Pre-commit Steps:**
   - Verify build using `pnpm --filter @flazz/renderer build`.
   - Verify the main app build with `pnpm --filter @flazz/main build`.

Let's refine the protocol addition.
