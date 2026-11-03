# Yêu cầu tiến độ lần 2 theo phân hệ

Phân công ngày 04/11/2026: Cả bốn người tự thực hiện API, frontend và kiểm tra Docker của phân hệ mình. Đăng nhận thêm setup và tích hợp chung.

| Người | Phân hệ | API | Frontend | Docker | Nhánh |
|---|---|---|---|---|---|
| Nguyễn Xuân Đăng | [Nhóm #1](https://github.com/xuandang0405/dacn/issues/1) | Auth/workspace/invitation và model/schema/core chung. | AuthScreen/App/SettingsPanel/InvitationInbox. | Compose chung và kiểm tra Docker Auth/Workspace. | setup/platform |
| Phạm Minh Dương | [Nhóm #2](https://github.com/xuandang0405/dacn/issues/2) | ai.py, Gemini, tài liệu và storage. | AIAssistant.tsx: tài liệu, hỏi đáp, bản nháp và xác nhận. | Smoke/Compose riêng cho AI và tài liệu; phối hợp Compose gốc của Đăng. | feature/ai-documents |
| Phạm Tấn Đạt | [Nhóm #3](https://github.com/xuandang0405/dacn/issues/3) | Project/task/subtask/comment/notification, transaction và WebSocket. | Board.tsx, MyTasks.tsx, Notifications.tsx. | Smoke/Compose riêng cho task/WebSocket; bài tải và E2E trong stack. | feature/task-kanban |
| Trần Đăng Khoa | [Nhóm #4](https://github.com/xuandang0405/dacn/issues/4) | insights.py, analytics.py: skills, capacity, workload, dashboard và MAPE. | Skills.tsx và Overview.tsx, trạng thái dữ liệu và VI/EN. | Smoke/Compose riêng cho insights, kiểm tra MySQL và ghép cloud. | feature/skills-analytics |

## Yêu cầu con

| Nhóm | Issue cần thực hiện |
|---|---|
| Nguyễn Xuân Đăng | [#11](https://github.com/xuandang0405/dacn/issues/11), [#12](https://github.com/xuandang0405/dacn/issues/12), [#13](https://github.com/xuandang0405/dacn/issues/13), [#14](https://github.com/xuandang0405/dacn/issues/14), [#19](https://github.com/xuandang0405/dacn/issues/19), [#20](https://github.com/xuandang0405/dacn/issues/20) |
| Phạm Minh Dương | [#7](https://github.com/xuandang0405/dacn/issues/7), [#23](https://github.com/xuandang0405/dacn/issues/23), [#24](https://github.com/xuandang0405/dacn/issues/24) |
| Phạm Tấn Đạt | [#5](https://github.com/xuandang0405/dacn/issues/5), [#15](https://github.com/xuandang0405/dacn/issues/15), [#16](https://github.com/xuandang0405/dacn/issues/16), [#17](https://github.com/xuandang0405/dacn/issues/17), [#25](https://github.com/xuandang0405/dacn/issues/25) |
| Trần Đăng Khoa | [#6](https://github.com/xuandang0405/dacn/issues/6), [#18](https://github.com/xuandang0405/dacn/issues/18), [#21](https://github.com/xuandang0405/dacn/issues/21), [#26](https://github.com/xuandang0405/dacn/issues/26) |

## Đối chiếu yêu cầu của thầy

| Thành phần | Phần việc và minh chứng |
|---|---|
| Hành chính và phân công | #8 tổng hợp thành viên, Lead, tỷ lệ nhóm xác nhận và tiến độ theo PR |
| CSDL và dữ liệu mẫu | Đăng: migration, khóa/ràng buộc/snapshot, seed và ảnh quản trị #11–#13 |
| Backend và API | Mỗi bạn tự thực hiện API của phân hệ; Swagger và JSON thật, có thành công và lỗi |
| Frontend và E2E | Mỗi bạn tự ghép màn hình phân hệ; Đạt phối hợp luồng Task hai vai trò và realtime |
| Test Report | Mỗi bạn kiểm thử phần mình; Đạt tổng hợp happy/boundary/exception và Pass/Fail #16 |
| Docker | Đăng setup Compose gốc #19; Dương #24, Đạt #25, Khoa #26 bổ sung smoke/override riêng |
| Freeze, cloud và demo | #8 bug log/freeze, #21 cloud phối hợp Đăng, #17 demo/video của nhóm |

## Cách gửi code

1. Lấy gói theo người và clone đầy đủ repository trên nhánh trong bảng.
2. Thực hiện issue của phân hệ, gồm cả API/UI/Docker; tệp nền và Compose gốc phối hợp Đăng.
3. Tự commit phần đã sửa, mở PR vào integration/mvp; một PR nên chốt một yêu cầu.
4. Kèm mã commit, lệnh test, ảnh/log/HTTP và kết quả; có người khác review và CI đạt trước merge.
5. Không đánh dấu yêu cầu xong chỉ vì đã tải source hoặc chép lại file không thay đổi.

Đăng/Dương đã có quyền ghi; Đạt/Khoa được thêm sau hoặc gửi PR từ fork. Các nhánh mới dùng cùng mã nền; nhánh cũ được giữ nguyên.

[Gói code và danh sách tệp](PHAN_CHIA_CODE_FULLSTACK.md) · [Tổng hợp hồ sơ #8](https://github.com/xuandang0405/dacn/issues/8) · [Release tải gói](https://github.com/xuandang0405/dacn/releases/tag/chia-code-fullstack-2026-11-04)
