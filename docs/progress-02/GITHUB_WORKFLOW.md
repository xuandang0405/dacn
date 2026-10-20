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

- Chủ repository bật bảo vệ `main` và `develop`: bắt buộc Pull Request, một approval và các kiểm tra Backend MySQL 8/Frontend build; không force push hoặc xóa nhánh được bảo vệ.
- Thành viên được mời phải chấp nhận lời mời trước khi được gán assignee hoặc làm code owner hợp lệ.
- Đạt và Khoa được chủ repository bổ sung tài khoản sau. Chưa ghi hai người này là đã nhận lời mời.
- Dùng issue để theo dõi lỗi còn mở, tách lỗi cần sửa trước demo và cải tiến sau demo.
- Từ sau buổi demo 06/11/2026, đóng băng tính năng; chỉ sửa lỗi, kiểm thử và hoàn thiện triển khai theo phạm vi đã thống nhất.
