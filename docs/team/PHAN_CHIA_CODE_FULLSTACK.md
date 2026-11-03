# Chia mã nguồn theo phân hệ

Bản chia ngày 04/11/2026. Dương, Đạt và Khoa mỗi người phụ trách API, frontend và phần Docker của một phân hệ. Đăng setup và tích hợp chung.
Mã nền: 3a5d56950a786835bb78ae6b982a4a3c453ed780. Mã nguồn đã tồn tại trên repository; các gói là bản bàn giao module để thực hiện yêu cầu, không phải lịch sử đóng góp mới.

| Người | Phân hệ | API | Frontend | Docker |
|---|---|---|---|---|
| Đăng | Setup chung | Nền xác thực/workspace dùng chung | Shell, đăng nhập/workspace dùng chung | Compose, image, DB/seed, volume và cấu hình gốc |
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

## Tải mã nguồn theo người

- [Đăng: 01_Dang_Setup.zip](https://github.com/xuandang0405/dacn/releases/download/chia-code-fullstack-2026-11-04/01_Dang_Setup.zip)
- [Dương: 02_Duong_AI_TaiLieu.zip](https://github.com/xuandang0405/dacn/releases/download/chia-code-fullstack-2026-11-04/02_Duong_AI_TaiLieu.zip)
- [Đạt: 03_Dat_Task_Kanban.zip](https://github.com/xuandang0405/dacn/releases/download/chia-code-fullstack-2026-11-04/03_Dat_Task_Kanban.zip)
- [Khoa: 04_Khoa_Skills_Analytics.zip](https://github.com/xuandang0405/dacn/releases/download/chia-code-fullstack-2026-11-04/04_Khoa_Skills_Analytics.zip)

Các gói là mã nền để nhận việc. Những file smoke/Compose riêng trong yêu cầu Docker là phần cần bổ sung, chưa có trong bản nền.
