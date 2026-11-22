# Smart Task Manager

Đồ án chuyên ngành của Nhóm 3C, Khoa Công nghệ Thông tin, Trường Đại học Sài Gòn. Smart Task Manager giúp nhóm quản lý dự án, phân công công việc và theo dõi tiến độ trên bảng Kanban. Trợ lý Gemini đọc tài liệu của từng dự án, trả lời câu hỏi và đề xuất kế hoạch để người dùng chỉnh sửa, duyệt và tạo công việc.

## Chức năng chính

- Đăng nhập, làm mới phiên, quản lý workspace, lời mời và quyền truy cập dự án.
- Tạo việc, giao người thực hiện, thêm việc con, ghi giờ và chuyển trạng thái trên Kanban.
- Bình luận, nhắc tên, nhận thông báo và đồng bộ thay đổi qua Socket.IO.
- Theo dõi kỹ năng, năng lực theo tuần, tải công việc, tiến độ và sai số ước lượng MAPE.
- Khi giao việc vượt năng lực, Kanban cảnh báo quá tải và đề xuất thành viên đủ kỹ năng, còn đủ giờ. Quản lý duyệt trước khi chuyển người.
- Tải PDF, DOCX, TXT hoặc Markdown theo dự án, hỏi Gemini và chuyển câu trả lời thành bản nháp kế hoạch.
- Giao diện tiếng Việt và tiếng Anh.

## Chạy nhanh với Docker

Cần Python 3, Docker Engine chạy Linux containers và Docker Compose. Chạy ở thư mục gốc repository.

```powershell
git clone https://github.com/xuandang0405/dacn.git
cd dacn
python scripts/setup_demo_env.py
docker compose up -d --build
docker compose ps -a
```

Compose gom các dịch vụ cục bộ dưới tên **smart-task-manager** trong Docker Desktop. Chạy lại các lệnh trên ở thư mục này để cập nhật cùng một bộ. Lệnh tạo cấu hình sinh mật khẩu MySQL và bí mật JWT riêng khi chưa có `.env`. Compose chờ MySQL sẵn sàng, chạy Alembic lên `0006`, nạp bản ghi mẫu nếu `SEED_DEMO=true`, rồi khởi động API, giao diện và tiến trình nhắc hạn.

| Địa chỉ mặc định | Mục đích |
| --- | --- |
| http://localhost:3000 | Giao diện |
| http://localhost:8000/docs | Swagger UI |
| http://localhost:8000/openapi.json | Hợp đồng OpenAPI |
| http://localhost:8000/health | Kiểm tra kết nối CSDL |

- Xem log khi khởi động lỗi với `docker compose logs initialize backend frontend`.
- Dừng bằng `docker compose down`. Named volumes giữ CSDL và tài liệu dự án.
- Khi đổi cổng, đặt `FRONTEND_PORT`, `BACKEND_PORT`, `FRONTEND_ORIGIN` và `NEXT_PUBLIC_API_URL` cho khớp rồi build lại frontend.

## Năm tài khoản kiểm thử

Mật khẩu mẫu của cả năm tài khoản là **`STM-Demo-Only-2026!`**. Chọn workspace **Demo Workspace** và dự án **Smart Task Manager**.

| Email | Vai trò trong Demo Workspace | Kịch bản |
| --- | --- | --- |
| `owner@demo.example.com` | OWNER | Quản lý nhóm, tạo dự án, làm người giao việc |
| `admin@demo.example.com` | ADMIN | Quản lý thành viên, năng lực và kỹ năng |
| `lan@demo.example.com` | MEMBER | Nhận việc, ghi giờ và chuyển cột Kanban |
| `long@demo.example.com` | MEMBER | Theo dõi dự án từ phiên trình duyệt thứ hai |
| `mai@demo.example.com` | MEMBER | Kiểm tra phân công lại và Công việc của tôi |

Seed tự động của Compose tạo thêm dữ liệu để thử nhiều dự án. Có thể đặt `DEMO_PASSWORD` trong `.env` trước lần seed đầu tiên. Seed không đổi mật khẩu tài khoản đã tồn tại. Dùng các tài khoản có mật khẩu công khai trên CSDL kiểm thử riêng.

## Nhập SQL bằng tay hoặc chạy trên Windows

1. Bật MySQL 8.4. Mở [database/schema.sql](database/schema.sql) trong MySQL Workbench hoặc công cụ tương đương và thực thi toàn bộ tệp trên hệ quản trị chưa có bảng của ứng dụng. Tệp chọn database `smart_task_manager`, tạo schema ở phiên bản `0006` và nạp năm tài khoản, một workspace, một dự án, năm cột Kanban, năm công việc và snapshot tương ứng.
2. Để nhập qua Command Prompt, chạy `mysql --default-character-set=utf8mb4 -u root -p < database\schema.sql`. Bỏ `-p` nếu MySQL local dùng root không mật khẩu. Nếu cần schema trống, chạy `SET @seed_test_accounts = 0;` rồi thực thi tệp trong cùng phiên kết nối MySQL.
3. Chạy `run.bat` ở thư mục gốc. Script khởi động frontend, API và tiến trình nhắc hạn trong một cửa sổ. `run.bat --check` kiểm tra cấu hình. Mặc định dùng MySQL `root@127.0.0.1:3306` với mật khẩu rỗng. Khóa Gemini khi chạy trực tiếp đặt trong `backend/.env`.

