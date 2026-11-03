# Kiểm thử website ngày 04/11/2026

Phạm vi: bản đồ án FastAPI/MySQL và Next.js đã chốt. Tất cả dữ liệu kiểm thử là dữ liệu tổng hợp. Các kết quả bên dưới được chạy trên code của đợt sửa này, không lấy số liệu seed làm bằng chứng AI.

| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Migration MySQL 8.4.11/InnoDB, 0001–0005 từ DB trống | Đạt | mysql-summary.json, mysql-tests.xml |
| Hồi quy API trên MySQL thật | 96 đạt, 0 lỗi, 0 bỏ qua | mysql-tests.xml |
| Kiểm tra nhanh SQLite riêng | 96 đạt | sqlite-tests.xml |
| Client refresh/session/draft | 5 đạt | npm test |
| Lint, TypeScript, production build | Đạt | CI / Docker build |
| npm audit tại thời điểm kiểm tra | 0 lỗ hổng được báo cáo | frontend-audit.json |
| Smoke bốn phân hệ qua HTTP/WebSocket thật | Tất cả đạt | smoke-*.json |
| Hai phiên trình duyệt chủ sở hữu/thành viên | 1 kịch bản, 10 bước nghiệp vụ đạt | browser-summary.json, ảnh |
| Compose từ volume MySQL mới, migration/seed; khởi động lại giữ dữ liệu | Đạt | docker compose up --wait |

Tệp bằng chứng nằm tại [docs/final-verification](docs/final-verification). JUnit hiện một cảnh báo deprecation của Starlette TestClient/httpx, không phải lỗi kiểm thử; chưa nâng client transport ngoài bộ dependency đã xác nhận.

## Các lỗi đã sửa và cách đối chiếu

- Refresh cookie chỉ quay vòng một lần khi nhiều request cùng hết access token; phản hồi refresh đến muộn không khôi phục phiên đã đăng xuất. Đổi/reset mật khẩu thu hồi cả access token theo token_version, refresh token và mọi recovery link còn dùng được.
- Lỗi 429 giữ CORS để giao diện đọc được thông báo. Quyền tạo/quản lý dự án trên UI khớp API. Lời mời workspace chờ người nhận chấp nhận. Thêm/xóa quyền project cập nhật danh sách dự án qua sự kiện.
- Xử lý DB/serialization tách khỏi chờ phát WebSocket và chờ Gemini. Giải phóng kết nối đọc xác thực trước khi handler chờ thread, sửa tình trạng cạn pool khi tải cao. Tranh chấp task vẫn trả 409 theo version; không tăng timeout để che lỗi.
- Bản sửa task chưa lưu được giữ khi người khác cập nhật; giao diện yêu cầu bỏ bản sửa/tải dữ liệu mới sau 409. Bình luận, việc con và chuyển cột cập nhật ở hai phiên. Xóa thành viên tăng version của task bị bỏ phân công.
- Xóa workspace/project dọn file riêng sau commit. PDF/DOCX/TXT/MD có giới hạn định dạng, kích thước và số lượng, gắn theo project. AI bắt buộc có tài liệu; kiểm tra lại phiên/quyền sau khi nhà cung cấp trả lời.
- Chấm kỹ năng 0 xóa rating; lỗi trùng kỹ năng trả 409. Workload rỗng vẫn đủ trường. MAPE dựa trên task Done/actual > 0 và snapshot estimate dương đầu tiên, không đổi theo estimate sửa về sau.
- VI/EN áp dụng cho lỗi API, vai trò, cột mặc định, hoạt động và thông báo. Ngày giờ UTC từ API được hiển thị theo múi giờ trình duyệt. Nút có type rõ ràng; drawer có focus và hỗ trợ bàn phím.
- Next.js cập nhật bản vá; backend cố định dependency; frontend Docker chạy standalone bằng user node. run.bat cập nhật dependency khi lockfile đổi, dùng UTF-8 trong đường dẫn tiếng Việt và giữ một console.
- Healthcheck MySQL dùng TCP và truy vấn SELECT 1 bằng tài khoản/database ứng dụng; tránh mysqladmin ping báo sẵn sàng trong lúc MySQL còn khởi tạo lần đầu.

