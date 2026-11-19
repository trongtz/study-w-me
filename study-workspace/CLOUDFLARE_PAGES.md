# Deploy lên Cloudflare Pages

## Cấu hình project

- Git repository: `trongtz/study-w-me`
- Root directory: `study-workspace`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist/study-workspace/browser`
- Node.js: lấy từ `.node-version` (`22.16.0`)

Đường dẫn output được lấy từ kết quả build Angular hiện tại; thư mục này chứa `index.html` và các bundle tĩnh. Pages tự phục vụ Angular SPA cho các route như `/login` và `/workspace` khi không có file `404.html` ở thư mục gốc.

## Sau lần deploy đầu

1. Thêm hostname `*.pages.dev` được cấp vào Firebase Authentication → Settings → Authorized domains.
2. Mở URL HTTPS trong hai phiên đăng nhập với UID khác nhau.
3. Kiểm tra đăng nhập, presence, di chuyển, mic nghe theo khoảng cách, camera độc lập mic và rời workspace.
4. Kiểm tra RTDB Rules đã publish từ `database.rules.json`.
