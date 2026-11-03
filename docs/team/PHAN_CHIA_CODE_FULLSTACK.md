# Chia mã nguồn theo phân hệ

Bản chia ngày 04/11/2026. Mỗi người phụ trách API, frontend và phần Docker của cùng một phân hệ; Đăng setup và tích hợp chung.
Mã nền: 3a5d56950a786835bb78ae6b982a4a3c453ed780. Mã nguồn đã tồn tại trên repository; các gói là bản bàn giao module để thực hiện yêu cầu, không phải lịch sử đóng góp mới.

| Người | Phân hệ | API | Frontend | Docker |
|---|---|---|---|---|
| Đăng | Setup + Auth/Workspace | API tài khoản/workspace/lời mời và nền dùng chung | AuthScreen, App, SettingsPanel, InvitationInbox | Compose, image, DB/seed, volume và kiểm tra Docker Auth/Workspace |
| Dương | AI và tài liệu | ai.py, Gemini/documents/storage | AIAssistant | Smoke test Docker tài liệu/AI |
| Đạt | Project/Task/Kanban/Realtime | projects/tasks/collaboration, workflow/transaction/Hub | Board, MyTasks, Notifications | Kiểm tra Docker task/WS/tải |
| Khoa | Kỹ năng/Workload/Analytics | insights.py, analytics.py | Skills, Overview | Kiểm tra Docker số liệu/role |

## Thư mục và tệp trong từng gói

- code/: tệp được giao, giữ đường dẫn tương đối của project.
- docker-tham-khao/: cấu hình Docker chung để tham khảo; Đăng tích hợp thay đổi cấu hình gốc.
- HUONG_DAN.md: nhánh, issue, lệnh kiểm tra và cách commit/PR.
- DOCKER_CAN_LAM.md: sản phẩm Docker mỗi người phải thực hiện.
- DANH_SACH_TEP.txt và MANIFEST.json: phạm vi tệp và checksum.

## Tích hợp

1. Clone đầy đủ repository, chọn nhánh phần việc của mình.
2. Sửa các yêu cầu được giao, kiểm tra cả API/UI/Docker. Khi cần sửa tệp nền chung, phối hợp Đăng.
3. Chỉ stage tệp đã kiểm tra; tự commit/push bằng tài khoản của mình, mở PR vào integration/mvp.
4. Có người khác review và CI đạt rồi mới merge. Không xóa module khác hoặc chép lại file không thay đổi để tạo đóng góp.
5. Cần tách PR theo yêu cầu thì tạo nhánh con từ origin/integration/mvp.

Các gói không chứa .git, .github, .env thật, database, tài liệu người dùng, node_modules, .venv hoặc thư mục build. Không phải các ứng dụng chạy độc lập.

## Tải mã nguồn

[Trang tải đủ bốn gói](https://github.com/xuandang0405/dacn/releases/tag/chia-code-fullstack-2026-11-04)
