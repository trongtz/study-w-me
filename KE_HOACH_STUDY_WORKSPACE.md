# Kế hoạch demo: Study Workspace

## 1. Mục tiêu

Làm một website demo có **một workspace chung duy nhất**. Sau khi đăng nhập, mọi
người vào cùng một bản đồ, nhìn thấy avatar của nhau, di chuyển quanh không gian,
bật mic/camera và nghe nhau khi ở gần.

Đây là ứng dụng học tập thử nghiệm, không phải nền tảng họp trực tuyến hoàn chỉnh.
Ưu tiên luồng dùng được, dễ giải thích và có thể triển khai công khai; không cố
xây nhiều tính năng ngay từ đầu.

### Phạm vi bản demo

- Đăng nhập bằng tài khoản khách (Firebase Anonymous Auth) hoặc Google.
- Mọi người sau khi đăng nhập đều vào cùng workspace, không có tạo/chọn phòng.
- Thấy avatar và trạng thái của những người đang hiện diện trên bản đồ chung.
- Mỗi người có thể bật/tắt mic và camera.
- Người dùng di chuyển trên một bản đồ 2D đơn giản; càng gần nhau thì tiếng càng
  rõ, ra xa thì tiếng nhỏ dần hoặc tắt.
- Deploy giao diện lên một URL HTTPS công khai.
- Thử bản demo ban đầu với một nhóm nhỏ để kiểm tra giới hạn WebRTC mesh; không
  tạo giới hạn phòng hay luồng tạo/tham gia phòng trong giao diện.

### Chưa làm trong bản đầu

- Chat chữ, nhắn tin riêng, hồ sơ người dùng đầy đủ, lưu lịch sử học.
- Ghi âm/ghi hình, chia sẻ màn hình, điều phối viên, thông báo đẩy.
- Hỗ trợ số lượng lớn người cùng lúc hoặc cam kết chất lượng như ứng dụng họp.
- Cloud Run backend riêng. Firebase đủ cho luồng demo; thêm máy chủ khi có yêu cầu
  cụ thể mà Firebase không giải quyết được.

## 2. Các công cụ và môi trường: mỗi thứ làm gì?

| Công cụ / môi trường | Dùng trong dự án | Việc mình cần tự làm và kiểm tra |
|---|---|---|
| **Angular** | Làm giao diện đăng nhập và bản đồ workspace chung, điều hướng bằng Router và gọi các service. | Tạo/chạy/build/test ứng dụng; kiểm tra giao diện bằng trình duyệt và đọc diff. |
| **Firebase Authentication** | Đăng nhập khách và Google; cung cấp định danh cho từng người. | Bật đúng phương thức đăng nhập và cấu hình domain được phép sau khi deploy. |
| **Cloud Firestore** | Lưu thông tin hồ sơ đơn giản, ví dụ tên/avatar người dùng nếu cần giữ lại giữa các lần đăng nhập. Bản đồ workspace có thể để cấu hình tĩnh trong app. | Chỉ lưu dữ liệu cần thiết; thử Security Rules để mỗi người chỉ sửa hồ sơ của mình. Không dùng Firestore để lưu vị trí cập nhật liên tục. |
| **Firebase Realtime Database (RTDB)** | Cập nhật hiện diện (presence), vị trí trên bản đồ, trạng thái mic/camera và trao đổi tín hiệu để ghép WebRTC trong workspace chung. | Dùng `onDisconnect` để dọn hiện diện; người dùng chỉ được sửa trạng thái của chính mình, còn quyền đọc cần phù hợp với không gian chung. |
| **WebRTC (API trình duyệt)** | Truyền mic/camera trực tiếp giữa người tham gia; RTDB chỉ giúp trao đổi tín hiệu ban đầu. | Xin quyền mic/camera có giải thích, xử lý từ chối, tắt thiết bị và kiểm tra kết nối giữa hai trình duyệt. |
| **Google Cloud** | Môi trường quản lý dự án đứng sau Firebase: project, IAM, log và billing. | Dùng cùng project với Firebase; bật ngân sách/cảnh báo và chỉ cấp quyền cần thiết. |
| **Cloudflare Pages** | Nơi host bản Angular tĩnh để có website công khai qua HTTPS. | Cấu hình build, deploy và kiểm tra URL sau deploy; cấu hình domain trong Firebase Auth. |
| **Cloud Run** | Dịch vụ chạy API/container riêng trên Google Cloud. | **Không cần cho bản demo đầu** vì chưa có API riêng. Chỉ cân nhắc sau này nếu cần backend bảo mật hoặc xử lý phía server. |

