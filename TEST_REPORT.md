# Kiểm thử website

## Sửa lỗi ổn định ngày 18/11/2026

134 ca backend đạt trên MySQL thật với migration 0001–0006, đã chạy trong image Python 3.12 và trên Windows; 9 ca client, TypeScript/lint/build đạt. Hai kịch bản browser nghiệp vụ API/MySQL thật và một kịch bản AI UI provider stub đạt. Gemini thật qua API local sinh kế hoạch 4 task, xác nhận 201, đọc lại đủ 4 task và xác nhận lặp trả 409. Đã kiểm tra nâng DB có dữ liệu từ 0005 lên 0006. Chi tiết phạm vi, lỗi đã sửa và giới hạn tại [SUA_LOI_ON_DINH_20261118.md](docs/SUA_LOI_ON_DINH_20261118.md); minh chứng portable tại [docs/testing/stability-20261118](docs/testing/stability-20261118).

Các lỗi việc con/tải quá hạn/Dashboard/cấu hình năng lực mô tả trong đợt 14/11 bên dưới đã có sửa đổi ngày 18/11; giữ các mục cũ để ghi đúng lịch sử kiểm thử. Chưa thử trên server đích hoặc đo lại p95/load trong đợt này.

## Làm mã nguồn dễ đọc, ngày 14/11/2026

Đợt này chỉnh cách viết ở 37 tệp ứng dụng Python/React: tên biến nội bộ rõ nghĩa, nhiều tên tiếng Việt không dấu, biểu thức lồng được viết thành các bước và thêm chú thích ở các luồng quan trọng. Không thay đổi migration, trường JSON, chính sách quyền hoặc thêm chức năng. [Hướng dẫn đọc code](docs/HUONG_DAN_DOC_CODE.md).

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| Backend | 113 đạt, 0 lỗi | SQLite tách biệt; không thay cho MySQL/InnoDB |
| Client | 6 đạt | Cookie refresh, phiên đăng nhập và bản nháp AI |
| TypeScript, lint, production build | Đạt | Next.js/React hiện tại |
| Browser giao việc | 1 kịch bản, 6 bước đạt | Hai người dùng, API/SQLite thật; đổi/bỏ người nhận, realtime, xung đột, lỗi mạng, VI/EN/mobile |
| Browser duyệt AI | 1 kịch bản đạt | Provider stub; kiểm tra UI, không đánh giá chất lượng Gemini |
| So sánh OpenAPI | Giống hoàn toàn trước chỉnh sửa | Tên route, schema, tham số và JSON contract |
| Mô hình DB và schema Python | AST giống trước chỉnh sửa | Không đổi cột, khóa, ràng buộc, kiểu hoặc validation |
| Đối chiếu workload/MAPE/analytics | 331 trường hợp khớp | Kết quả và SQL/tham số truy vấn khớp snapshot trước |
| Đối chiếu xác thực và giới hạn tần suất | 9 trường hợp JWT, 900 lượt gọi khớp | Giữ hạn token, nội dung JWT và biên 60 giây |

Docker chưa hoạt động trong lượt này nên chưa chạy lại MySQL, migration, bài tải hoặc triển khai server. Không gọi Gemini thật. Hai ca browser chạy trên server thử riêng, không dùng DB hoặc tài liệu người dùng. Bằng chứng nội bộ đặt ở `backend/.integration/readability-20261114` (thư mục được bỏ qua khi đóng source).

Đây là refactor giữ hành vi. Các vấn đề đã tìm ra trong lượt audit (ghi đè việc con, danh sách cá nhân chưa gồm việc con, bỏ việc quá hạn khỏi tải đề xuất, các giới hạn realtime/triển khai) chưa được coi là đã sửa chỉ vì bộ kiểm thử hiện có đạt.

## Trợ lý lập kế hoạch, ngày 05/11/2026

Chi tiết tính năng và giới hạn tại [AI_PLANNING_20261105.md](docs/AI_PLANNING_20261105.md).