Nếu dùng cổng MySQL khác, đặt biến `DATABASE_URL` ngay trong cửa sổ Command Prompt dùng để chạy script.

```bat
set "DATABASE_URL=mysql+pymysql://root@127.0.0.1:3307/smart_task_manager?charset=utf8mb4"
run.bat
```

Với database đã có dữ liệu, sao lưu rồi nâng cấp bằng `python -m alembic upgrade head` trong môi trường backend. Nếu từng nhập bản SQL cũ và đã có **cả** bảng `task_creation_requests` lẫn cột `subtasks.version` trong khi `alembic_version` còn là `0005`, đối chiếu ràng buộc và chỉ mục với migration `0006` trước khi đồng bộ mốc bằng `python -m alembic stamp 0006`.

## Thử luồng nghiệp vụ

1. **Phân rã và duyệt.** OWNER hoặc ADMIN mở Trợ lý AI, chọn dự án, tải tài liệu và nhập mục tiêu. Nêu kỹ năng trong mục tiêu và chấm trước các kỹ năng liên quan ở Ma trận kỹ năng. Bấm **Tạo bản nháp và đề xuất người nhận**, kiểm tra từng việc, sửa nếu cần rồi **Xác nhận và giao việc**. Mở Kanban để đối chiếu việc vừa lưu.
2. **Thử realtime.** Mở cùng bảng Kanban ở hai phiên OWNER và MEMBER. MEMBER kéo thẻ sang cột khác. OWNER quan sát thẻ đổi cột mà không tải lại trang. Tắt bộ lọc ở phiên đang thao tác để sử dụng kéo thả.
3. **Thử quá tải và MAPE.** Trong một workspace demo riêng, cấu hình MEMBER có năng lực 8 giờ/tuần, giao một việc mở 8 giờ rồi giao thêm việc 2 giờ. Kiểm tra cảnh báo 125% và người thay thế còn đủ năng lực, sau đó xác nhận chuyển người. Ở dự án chưa có mẫu MAPE khác, đưa một việc dự kiến 4 giờ và thực tế 5 giờ vào cột Hoàn thành, rồi mở **Phân tích** để thấy MAPE 20%.

Khi đổi khóa hoặc model trên Compose local, chạy `docker compose up -d --no-deps --force-recreate backend`. `GEMINI_MODEL` mặc định dùng `gemini-3.1-flash-lite`; chọn model được khóa của bạn cấp quyền. Cấu hình SMTP riêng nếu cần thử quên mật khẩu.

## Kiến trúc và kiểm thử

Next.js gọi FastAPI qua REST và nhận sự kiện qua Socket.IO. Kết nối ưu tiên nâng cấp lên WebSocket và có thể duy trì qua HTTP long-polling khi proxy không hỗ trợ nâng cấp. Backend kiểm tra quyền theo workspace và dự án, ghi MySQL/InnoDB và lưu tài liệu trong kho tệp riêng. Sự kiện được phát sau khi commit. Hub realtime hiện chạy trong một tiến trình backend. Client gửi `Idempotency-Key` khi tạo công việc, còn sửa công việc và việc con dùng version để phát hiện bản cập nhật cũ.

- Báo cáo Word, PDF và video demo được bàn giao cùng bộ hồ sơ của nhóm.
- [Đặc tả API](docs/api/API_Specs.md) · [OpenAPI JSON](docs/api/openapi.generated.json) · [Postman](docs/api/postman.local.collection.json)
- [Kết quả kiểm thử](TEST_REPORT.md) · [Minh chứng hồi quy](docs/testing/stability-20261118/) · [Kiểm thử năm tài khoản](docs/testing/demo-report-20261121.json) · [Diễn tập trên Docker](docs/testing/demo-docker-20261121.json)
- [Hướng dẫn đọc mã nguồn](docs/HUONG_DAN_DOC_CODE.md)
- [Triển khai trên máy chủ Windows/Docker](server/README_WINDOWS.md)

Để chạy kiểm thử backend, dùng môi trường Python 3.12 với `backend/requirements.lock` và CSDL kiểm thử riêng. Từ thư mục `backend`, chạy `python -m pytest` theo cấu hình trong [TEST_REPORT.md](TEST_REPORT.md). Từ thư mục `frontend`, chạy `npm ci`, `npm test`, `npm run lint` và `npm run build`.

Trên máy chủ dùng `.env.server` riêng. Giữ `SEED_DEMO=false` cho dữ liệu vận hành. Nếu mở demo qua Internet, dùng database kiểm thử và mật khẩu riêng để gửi cho người chấm. Git chỉ lưu tệp ví dụ cấu hình, không đưa `.env`, `.env.server`, khóa Gemini hoặc dữ liệu người dùng lên repository.