WebRTC không phải một dịch vụ Firebase hay một máy chủ chứa video. Trong demo,
trình duyệt gửi media trực tiếp cho nhau; RTDB dùng làm signaling để trao đổi
thông tin kết nối. Có thể cần STUN để thử kết nối qua mạng. Một số mạng sẽ cần
TURN relay; TURN có thể phát sinh chi phí và nên được xem là phần mở rộng sau khi
đã đo thử, không hứa rằng mọi mạng đều hoạt động chỉ với P2P.

### Quyết định deploy cho bản đầu

Dùng **Cloudflare Pages cho frontend Angular**. Không deploy cùng một frontend lên
cả Cloud Run lẫn Pages, và không dựng Cloud Run API khi chưa có nhu cầu. Firebase
vẫn cung cấp Auth và dữ liệu realtime. Google Cloud ở giai đoạn này chủ yếu là
môi trường quản lý project, quyền và chi phí.

## 3. Kiến trúc luồng tối giản

```text
Trình duyệt (Angular)
  ├─ Firebase Auth ── đăng nhập khách / Google
  ├─ Firestore ────── hồ sơ người dùng (nếu cần lưu lâu dài)
  ├─ RTDB ─────────── presence, vị trí trong workspace chung, WebRTC signaling
  └─ WebRTC ───────── mic/camera trực tiếp giữa các trình duyệt

Cloudflare Pages ──── phục vụ website Angular qua HTTPS
Google Cloud ──────── project, IAM, logs, billing; Cloud Run chưa dùng
```

Mọi người đang online đều thuộc cùng workspace. Mỗi client chỉ cần kết nối
WebRTC tới những người ở gần, thay vì mở kết nối media với toàn bộ người dùng.
Khi người tham gia thoát hoặc mất kết nối, presence và các kết nối WebRTC liên
quan cần được dọn. Không ghi media vào Firestore hoặc RTDB.

## 4. Quy trình làm phần mềm theo từng giai đoạn

Mỗi giai đoạn đều đi theo vòng lặp: **yêu cầu nhỏ → thay đổi code → chạy kiểm tra
→ thử trên trình duyệt → đọc diff → commit**. Không yêu cầu AI sinh toàn bộ ứng
dụng bằng một prompt. Trước mỗi việc, ghi rõ màn hình/luồng cần làm, dữ liệu đầu
vào, kết quả mong đợi và cách kiểm tra.

### Giai đoạn 0 — Chốt yêu cầu và điều kiện demo

**Việc làm**

1. Chốt luồng: đăng nhập xong là tự vào một workspace chung duy nhất; không có
   màn hình tạo phòng, chọn phòng hay nhập mã.
2. Chốt vai trò: khách hoặc Google; khách có tên hiển thị tạm thời.
3. Vẽ nhanh 2 màn hình: đăng nhập và workspace. Workspace gồm bản đồ nhìn từ
   trên xuống/giả isometric, avatar nổi trên bản đồ, nhãn trạng thái mic/camera
   và thanh điều khiển cố định phía dưới như ảnh tham khảo. Bản đầu có thể dùng
   bản đồ tĩnh và di chuyển avatar bằng phím; chưa cần làm game 3D hay đường đi
   tránh vật cản.
4. Chốt quy tắc khoảng cách ban đầu, ví dụ: trong bán kính 1 đơn vị nghe rõ; từ
   1 đến 3 đơn vị giảm âm lượng; ngoài 3 đơn vị không nghe. Đây là tham số để thử,
   không phải đặc tính vật lý chính xác.
5. Dùng hình nền/bản đồ tự tạo hoặc có giấy phép phù hợp; ảnh tham khảo dùng để
   định hướng cách bố trí, không chép nguyên hình ảnh/tài sản của sản phẩm khác.
6. Ghi rõ việc demo không ghi âm/ghi hình và yêu cầu người dùng cho phép thiết bị.

**Đầu ra:** danh sách yêu cầu, bản vẽ thô và tiêu chí nghiệm thu ở mục 6.