## Tải API và realtime

Một backend worker, MySQL InnoDB, pool 20 + overflow 20, timeout pool 10 giây. Runner dùng 100 tài khoản cùng truy cập, 5 vòng/phân loại, timeout HTTP 20 giây. Hai client WebSocket giữ kết nối suốt bài tải. Phép thử không gọi Gemini.

| Loại | Request đo | p50 | p95 | Lỗi HTTP |
|---|---:|---:|---:|---:|
| Đọc danh sách task | 500 | 801,05 ms | 1150,25 ms | 0 |
| Cập nhật task | 500 | 1154,91 ms | 1383,13 ms | 0 |

Mỗi client WebSocket nhận đủ 500 cập nhật. Kiểm tra độc lập khóa task/cột, cập nhật cùng version (200/409), chuyển cột ngược chiều, vị trí liên tục và trigger snapshot bất biến đều đạt. Số request đọc version hỗ trợ cập nhật không tính trong 500 PATCH; thời gian toàn bài có tính những lượt đọc đó.

Đây là bài tải ngắn trên một máy. Chưa đo 100 trình duyệt/WebSocket, tải LLM đồng thời, soak test, cloud SLA hay RTO/RPO. Kết quả không bảo đảm độ trễ trên cấu hình khác. Bản đo tải thực hiện trước lần bổ sung sự kiện thành viên project; hồi quy 96 ca và browser được chạy sau lần bổ sung đó. Lõi xử lý tải không thay đổi giữa hai lần.

## Chạy lại

```sh
python scripts/setup_demo_env.py
docker compose -p dacn -f docker-compose.yml -f docker/compose.mail.yml up -d --build --wait
python scripts/verify_docker.py --project dacn
```

Runner tạo database `_verify_` riêng bằng quyền root trong container; không reset database ứng dụng. Kết quả mặc định ở test-results/mysql. Thêm --skip-load để chỉ chạy migration/hồi quy. Cần dọn DB thử nghiệm sau khi đã giữ kết quả; không chạy DROP với DB ứng dụng.

Kiểm tra từng người, chạy tại gốc dự án, thay auth bằng ai/task/insights:

```sh
docker compose -p dacn -f docker-compose.yml -f docker/compose.mail.yml -f docker/compose.auth-checks.yml run --rm --no-deps -T auth-checks
```

```sh
cd frontend
npm ci
npm run lint
npm test
npx tsc --noEmit
npm run build
npm audit
npx playwright install chromium
npm run test:e2e
```

UI/API mặc định localhost:3000/8000. Nếu dùng cổng khác, đặt E2E_UI_URL, E2E_API_URL và E2E_MAIL_URL bằng biến môi trường tương ứng trước khi chạy. Mailpit ở localhost:8025. Browser test đăng ký tài khoản tổng hợp, tạo dữ liệu mới mỗi lần và không xóa dữ liệu người dùng.

## Giới hạn cần trình bày đúng

Khóa Gemini trên môi trường chưa được xác nhận hợp lệ trong lần kiểm thử này. Các nhánh lỗi provider, schema và việc xác nhận plan có kiểm thử tự động; chưa thể kết luận chất lượng câu trả lời/phân rã VI/EN thật. SMTP đã thử với Mailpit cục bộ, chưa xác nhận email đến nhà cung cấp Internet. Native run.bat đã kiểm tra dependency Windows và cú pháp; máy kiểm thử không có MySQL host ở cổng 3306 để chạy toàn bộ launcher. Website và migration đã chạy bằng Docker MySQL thật.

Hub/rate limiter trong RAM, triển khai một worker; chưa có Redis/broker/outbox. AI là trợ lý tạo bản nháp để người dùng duyệt. File tài liệu dùng volume riêng, metadata/checksum trong DB. Phạm vi chưa bao gồm triển khai cloud hay vòng lặp Agent tự hành.
