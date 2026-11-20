# Sửa lỗi và kiểm tra ổn định ngày 18 tháng 11 năm 2026

Phạm vi là source FastAPI/MySQL và Next.js hiện tại. Theo yêu cầu mới, người dùng tự triển khai lên server; đợt này không đăng nhập hay thay đổi server bên ngoài. Source đang ở nhánh local `integration/final-20261118`, chưa tự push hoặc thay đổi main.

## Các lỗi đã xử lý

| Vấn đề | Thay đổi | Kiểm chứng |
|---|---|---|
| Tạo task trùng khi bấm lặp hoặc mất phản hồi sau COMMIT | Header Idempotency-Key; UNIQUE theo user/Project/key hash; lưu response cùng giao dịch task, snapshot, activity và notification | Gửi lặp, cạnh tranh hai request cùng/khác payload, lỗi giữa giao dịch và key hết hạn trên MySQL |
| Key bị đổi khi gửi lại từ frontend | Cùng thao tác giữ key; chia sẻ request đang chạy; giữ trong sessionStorage theo user/Project khi lỗi mạng; gửi lại sau reload cùng tab dùng key cũ | 9 test client; browser chặn phản hồi sau khi backend đã lưu, reload và gửi lại chỉ còn một task |
| Response phát lại lệch thời gian so với lần đầu | Đọc lại giá trị MySQL đã chuẩn hóa trước khi lưu response | Response 201 đầu và phát lại giống nhau, kể cả DATETIME/NUMERIC |
| Việc con bị bản sửa cũ ghi đè | Subtask có version; PUT bắt buộc version, khóa hàng và trả 409 khi xung đột; bỏ phân công do thu hồi quyền cũng tăng version | Test stale update, bản ghi không bị ghi đè; client giữ bản sửa và cho phép lấy bản hiện tại |
| Người được giao việc con không tìm được việc | Thêm include_subtasks khi lọc task; danh sách cá nhân trả task cha để mở chi tiết, có nhãn chỉ rõ phần việc con | API có quyền Project và browser đối chiếu danh sách |
| Việc quá hạn chưa xong bị loại khỏi tải | Vẫn tính backlog quá hạn còn mở của task và subtask; việc đã Done hoặc bắt đầu sau khoảng xem được xử lý theo quy tắc tương ứng | Test 40 giờ quá hạn còn mở vẫn tính 40 giờ, không thành 0 |
| Dashboard/tải hiển thị cũ khi task đổi | Sự kiện workspace.changed trên kênh thông báo, chỉ gửi ACTIVE member; payload không chứa nội dung task ngoài quyền; frontend làm mới dữ liệu và có polling dự phòng | Browser quan sát Dashboard đổi từ 1 lên 2 task; test không gửi tín hiệu nhóm khác cho outsider |
| Không cấu hình được năng lực tuần | Thêm API và ô nhập giờ/tuần trên màn hình Thành viên; OWNER/ADMIN được sửa, MEMBER bị từ chối; 0 nghĩa là không khả dụng | Test 20 giờ, 0 giờ và giá trị không hợp lệ; browser lưu và đọc lại 20 giờ, kiểm tra mobile 390 px |
| Giao diện việc con thiếu thao tác đã có ở backend | Sửa tên, mô tả, người nhận, giờ dự kiến/thực tế, hạn; xóa việc con; giữ version khi lưu | Browser sửa việc con, kiểm tra DB trả giờ mới và version tăng từ 1 lên 2 |
| Model Gemini mặc định không đồng nhất giữa local/server | Đồng bộ model mặc định và ví dụ local sang gemini-3.1-flash-lite, model đã gọi thành công trong đợt này; cấu hình riêng vẫn được ưu tiên | Gemini thật qua API, không dùng provider stub cho phép thử kết nối |
| Các suite browser có thể tự làm đầy rate limiter chung trong CI | Mỗi suite chạy trên job/môi trường Compose riêng qua matrix | Cấu hình CI tách website/assignment/ai-review-ui/stability; không nới giới hạn đăng ký production để làm test đạt |

## Kết quả thực tế

- 134 ca backend đạt, không lỗi hoặc bỏ qua, với migration 0001–0006 trên MySQL/InnoDB riêng. Đã chạy cả trên Windows/Python và trong image backend Python 3.12 với source hiện tại được mount vào `/code`. Ca seed vẫn dùng SQLite tách biệt theo thiết kế bộ test.
- 9 kiểm thử client đạt; TypeScript, lint và production build đạt.
- Hai kịch bản browser nghiệp vụ đạt: assignment hai người dùng, và stability gồm mất phản hồi sau COMMIT/reload/retry, sửa việc con, lưu năng lực tuần, mobile và Dashboard. API/DB thật, không giả lập dữ liệu nghiệp vụ.
- Một kịch bản duyệt AI trên browser đạt với provider stub. Đây là kiểm tra UI, không phải đánh giá chất lượng Gemini.
- Gemini thật qua API trên môi trường triển khai local tách biệt trả 200 cho hỏi đáp và lập kế hoạch; sinh 4 task, xác nhận 201 và đọc lại đủ 4 task trong MySQL; xác nhận lặp trả 409. Yêu cầu hỏi lặp trúng cache. Model thực nhận là gemini-3.1-flash-lite.
- Đã thử nâng một MySQL DB có dữ liệu từ 0005 lên 0006: giữ nguyên task/subtask cũ và điền version=1 cho việc con.
- OpenAPI đã xuất lại: 63 thao tác HTTP, hai WebSocket mô tả riêng. Có 21 bảng nghiệp vụ và một bảng kỹ thuật hỗ trợ chống tạo trùng.

