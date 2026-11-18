# Study Nook — prototype workspace

Prototype Angular cho một workspace học chung duy nhất. Hiện tại đăng nhập,
thành viên, vị trí và nút thiết bị đều dùng dữ liệu giả; chưa kết nối Firebase,
WebRTC, mic/camera thật hoặc dịch vụ deploy.

## Chạy trên máy

Mở terminal tại thư mục `study-workspace`, sau đó chạy:

```bash
npm start
```

Mở `http://localhost:4200`. Nhập tên hiển thị để vào `/workspace`. Dùng WASD
hoặc phím mũi tên khi bản đồ đang được focus để di chuyển avatar. Mic/camera chỉ
đổi trạng thái hiển thị.

## Kiểm tra

```bash
npm test -- --watch=false
npm run build
```

## Phạm vi prototype

- `/login`: đăng nhập giả lập bằng tên hiển thị; trạng thái được giữ trong
  `sessionStorage` cho tab hiện tại.
- `/workspace`: bản đồ minh họa, ba thành viên giả lập và avatar có thể di chuyển.
- Có thể dùng đăng xuất để quay lại màn hình đăng nhập.
- Chưa có backend, đồng bộ giữa trình duyệt, quyền truy cập thiết bị hay
  âm thanh theo khoảng cách thật.

Project được khởi tạo bằng Angular CLI 21.2.30.
