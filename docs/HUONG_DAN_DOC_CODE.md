# Hướng dẫn đọc mã nguồn Smart Task Manager

Cập nhật ngày 14/11/2026.

## 1. Bắt đầu bằng một thao tác nhỏ

Ví dụ muốn hiểu tạo công việc:

1. Mở `frontend/src/components/Board.tsx`, tìm đoạn gửi yêu cầu tạo task.
2. Mở `frontend/src/lib/api.ts`, xem hàm `guiYeuCau` gửi dữ liệu tới backend.
3. Mở `backend/app/api/tasks.py`, tìm route `POST /projects/{project_id}/tasks`.
4. Mở `backend/app/services/task_workflow.py`, đọc hàm `create_task`.
5. Mở `backend/app/models.py`, xem lớp `Task` lưu các trường nào.

Luồng chung: bấm nút → React lấy dữ liệu form → gọi API → Python kiểm tra quyền và dữ liệu → lưu DB → gửi sự kiện cập nhật giao diện.

## 2. Các thư mục chính

| Vị trí | Mục đích |
|---|---|
| `frontend/src/components` | Màn hình, form và thao tác người dùng |
| `frontend/src/lib/api.ts` | Gửi HTTP, gắn token, làm mới phiên và đọc lỗi API |
| `frontend/src/lib/language.tsx` | Chọn tiếng Việt/Anh và dịch tên trạng thái |
| `frontend/src/lib/types.ts` | Kiểu dữ liệu React nhận từ backend |
| `backend/app/main.py` | Khởi tạo FastAPI, đăng ký route và WebSocket |
| `backend/app/api` | Nhận yêu cầu, kiểm tra dữ liệu và trả kết quả |
| `backend/app/services` | Tính toán và xử lý nghiệp vụ |
| `backend/app/security.py` | Token, phiên đăng nhập và quyền truy cập |
| `backend/app/schemas.py` | Quy tắc dữ liệu đầu vào/đầu ra |
| `backend/app/models.py` | Các bảng và quan hệ CSDL |
| `backend/alembic` | Các lần thay đổi cấu trúc CSDL; không đổi tên bằng cách sửa migration cũ |
| `backend/tests`, `frontend/tests` | Các tình huống kiểm thử |
| `server`, `docker` | Cấu hình triển khai và môi trường kiểm tra |

## 3. Quy tắc đặt tên

- Biến Python nội bộ dùng kiểu `nguoi_dung`, `du_an`, `cac_thay_doi`, `cot_dich`.
- Biến React nội bộ dùng kiểu `danhSachViec`, `dangTai`, `dangXuLy`, `taiThongBao`.
- Hàm xử lý dùng động từ: `taoNhom`, `doiVaiTro`, `xoaThanhVien`, `danhDauDaDoc`.
- Tên trường JSON và CSDL giữ như cũ: `project_id`, `assignee_id`, `estimated_hours`… Đổi một phía sẽ làm bên kia không đọc được dữ liệu.
- Tên hàm công khai, tham số route và component đang được nơi khác sử dụng được giữ ổn định. Không thêm một lớp hàm chỉ để dịch tên một hàm sẵn có.
- Từ khóa và hàm thư viện như `async`, `await`, `useState`, `useEffect`, `select`, `commit` giữ nguyên.

| Tên thường gặp | Ý nghĩa |
|---|---|
| `user` / `nguoi_dung` | Tài khoản đang thao tác |
| `workspace` | Không gian làm việc của nhóm |
| `project` / `du_an` | Dự án trong nhóm |
| `task` | Công việc trên Kanban |
| `subtask` / `viec_con` | Phần việc nhỏ thuộc task |
| `assignee_id` | ID người được giao việc |
| `estimated_hours` / `actual_hours` | Giờ dự kiến / giờ thực tế được ghi nhận |
| `db` | Phiên làm việc với CSDL |
| `version` | Số phiên bản để phát hiện bản sửa cũ |
| `snapshot` | Bản ghi lịch sử ước lượng tại một thời điểm |
| `fingerprint` | Dấu vân tay để nhận biết bộ tài liệu đã đổi |

## 4. Những cú pháp cần hiểu

### Python

`select(Task).where(...)` tạo câu truy vấn; `db.scalars(...)` chạy truy vấn và lấy các đối tượng. `db.add(...)` đưa đối tượng vào phiên làm việc; `db.commit()` xác nhận thay đổi vào CSDL. `db.rollback()` kết thúc giao dịch và bỏ thay đổi chưa commit, nếu có.