Minh chứng có thể mang sang máy khác nằm trong `docs/testing/stability-20261118`: JUnit MySQL, kết quả migration, tóm tắt browser và phép gọi Gemini. Đây là dữ liệu tổng hợp; không chứa khóa API, mật khẩu tài khoản vận hành hoặc tài liệu người dùng.

Đợt này chưa build và chạy lại toàn bộ gói Compose ở server đích, chưa kiểm tra URL HTTPS công khai, SMTP Internet, Windows Firewall, backup/restore máy đích hoặc đo lại tải 100 người. Không coi kiểm thử backend trong container là đã nghiệm thu toàn bộ triển khai Cloud. Các kết quả kiểm tra gói ngày 06/11 vẫn là kết quả lịch sử của bản đó.

## Cách dùng cơ chế chống tạo trùng

- Frontend tự tạo key khi tạo task. Retry cùng nội dung sau lỗi mạng/timeout giữ key trong bộ nhớ và sessionStorage. Khi đã nhận thành công, thao tác tạo công việc mới dùng key mới.
- Scope là user + Project. Key có hiệu lực 24 giờ; cùng key và payload đã chuẩn hóa trả lại response 201 gốc, có header Idempotency-Replayed=true. Nội dung khác trong thời hạn này trả 409.
- Header còn tùy chọn cho client cũ; request không gửi key vẫn giữ cách tạo task trước đây. Muốn bảo vệ một client tích hợp khác, client đó phải giữ và gửi key đúng thao tác.
- Key hết hạn có thể được dùng cho thao tác mới. Các hàng hết hạn hiện được tái sử dụng khi key được gọi lại; chưa có job tự xóa hàng hết hạn, cần cân nhắc bảo trì khi vận hành lâu dài.
- Lỗi mạng sau COMMIT không đồng nghĩa server chưa tạo task. Không đổi tên hoặc tạo key mới chỉ để thử lại cùng một thao tác.
- Các endpoint tạo subtask/bình luận chưa được mở rộng Idempotency-Key trong đợt này. Xác nhận kế hoạch AI dùng request_id/confirmed_at riêng và trả 409 khi xác nhận lại.

## Nâng cấp trên server tự quản lý

1. Sao lưu DB và kho tài liệu, giữ file `.env.server` và tên project/volume hiện tại.
2. Thay source bằng bản mới; không dùng ZIP ngày 06/11 để triển khai các sửa đổi ngày 18/11.
3. Chạy `start-server.bat` để build lại và chạy Alembic. Nếu chạy backend ngoài Docker, thực hiện `python -m alembic upgrade head` trong thư mục backend với DATABASE_URL đúng trước khi khởi động.
4. Kiểm tra Alembic head là 0006; có bảng task_creation_requests và cột subtasks.version. Không chạy schema.sql lên DB đã có dữ liệu.
5. Đặt PUBLIC_URL đúng origin thực tế. Kiểm tra cookie, CORS và WebSocket sau reverse proxy. Khóa Gemini chỉ đặt ở backend/môi trường server; nếu đổi `.env.server`, cần tạo lại container để nạp biến mới.
6. Thử tạo task và gửi lại cùng key; thử sửa một việc con; đổi năng lực tuần rồi đọc Dashboard ở browser thứ hai.

Frontend và backend phải nâng cùng phiên bản vì PUT việc con nay bắt buộc version. Client tự tích hợp cần đọc schema mới. Mô tả trong báo cáo DOCX cũ chưa tự thay đổi theo các trường/API mới; cần cập nhật khi chốt quyển báo cáo cuối.

## Giới hạn còn giữ

- Một backend worker và một scheduler; Hub/rate limiter nằm trong RAM, chưa hỗ trợ nhiều replica dùng chung trạng thái.
- Không có bảo đảm phát sự kiện đúng một lần khi tiến trình dừng sau COMMIT. DB là nguồn dữ liệu chuẩn; client tải lại khi reconnect/polling.
- Việc có test đạt không chứng minh hệ thống hết mọi lỗi. Chưa chạy lại phép đo p95/load/soak trong đợt này.
- AI tạo kế hoạch để người dùng duyệt, chưa phải Agent tự chủ hoặc mô hình được fine-tune. Phép gọi Gemini nhỏ chỉ xác nhận luồng hoạt động, không phải đánh giá chất lượng tổng quát.
