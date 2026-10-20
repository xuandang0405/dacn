# Kịch bản demo tiến độ lần 2

Mốc yêu cầu: 06/11/2026, thời lượng 3–5 phút. Kịch bản dưới đây đã được kiểm tra qua browser E2E cho vòng đời task; buổi trình diễn và video dự phòng chưa được thực hiện.

## Chuẩn bị

- Dùng bản mã đã được review, .env riêng và dữ liệu demo tổng hợp. Khởi động `docker compose up -d`.
- Mở hai profile/cửa sổ riêng: OWNER owner@demo.example.com và MEMBER lan@demo.example.com. Mật khẩu demo trong README; không trình chiếu .env hay token.
- Chọn Demo Workspace và project Smart Task Manager ở cả hai cửa sổ.
- Mở sẵn Swagger và Adminer sau đăng nhập. Kiểm tra mạng/health trước khi bắt đầu.

| Thời gian | Vai trò | Thao tác và kết quả cần thấy |
|---|---|---|
| 0:00–0:30 | OWNER/MEMBER | Đăng nhập hai phiên, chỉ rõ quyền của từng vai trò |
| 0:30–1:30 | OWNER | Tạo task, giao Lan, đặt estimate 4 giờ; MEMBER nhận task qua WebSocket |
| 1:30–2:30 | MEMBER | Nhập actual 5 giờ, lưu và kéo sang DONE; OWNER thấy đổi mà không reload |
| 2:30–3:15 | OWNER | Reload, kiểm tra task vẫn còn, mở analytics và đối chiếu DB |
| 3:15–4:00 | OWNER | Swagger cho thấy phản hồi thật; trình bày 409 khi dùng version cũ và 422 khi title null |
| 4:00–4:30 | OWNER | Cho thấy tài liệu theo Project và bước người dùng xác nhận kế hoạch AI; nếu provider lỗi thì trình bày lỗi thật |
| 4:30–5:00 | Nhóm | Nêu giới hạn tải 100 đồng thời, AI/MAPE và kế hoạch sửa; không kết luận toàn hệ thống đã hoàn thiện |

## Dự phòng và đóng băng

- Quay video dự phòng 2–3 phút bằng bản chạy thật, có hai vai trò, thời điểm quay và mã commit. Hiện chưa có video để nộp.
- Nếu demo AI phụ thuộc quota, dùng dữ liệu đánh giá đã ghi nhận và nêu điều kiện; không giả lập một câu trả lời thành công.
- Sau 06/11 chỉ nhận sửa lỗi, kiểm thử và triển khai; mỗi lỗi phải có issue, PR và bằng chứng kiểm tra lại.
- Mốc cloud/HTTPS và video: đề xuất trước 05/11. Báo cáo cuối theo lịch môn học ngày 23/11.