### Giai đoạn 1 — Tạo ứng dụng và kiểm tra Angular

**Việc làm**

1. Tạo Angular project và khởi động local.
2. Tạo các route tối thiểu: `/login` và `/workspace`.
3. Tạo component theo màn hình; dùng service cho logic dùng chung.
4. Dựng bản đồ tĩnh và avatar giả trước, chưa nối Firebase; thử di chuyển avatar
   của chính mình trên bản đồ.
5. Chạy build, test; mở trình duyệt kiểm tra điều hướng và kích thước màn hình.

**Đầu ra:** khung ứng dụng chạy local, đăng nhập giả lập xong vào thẳng bản đồ
workspace chung.

**Tự kiểm:** `ng serve`, `ng test`, `ng build`; thử route trực tiếp và nút quay
	lại, đọc các file đã thay đổi.

### Giai đoạn 2 — Tạo Firebase project và đăng nhập

**Việc làm**

1. Tạo một Firebase project riêng cho demo và đăng ký web app.
2. Bật Anonymous và Google sign-in; cấu hình thông tin hiển thị cần thiết.
3. Kết nối Angular với Firebase qua cấu hình web app.
4. Làm đăng nhập, đăng xuất và trạng thái đang đăng nhập; bảo vệ route workspace.
5. Thử đăng nhập khách, Google, tải lại trang và đăng xuất.

**Đầu ra:** chỉ người đã đăng nhập mới vào được workspace; đăng nhập xong được
đưa thẳng đến `/workspace`.

**Lưu ý:** Firebase web config có thể nằm trong frontend theo thiết kế Firebase,
nhưng không thay thế Security Rules. Không đưa service-account key, private key
hay bí mật server vào source hoặc Git.

### Giai đoạn 3 — Workspace chung và presence

**Việc làm**

1. Dùng một đường dẫn workspace cố định trong RTDB, ví dụ
   `/workspaces/main/presence/{uid}`; không tạo document hay mã phòng.
2. Lưu UID, tên hiển thị, trạng thái mic/camera và tọa độ 2D của từng người đang
   online. Tọa độ ban đầu có thể được tạo tự động để avatar không chồng lên nhau.
3. Khi đăng nhập xong, mọi người đọc cùng danh sách presence và bản đồ; khi di
   chuyển, chỉ cập nhật tọa độ của chính mình.
4. Cập nhật presence khi kết nối; cấu hình dọn trạng thái khi người dùng mất kết
   nối hoặc đóng tab (`onDisconnect`).
5. Viết rules yêu cầu đăng nhập, giới hạn mỗi người chỉ ghi dữ liệu presence của
   UID mình; chỉ những người đã đăng nhập mới được đọc danh sách chung.
6. Nếu có thể, chạy Firebase Emulator trước khi dùng dữ liệu thật.

**Đầu ra:** hai cửa sổ trình duyệt đăng nhập vào cùng URL đều thấy nhau trên cùng
bản đồ; di chuyển ở cửa sổ này được phản ánh ở cửa sổ kia; đóng tab thì avatar
biến mất.

### Giai đoạn 4 — WebRTC một-một, chỉ audio

**Việc làm**

1. Trước tiên xin quyền mic và hiển thị rõ trạng thái đang bật/tắt.
2. Tạo một kết nối WebRTC giữa hai trình duyệt đang ở gần nhau trong workspace.
3. Dùng RTDB trao đổi offer, answer và ICE candidates giữa đúng hai UID; xóa tín
   hiệu cũ khi kết nối hoàn tất hoặc người dùng rời.
4. Thêm thao tác tắt mic và dọn track/kết nối khi rời workspace.
5. Thử trên hai trình duyệt hoặc hai thiết bị riêng, không chỉ hai tab nếu có thể.

**Đầu ra:** hai người nghe được nhau; từ chối quyền mic không làm ứng dụng lỗi.

**Vì sao làm một-một trước:** giúp tách lỗi signaling/WebRTC khỏi lỗi nhiều người
và proximity. Chỉ mở rộng khi luồng này chạy ổn.

### Giai đoạn 5 — Nhiều người, vị trí và âm thanh theo khoảng cách

**Việc làm**

1. Cho nhiều người vào cùng bản đồ; kiểm tra trước với một nhóm nhỏ trên vài
   trình duyệt/thiết bị.