`Depends(current_user)` yêu cầu FastAPI xác thực trước khi chạy hàm. `raise HTTPException(...)` dừng yêu cầu và trả mã lỗi, chẳng hạn 404 hoặc 409.

`with_for_update()` khóa các hàng cần sửa trong giao dịch. Không bỏ khóa chỉ vì lệnh dài: việc sắp xếp Kanban hoặc duyệt kế hoạch hai lần phụ thuộc vào cơ chế này.

### React

`useState` giữ dữ liệu của màn hình. Ví dụ `const [dangTai, datDangTai] = useState(true)` tạo biến và hàm thay đổi biến đó. Khi gọi hàm cập nhật, React vẽ lại giao diện.

`useEffect` chạy công việc sau khi màn hình hiển thị hoặc dữ liệu phụ thuộc thay đổi. Hàm `return` bên trong effect dọn kết nối hoặc đánh dấu kết quả trả muộn không còn được dùng.

`async/await` chờ kết quả API. `try/catch/finally` chia ba phần: thực hiện, xử lý lỗi và kết thúc trạng thái đang xử lý. `Promise.all` chờ nhiều yêu cầu độc lập cùng lúc; đổi hết thành chờ tuần tự có thể làm màn hình chậm hơn.

`map` tạo danh sách mới; `filter` giữ phần tử đạt điều kiện; `find` tìm phần tử đầu tiên phù hợp. Những phép này vẫn dùng ở nơi ngắn, rõ và quen thuộc với React.

`T` trong `api.get<T>` là kiểu kết quả mong đợi của TypeScript, không phải dữ liệu gửi cho server. `...` sao chép hoặc gộp thuộc tính. Khi sửa state dạng đối tượng/mảng, tạo bản mới giúp React nhận ra thay đổi.

## 5. Đọc theo phân hệ

| Muốn hiểu | Mở theo thứ tự |
|---|---|
| Đăng nhập | `AuthScreen.tsx` → `api.ts` → `api/auth.py` → `security.py` |
| Workspace và thành viên | `App.tsx`, `Skills.tsx`, `InvitationInbox.tsx` → `api/workspaces.py`, `api/invitations.py` |
| Công việc và Kanban | `Board.tsx` → `api/tasks.py` → `task_workflow.py` → `task_transactions.py` |
| Việc con và bình luận | Phần chi tiết trong `Board.tsx` → `api/collaboration.py` |
| AI theo tài liệu | `AIAssistant.tsx` → `api/ai.py` → `gemini.py` và `ai_planning.py` |
| Kỹ năng và tải | `Skills.tsx`, `Overview.tsx` → `api/insights.py` → `analytics.py` |
| Thời gian thực | WebSocket trong `App.tsx`, `Board.tsx` → `main.py` → `realtime.py` |

Các service Python ở cột cuối nằm trong `backend/app/services`; `main.py`, `security.py`, `realtime.py` ở `backend/app`. Component nằm trong `frontend/src/components`.

## 6. Phạm vi chỉnh sửa và kiểm tra

Đợt này làm rõ các bước xử lý, đổi tên biến nội bộ, tách biểu thức lồng và bổ sung chú thích. API, lược đồ DB, thông báo giao diện, công thức, ngưỡng, quyền và thời hạn token được giữ theo hành vi trước chỉnh sửa.

Đây là đợt làm mã dễ đọc, không phải đợt bổ sung chức năng hay sửa lỗi nghiệp vụ của lượt rà soát trước. Việc con chưa chống ghi đè, danh sách việc cá nhân chưa gồm việc con, lọc tải chưa tính việc quá hạn và các giới hạn realtime/triển khai vẫn cần xử lý riêng.

Sau chỉnh sửa: 113 ca backend trên SQLite tách biệt, 6 ca client và hai kịch bản browser đạt. Hai kịch bản browser kiểm tra giao việc hai người dùng và giao diện duyệt AI. AI browser dùng provider giả lập, không đo chất lượng Gemini. OpenAPI trước/sau giống nhau; không đổi migration. Docker chưa hoạt động nên chưa chạy lại MySQL, migration hoặc bài đo tải trong đợt này.

## 7. Khi tự sửa một hàm

1. Đọc nơi gọi hàm để biết đầu vào đến từ đâu.
2. Xác định các trường trả về và nơi đang dùng chúng.
3. Sửa một vấn đề cụ thể; giữ các bước kiểm tra quyền, version và giao dịch.
4. Chạy kiểm thử liên quan, sau đó thử lại trên giao diện.
5. Xem diff trước khi commit. Không đưa `.env`, tài liệu riêng hoặc dữ liệu thử vào source nộp.
