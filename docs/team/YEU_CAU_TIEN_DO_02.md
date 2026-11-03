# Yêu cầu công việc tiến độ lần 2

Theo dõi tổng hợp tại [issue #8](https://github.com/xuandang0405/dacn/issues/8). Mốc chuẩn bị: 05/11/2026; demo: 06/11/2026. Các yêu cầu đều chờ người thực hiện, chưa được coi là đã hoàn thành.

| Mã | Người phụ trách | Yêu cầu và sản phẩm | Issue |
|---|---|---|---|
| DB-01 | Nguyễn Xuân Đăng | Migration, PK/FK/index và snapshot trên MySQL 8 | [#11](https://github.com/xuandang0405/dacn/issues/11) |
| DB-02 | Nguyễn Xuân Đăng | Seed đủ vai trò và danh mục, chạy lặp trên MySQL | [#12](https://github.com/xuandang0405/dacn/issues/12) |
| DB-03 | Nguyễn Xuân Đăng | Ảnh quản trị CSDL và số liệu seed để đưa vào báo cáo | [#13](https://github.com/xuandang0405/dacn/issues/13) |
| BE-01 | Phạm Minh Dương | JWT/RBAC, validation và hợp đồng Swagger có minh chứng | [#14](https://github.com/xuandang0405/dacn/issues/14) |
| RT-01 | Phạm Tấn Đạt | Kanban hai vai trò, WebSocket sau COMMIT và reconnect | [#15](https://github.com/xuandang0405/dacn/issues/15) |
| QA-01 | Phạm Tấn Đạt | Test Report gồm luồng đúng, biên và ngoại lệ | [#16](https://github.com/xuandang0405/dacn/issues/16) |
| DEMO-01 | Phạm Tấn Đạt | Kịch bản 3–5 phút và video dự phòng 2–3 phút | [#17](https://github.com/xuandang0405/dacn/issues/17) |
| FE-01 | Trần Đăng Khoa | UI thật, trạng thái API, phân quyền, responsive và VI/EN | [#18](https://github.com/xuandang0405/dacn/issues/18) |
| OPS-01 | Trần Đăng Khoa | Docker khởi động từ mã mới, tự migration/seed và lưu dữ liệu | [#19](https://github.com/xuandang0405/dacn/issues/19) |
| DOC-01 | Trần Đăng Khoa | README đủ kiến trúc, phiên bản, setup và tài khoản demo | [#20](https://github.com/xuandang0405/dacn/issues/20) |
| OPS-02 | Trần Đăng Khoa | Bản MVP trực tuyến với HTTPS, WebSocket và MySQL | [#21](https://github.com/xuandang0405/dacn/issues/21) |
| BE-02 | Phạm Minh Dương, phối hợp Đạt | Tải MySQL 100 đồng thời | [#5](https://github.com/xuandang0405/dacn/issues/5) |
| AI-01 | Phạm Minh Dương | MAPE theo baseline và task Done | [#6](https://github.com/xuandang0405/dacn/issues/6) |
| AI-02 | Phạm Minh Dương, phối hợp Đăng | Chấm chất lượng VI/EN | [#7](https://github.com/xuandang0405/dacn/issues/7) |

## Đối chiếu yêu cầu của thầy

| Thành phần | Nhóm chịu trách nhiệm | Điều kiện nghiệm thu |
|---|---|---|
| Hành chính và phân công | #8, cả nhóm | Thành viên/MSSV/Lead và tỷ lệ tổng 100% do nhóm xác nhận |
| CSDL thực tế | #1, DB-01 đến DB-03 | MySQL migration, seed, ràng buộc/snapshot, ảnh quản trị |
| Backend và API | #2, BE-01, #5 đến #7 | JWT/RBAC, contract, JSON thật và lỗi nghiệp vụ |
| UI và một luồng E2E | #4 FE-01, #3 RT-01 | Hai vai trò, UI thật, DB và WebSocket |
| Test Report | #3 QA-01, #5 | Happy/boundary/exception, Pass/Fail và bằng chứng tái lập |
| Freeze và bug log | #8 | Lỗi, người sửa, mốc và retest; freeze sau demo |
| README và container | #4 DOC-01, OPS-01 | Kiến trúc/phiên bản/setup/demo accounts; Compose tự migration/seed |
| Cloud và video | #4 OPS-02, #3 DEMO-01 | URL HTTPS, demo 3–5 phút và video dự phòng 2–3 phút |

## Cách nộp từng yêu cầu

1. Nhận issue con của mình; kiểm tra điều kiện nghiệm thu và nhánh/module liên quan.
2. Tự sửa và push code, mở PR với `Refs #<issue>` và base `integration/mvp` trong giai đoạn nhập mã nền.
3. Ghi commit, môi trường, lệnh chạy, kết quả và ảnh/log phù hợp trong PR; lưu tệp ở `docs/evidence/<mã-yêu-cầu>/` nếu cần.
4. Có người khác review, CI đạt và xử lý hội thoại rồi mới merge/đóng issue. Một PR nên chốt một yêu cầu.
5. Kết quả cũ giữ thời điểm cũ. Phần chưa có bằng chứng phải giữ trạng thái chưa nghiệm thu.

## Quyền và review

Đăng (`xuandang0405`) và Dương (`Pham-Minh-Duong`) đã có quyền ghi. Đạt/Khoa được chủ repository thêm sau; có thể gửi PR từ fork trong thời gian chờ. Đăng review thay đổi của Dương; Dương review phần CSDL/cấu hình của Đăng. Các Lead phối hợp review khi đủ quyền.

Xem [hướng dẫn push/PR](../../CONTRIBUTING.md). `main` và `develop` được bảo vệ; PR #10 đang chờ review bản nền. Không tạo lịch sử làm việc thay cho thành viên.