| Kiểm tra | Kết quả | Phạm vi bằng chứng |
|---|---|---|
| Migration và backend trên MySQL/InnoDB riêng | 113 đạt, không lỗi/bỏ qua | test-results/ai-planning-20261105/mysql-final; bao gồm 10 ca mới về context/cache/phân công/provider |
| Client | 6 đạt | Thêm kiểm tra giữ, đổi và bỏ assignee_id qua bản nháp |
| Browser nghiệp vụ có sẵn | 2 kịch bản, 16 bước đạt | API/MySQL thật; không gọi Gemini trong lượt này |
| Browser giao diện duyệt AI | 1 đạt | Provider stub, xác nhận chỉ kiểm tra payload UI; thử VI/EN, khôi phục không gọi AI, mobile và lỗi quota |
| Gemini thật, luồng VI | Sinh kế hoạch, sửa người nhận/tên, lưu DB và thông báo đạt | Các assertion hoàn tất trong lượt live-verified trước khi phép đối chứng EN bị lỗi |
| Gemini thật, luồng EN | Phân tích và kế hoạch theo ngữ cảnh trả HTTP 200 | Chưa có đối chứng token hoặc điểm chất lượng EN do provider 503 |
| Bộ browser live đầy đủ | Chưa đạt trọn bộ | Đối chứng EN gặp 503; lần chạy tiếp bị daily quota. Đã dừng gọi nhà cung cấp |
| Lint, TypeScript, production build và Docker health | Đạt | Các lệnh frontend và Compose |

Phép so sánh VI cùng tài liệu tổng hợp: bước lập kế hoạch trực tiếp gửi tài liệu có input=6.720, total=7.511 token; dùng câu trả lời đã có có input=1.278, total=2.031 token. Giảm lần lượt 80,98% và 72,96% trong phép thử đó. Cache lặp trả 0 lượt gọi và 0 token mới. Chi phí phân tích đầu tiên chưa tính vào mức giảm của bước lập kế hoạch; một tài liệu có nhiều ghi chú lặp chưa đại diện mọi dự án. Dữ liệu portable: [token-comparison.json](docs/testing/ai-planning-20261105/token-comparison.json).

Mã thí nghiệm live tại frontend/tests/e2e/ai-planning.spec.ts. Bật E2E_LIVE_AI=1 để chạy luồng chính; chỉ bật thêm E2E_AI_BASELINE=1 khi muốn hai lượt đối chứng đầy đủ tài liệu. Mặc định CI không gọi LLM. Bài giao diện provider stub nằm riêng ở ai-review-ui.spec.ts và không dùng để tính chất lượng Gemini. Không chạy lại bài tải trong đợt AI này.

## Cập nhật ngày 05/11/2026

Đợt sửa tập trung vào tính đúng đắn của giao việc và giao diện. Chi tiết lỗi, vị trí mã nguồn và hướng dẫn sử dụng nằm tại [UI_REVIEW_20261105.md](docs/UI_REVIEW_20261105.md).

| Kiểm tra | Kết quả | Bằng chứng cục bộ có thể tạo lại |
|---|---|---|
| Migration 0001–0005 và API trên MySQL/InnoDB riêng | 103 đạt, 0 lỗi, 0 bỏ qua | test-results/ui-review-20261105/mysql-final/ |
| Client refresh/session/draft | 5 đạt | npm test trong frontend |
| Hai kịch bản trình duyệt, 16 bước nghiệp vụ | 2 đạt; API/MySQL thật, không giả lập phản hồi nghiệp vụ | test-results/ui-review-20261105/browser-final/results.json |
| Smoke auth, task, AI documents, insights | Cả bốn phân hệ đạt | test-results/ui-review-20261105/smoke-*.json |
| Lint, TypeScript, frontend production build và Docker | Đạt | Các lệnh kiểm tra và Docker Compose |
| npm audit | Không có lỗ hổng được báo tại thời điểm chạy | npm audit --audit-level=moderate |
| Kiểm tra giao diện desktop 1680 px, mobile 390 px | 16 ảnh; không có page error, HTTP 5xx hoặc tràn trang trong lượt kiểm tra | test-results/ui-review-20261105/screens/visual-checks.json |

Bổ sung bảy ca hồi quy backend về điều kiện người nhận, hạ quyền, đổi/bỏ phân công và cập nhật danh sách riêng. Kịch bản browser kiểm tra thêm số giờ 1,1 không chặn lưu, mở đúng task từ danh sách cá nhân, giữ draft khi xung đột và xử lý mất mạng. Bộ MySQL được chạy bằng `python scripts/verify_docker.py --project dacn-finalcheck --skip-load --output-dir test-results/ui-review-20261105/mysql-final`. Browser dùng các biến E2E_UI_URL/E2E_API_URL rồi chạy `npm run test:e2e` trong frontend.

Không chạy lại bài tải trong đợt này; số liệu p95 ngày 04/11 bên dưới là kết quả lịch sử, chưa chứng minh hiệu năng của lần bổ sung phát sự kiện riêng cho người nhận. Không gọi Gemini thật: cấu hình chạy thử chưa có khóa; kiểm tra AI ở đây chỉ xác nhận ràng buộc tài liệu, quyền và xử lý lỗi.

## Kết quả ngày 04/11/2026

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
