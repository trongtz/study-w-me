# Study Nook — prototype workspace

Prototype Angular cho một workspace học chung duy nhất. Firebase Authentication
được dùng cho đăng nhập khách và Google; Firebase Realtime Database đồng bộ
presence và vị trí avatar; WebRTC truyền audio/video theo khoảng cách cho nhóm demo nhỏ.
Chưa có Firestore hoặc dịch vụ deploy.

## Chạy trên máy

Mở terminal tại thư mục `study-workspace`, sau đó chạy:

```bash
npm start
```

Mở `http://localhost:4200`. Chọn đăng nhập khách và nhập tên, hoặc đăng nhập
bằng Google để vào `/workspace`. Dùng WASD hoặc phím mũi tên khi bản đồ đang được
focus để di chuyển avatar; thành viên và vị trí được đồng bộ ở cùng một workspace.
Người muốn phát tiếng cần bật mic; người nghe có thể để mic tắt. Kết nối media
được mở khi một trong hai người ở gần đang bật mic hoặc camera. Âm thanh rõ trong
bán kính 25 đơn vị, giảm dần và tắt từ 40 đơn vị. Camera truyền video trực tiếp.

## Realtime Database

- Database URL nằm trong `src/environments/environment.ts`; không đặt
  service-account key/private key trong frontend.
- Quy tắc bảo mật và signaling nằm trong `database.rules.json`. Sau khi cập nhật
  app, thay toàn bộ nội dung ở **Realtime Database → Rules** bằng file này rồi
  bấm **Publish**. Chỉ người đã đăng nhập mới đọc presence; mỗi người chỉ ghi
  presence của mình. Signaling chỉ đọc được bởi đúng hai UID trong cặp; offer/ICE
  của caller và answer/ICE của callee có quyền ghi riêng.
- Dùng hai trình duyệt/phiên đăng nhập với UID khác nhau để kiểm tra avatar và
  di chuyển. Khi nhiều người bật mic và cấp quyền, thử âm thanh gần/xa. Khi đóng
  tab hoặc mất kết nối, `onDisconnect` dọn presence và signaling.

## Kiểm tra

```bash
npm test -- --watch=false
npm run build
```

## Phạm vi prototype

- `/login`: Firebase Anonymous Auth với tên hiển thị hoặc Firebase Google Auth.
- Cấu hình Web app nằm trong `src/environments/environment.ts`. Firebase web
  config được dùng ở frontend; không đặt service-account key/private key vào đây.
- `/workspace`: bản đồ chung với presence và avatar được đồng bộ qua RTDB.
- Đăng xuất kết thúc phiên Firebase Auth.
- Mic và camera dùng WebRTC với các thành viên ở trong bán kính 40 đơn vị. Người
  nghe không cần bật mic; gain audio giảm dần từ 25 đến 40. Demo chỉ cấu hình
  STUN; một số mạng có thể cần TURN relay.
- Camera thật truyền qua kết nối WebRTC. Mesh media chỉ phù hợp cho nhóm demo nhỏ.

Project được khởi tạo bằng Angular CLI 21.2.30.
