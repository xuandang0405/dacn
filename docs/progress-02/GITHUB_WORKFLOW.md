# Phân công GitHub giai đoạn lập trình

Repository: https://github.com/xuandang0405/dacn

| Thành viên | Tỷ lệ nhóm xác nhận | Trách nhiệm | Nhánh công việc |
|---|---:|---|---|
| Nguyễn Xuân Đăng | 30% | Lead CSDL, migration, seed, hợp đồng dữ liệu | feature/database-seed |
| Phạm Minh Dương | 30% | Lead Backend và AI, JWT/RBAC, giao dịch task | feature/backend-ai |
| Phạm Tấn Đạt | 20% | Lead Realtime và kiểm thử, demo hai vai trò | feature/realtime-tests |
| Trần Đăng Khoa | 20% | Lead Frontend, ghép API, Docker và tài liệu bàn giao | feature/frontend-integration |

Tỷ lệ trên do nhóm xác nhận cho giai đoạn lập trình. Không suy ra tỷ lệ từ số dòng hoặc số commit. Bản nhập mã tự động chỉ là mốc ban đầu; không được dùng để thay cho lịch sử làm việc của từng thành viên.

## Nhánh và Pull Request

- `main`: bản đủ điều kiện bàn giao, nhận thay đổi qua Pull Request từ `develop`.
- `develop`: tích hợp các nhánh chức năng, chạy CI trước khi merge.
- `feature/*`: mỗi nhánh giải quyết một issue, do người nhận việc thực hiện và commit bằng tài khoản của mình.
- `codex/progress-02`: thay đổi hỗ trợ Docker, kiểm thử và báo cáo trong phiên rà soát này; tác giả tự động được ghi rõ.

```sh
git clone https://github.com/xuandang0405/dacn.git
cd dacn
git fetch origin
git switch develop
git pull --ff-only
git switch -c feature/my-task
# Sửa đúng phần việc, chạy kiểm thử, rồi chỉ stage những tệp đã kiểm tra.
git add path/to/changed-file
git commit -m "fix: describe the change"
git push -u origin feature/my-task
```

Mỗi thành viên tự cấu hình `user.name` và `user.email` theo tài khoản của mình. Không dùng email của người khác để tạo lịch sử đóng góp. Khi mở PR, chọn base `develop`, liên kết issue và yêu cầu một thành viên khác review. Không đẩy trực tiếp tính năng lên `main`.

## Điều kiện trước khi bàn giao

- Đã bật bảo vệ `main` và `develop`: bắt buộc Pull Request, một approval và các kiểm tra Backend MySQL 8/Frontend build; không force push hoặc xóa nhánh được bảo vệ. Quy tắc cũng áp dụng cho quản trị viên.
- Thành viên được mời phải chấp nhận lời mời trước khi được gán assignee hoặc làm code owner hợp lệ.
- Đạt và Khoa được chủ repository bổ sung tài khoản sau. Chưa ghi hai người này là đã nhận lời mời.
- Dùng issue để theo dõi lỗi còn mở, tách lỗi cần sửa trước demo và cải tiến sau demo.
- Từ sau buổi demo 06/11/2026, đóng băng tính năng; chỉ sửa lỗi, kiểm thử và hoàn thiện triển khai theo phạm vi đã thống nhất.

## Trạng thái ngày 21/10/2026

- [PR nhập mã #9](https://github.com/xuandang0405/dacn/pull/9) đang mở vào develop, chưa merge. main/develop mới có commit khởi tạo; mã và báo cáo để review nằm trong codex/progress-02.
- Bốn nhánh feature đã tạo từ mốc nhập mã 49b6cd2. Sau khi PR nhập mã được review và merge, đồng bộ develop trước khi phát triển tiếp.
- [Issue #1 Đăng](https://github.com/xuandang0405/dacn/issues/1), [#2 Dương](https://github.com/xuandang0405/dacn/issues/2), [#3 Đạt](https://github.com/xuandang0405/dacn/issues/3), [#4 Khoa](https://github.com/xuandang0405/dacn/issues/4).
- [#5 tải MySQL](https://github.com/xuandang0405/dacn/issues/5), [#6 baseline MAPE](https://github.com/xuandang0405/dacn/issues/6), [#7 đánh giá AI](https://github.com/xuandang0405/dacn/issues/7), [#8 cloud/video/lịch sử](https://github.com/xuandang0405/dacn/issues/8).
- GitHub Actions chưa khởi chạy job do tài khoản bị khóa vì vấn đề thanh toán. Chủ tài khoản cần xử lý rồi chạy lại; chưa có CI Pass. Không bypass kiểm tra hoặc approval để merge PR.
- Dương cần chấp nhận lời mời vào repository. Đạt/Khoa được chủ repository thêm sau theo xác nhận của nhóm. Chưa gán assignee cho tài khoản chưa có quyền ghi.