2. Hiển thị avatar trên bản đồ chung; cho dùng phím WASD/mũi tên để di chuyển,
   giới hạn tọa độ trong bản đồ rồi cập nhật vị trí lên RTDB. Có thể thêm kéo/thả
   sau khi di chuyển bằng phím chạy ổn.
3. Với từng luồng âm thanh từ xa, tính khoảng cách tới vị trí người nghe và điều
   chỉnh âm lượng bằng Web Audio API: gần thì rõ, xa thì giảm, ngoài ngưỡng thì
   mute/volume bằng 0.
4. Chỉ mở kết nối media với người ở gần; cập nhật gain khi vị trí thay đổi, tránh
   tạo lại kết nối WebRTC chỉ vì người dùng di chuyển.
5. Kiểm tra rằng mute cục bộ luôn có hiệu lực dù người dùng đang gần người khác.

**Đầu ra:** mọi người nhìn thấy cùng một không gian; di chuyển avatar làm thay
đổi âm lượng của những người ở gần.

### Giai đoạn 6 — Camera và hoàn thiện trải nghiệm

**Việc làm**

1. Thêm yêu cầu quyền camera, nút bật/tắt và khung video local/remote.
2. Dừng camera/mic tracks khi tắt thiết bị, đăng xuất hoặc rời workspace.
3. Thêm nhãn trạng thái kết nối, mic, camera, lỗi quyền thiết bị và hướng dẫn thử
   lại.
4. Kiểm tra trên laptop và ít nhất một thiết bị di động nếu là đối tượng demo.

**Đầu ra:** mic và camera hoạt động, có trạng thái rõ ràng, có thể tắt bất cứ lúc
nào. Nếu tiến độ bị giới hạn, giữ camera là phần hoàn thiện sau audio proximity.

### Giai đoạn 7 — Kiểm thử quyền, build và deploy

**Việc làm**

1. Đọc lại Firestore Rules và RTDB Rules; thử cả thao tác hợp lệ và không hợp lệ.
2. Chạy test/build; mở bản production thử đăng nhập, vào workspace chung, di
   chuyển, rời đi, mic/camera và proximity.
3. Tạo Cloudflare Pages project kết nối repository; cấu hình build command và
   thư mục output đúng với kết quả `ng build` của project (không đoán đường dẫn).
4. Deploy lên URL HTTPS; thêm domain deploy vào Firebase Auth authorized domains.
5. Thử lại bằng URL công khai ở cửa sổ riêng tư/thiết bị khác; kiểm tra log và
   billing trong Firebase/Google Cloud.
6. Đọc toàn bộ diff, xóa cấu hình thử không cần thiết, rồi commit bản demo.

**Đầu ra:** link demo HTTPS, hướng dẫn sử dụng ngắn và commit có thể giải thích.

## 5. Cách dùng AI theo đúng tài liệu hướng dẫn

- **Trước khi nhờ AI sửa:** đưa yêu cầu của một việc nhỏ, file liên quan, phiên
  bản/framework đang dùng và tiêu chí kiểm tra cụ thể.
- **Với Angular:** có thể cấu hình Angular MCP để tra tài liệu/chạy CLI và dùng
  Angular skills chính thức nếu môi trường làm việc hỗ trợ. MCP/skill hỗ trợ quá
  trình code; không thay thế việc mình hiểu và kiểm tra code.
- **Với Firebase:** có thể dùng Firebase MCP/skills sau khi hiểu quyền mà chúng
  yêu cầu. Ưu tiên Emulator khi thử dữ liệu và rules.
- **Với Google Cloud/Cloudflare:** dùng tài liệu và CLI chính thức; cấp quyền tối
  thiểu, không cấp Owner chỉ để tiện. Không cho AI hoặc đưa lên Git private key,
  service-account key, token hay file bí mật.
- **Sau mỗi thay đổi:** chạy đúng test/build nhỏ nhất, mở trình duyệt thử luồng,
  đọc diff và tự giải thích được file nào đã đổi, vì sao đổi.
- **Khi có lỗi:** chép nguyên văn lỗi, tìm trong tài liệu chính thức trước, sau đó
  yêu cầu AI giải thích nguyên nhân và đề xuất một thay đổi nhỏ; không chấp nhận
  cách sửa chỉ làm lỗi biến mất mà chưa hiểu tác động.

## 6. Tiêu chí nghiệm thu demo

- [ ] Người mới có thể đăng nhập khách; người chọn Google đăng nhập được.
- [ ] Người chưa đăng nhập không thể vào workspace.
- [ ] Sau đăng nhập, hai trình duyệt vào cùng một workspace duy nhất, không cần
  tạo phòng, chọn phòng hay nhập mã.
- [ ] Presence cập nhật khi vào/rời workspace; đóng tab không để avatar treo lâu.
- [ ] Di chuyển avatar ở một trình duyệt được cập nhật trên các trình duyệt khác.
- [ ] Hai người có thể gọi audio; người dùng có thể mute và rời workspace.
- [ ] Với nhóm thử nghiệm nhỏ, âm lượng thay đổi theo khoảng cách và người ở ngoài
  ngưỡng không nghe thấy tiếng.
- [ ] Camera bật/tắt được; từ chối quyền thiết bị có thông báo dễ hiểu.
- [ ] Không có dữ liệu media được ghi vào Firestore/RTDB; không có key bí mật trong
  repository.
- [ ] Rules bắt buộc đăng nhập; mỗi người chỉ sửa presence của mình, không dùng
  rules mở công khai để demo.
- [ ] `ng build` thành công; các test liên quan chạy được.
- [ ] Website công khai chạy qua HTTPS; Firebase Auth chấp nhận domain deploy.
- [ ] Đã kiểm tra ít nhất hai trình duyệt/thiết bị và biết các giới hạn mạng WebRTC.

## 7. Rủi ro và cách giữ demo đơn giản

- **WebRTC không kết nối trên một số mạng:** thử hai thiết bị/mạng khác nhau sớm;
  ghi nhận STUN/TURN là rủi ro. Nếu cần TURN, đánh giá chi phí và cấu hình riêng.
- **Nhiều peer làm tăng độ phức tạp:** mọi người vẫn vào cùng workspace, nhưng
  WebRTC mesh không phù hợp để mở media tới tất cả khi lượng người tăng. Chỉ kết
  nối các peer ở gần; thử tải với nhóm nhỏ và chưa cam kết quy mô lớn. Nếu cần
  nhiều người hơn, phải nghiên cứu SFU/backend sau này.
- **Presence không phải dữ liệu bền:** để trạng thái online ở RTDB; không coi
  heartbeat là hồ sơ hoặc lịch sử.
- **Quyền mic/camera và riêng tư:** xin quyền theo thao tác người dùng, chỉ gửi
  media khi họ bật, có chỉ báo trạng thái và nút tắt/rời workspace rõ ràng.
- **Chi phí dịch vụ:** bắt đầu với cấu hình miễn phí phù hợp, theo dõi giới hạn;
  một số dịch vụ hoặc relay có thể yêu cầu billing. Đặt cảnh báo ngân sách Google
  Cloud trước khi bật dịch vụ tính phí.
- **Deploy sai cấu hình:** kiểm tra output build Angular thực tế, authorized
  domains và URL HTTPS trước khi chia sẻ link.

## 8. Bảng theo dõi công việc

| # | Việc | Hoàn thành khi |
|---|---|---|
| 1 | Chốt luồng và tiêu chí demo | Có luồng vào workspace chung và bản vẽ 2 màn hình |
| 2 | Tạo khung Angular | Route chạy, build/test cơ bản thành công |
| 3 | Cấu hình Firebase Auth | Khách và Google đăng nhập/đăng xuất được |
| 4 | Làm workspace và presence | Hai client vào cùng bản đồ, thấy nhau và rời đi được dọn |
| 5 | Làm WebRTC audio gần nhau | Hai thiết bị gần nhau nghe được, mute/rời hoạt động |
| 6 | Thêm di chuyển và proximity | Vị trí đồng bộ, âm lượng phản ứng đúng với khoảng cách |
| 7 | Thêm camera | Bật/tắt và xử lý quyền từ chối |
| 8 | Kiểm tra rules và deploy Pages | URL HTTPS chạy, rules đã thử, diff đã đọc |

**Thứ tự ưu tiên khi thiếu thời gian:** đăng nhập → bản đồ chung/presence → audio
hai người → di chuyển/proximity → deploy → camera. Nên có một luồng nhỏ chạy được
và giải thích được hơn là nhiều tính năng chưa kiểm chứng.
