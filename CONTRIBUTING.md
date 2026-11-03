# Hướng dẫn làm việc nhóm

## Nhánh và trách nhiệm

| Thành viên | Phần việc | Nhánh nhận việc | Issue |
|---|---|---|---|
| Nguyễn Xuân Đăng | CSDL, migration, seed | `feature/database-seed` | [#1](https://github.com/xuandang0405/dacn/issues/1) |
| Phạm Minh Dương | Backend, phân quyền, AI | `feature/backend-ai` | [#2](https://github.com/xuandang0405/dacn/issues/2) |
| Phạm Tấn Đạt | Realtime, kiểm thử | `feature/realtime-tests` | [#3](https://github.com/xuandang0405/dacn/issues/3) |
| Trần Đăng Khoa | Frontend, ghép API, bàn giao | `feature/frontend-integration` | [#4](https://github.com/xuandang0405/dacn/issues/4) |

Mỗi người nhận việc trong issue, đọc điều kiện nghiệm thu, thực hiện thay đổi và tự push bằng tài khoản của mình. Tên trong bảng là phân công; thành viên cần quyền Write trong repository trước khi push. Dương cần chấp nhận lời mời; Đạt và Khoa được chủ repository bổ sung sau.

Trong lúc chưa có quyền Write, có thể fork repository, push nhánh vào fork của mình rồi mở PR về `xuandang0405/dacn` với base `integration/mvp`.

## Nhánh tích hợp hiện tại

`integration/mvp` chứa mã nền và cấu hình làm việc. Trong đợt khởi tạo này, chọn **base `integration/mvp`** khi mở PR của thành viên. Nhờ đó PR chỉ hiện phần sửa của người thực hiện, không lặp lại toàn bộ mã nền.

`main` là nhánh bàn giao, `develop` là nhánh tích hợp chính thức. Cả hai đang chờ PR nhập mã nền được review. Khi hoàn tất bước này, nhóm chuyển PR chức năng sang `develop` và cập nhật hướng dẫn. Không push trực tiếp vào ba nhánh được bảo vệ.

## Lấy mã và chọn nhánh

Ví dụ cho Dương; các thành viên thay bằng nhánh trong bảng trên:

```sh
git clone https://github.com/xuandang0405/dacn.git
cd dacn
git config user.name "Họ tên của bạn"
git config user.email "Email GitHub đã xác minh của bạn"
git fetch origin
git switch --track origin/feature/backend-ai
```

Nếu đã có nhánh ở máy, dùng `git switch feature/backend-ai` rồi `git pull --ff-only`. Khi cần lấy thay đổi chung, chạy `git fetch origin` và `git merge origin/integration/mvp`; xử lý xung đột trước khi push. Không dùng tài khoản, email hoặc commit của người khác để ghi nhận phần việc của mình.

## Push phần việc

```sh
git status
# Chỉ chọn các tệp thuộc phần việc đã kiểm tra.
git add path/to/changed-file
git diff --cached
git commit -m "fix: mo ta thay doi; refs #2"
git push -u origin feature/backend-ai
```

Không dùng `git add .` khi chưa rà soát tệp cấu hình và dữ liệu. Không commit `.env`, khóa dịch vụ, token, database, tài liệu người dùng, `.venv`, `node_modules` hoặc thư mục build. Không force push lên nhánh chung.

## Mở Pull Request

1. Chọn base `integration/mvp`, compare là nhánh phần việc của mình.
2. Điền issue, phần đã sửa và cách kiểm tra theo PR template. Nếu chưa chạy được kiểm thử, ghi rõ lý do và phần chưa kiểm tra.
3. Kèm kết quả phù hợp: JSON/mã HTTP cho API, ảnh trước/sau cho UI, log migration cho CSDL, log hai client cho realtime. Che thông tin bí mật.
4. Yêu cầu một thành viên khác có quyền Write review. Người tạo PR không tự duyệt PR của mình.
5. Sửa yêu cầu review và chờ cả `Backend MySQL 8` lẫn `Frontend build` đạt trước khi merge. Push bổ sung có thể làm mất approval cũ.
6. Sau khi merge, kiểm tra lại tiêu chí issue rồi mới đánh dấu hoàn tất/đóng issue. Trong giai đoạn chuyển nhánh, không dựa vào từ khóa tự đóng issue.

## Kiểm tra theo phần việc

| Phần thay đổi | Kiểm tra tối thiểu |
|---|---|
| Backend | Test luồng đúng, đầu vào sai, quyền truy cập và trường hợp xung đột liên quan |
| CSDL | Migration trên MySQL mới; FK/ràng buộc; seed lặp; không làm mất dữ liệu hiện có |
| Frontend | Build, trạng thái tải/thành công/lỗi, VI/EN, màn hình nhỏ và quyền hiển thị |
| Realtime | Hai phiên độc lập; sự kiện sau ghi DB thành công; reload vẫn đúng dữ liệu |
| Docker | Chạy từ mã/cấu hình mẫu; migration và seed tự chạy; khởi động lại giữ dữ liệu |

Lệnh chạy dự án và kiểm thử được ghi trong README. Kết quả kiểm thử cũ chỉ là tham khảo; PR mới cần ghi các kiểm tra đã thực hiện cho chính thay đổi đó.

## Điều kiện hoàn tất một phần việc

- Có thay đổi giải quyết yêu cầu trong issue và nằm đúng phạm vi.
- Có commit, push và PR do người thực hiện tạo.
- Có kết quả kiểm tra có thể chạy lại; các giới hạn còn lại được nêu rõ.
- Có review của người khác, CI đạt và hội thoại review đã xử lý.
- Đã cập nhật API/tài liệu khi hành vi thay đổi.

Mốc chuẩn bị demo là 05/11/2026, demo 06/11/2026 theo lịch môn học. Sau demo chỉ sửa lỗi, kiểm thử và hoàn thiện bàn giao trong phạm vi đã thống nhất. Nhóm điều chỉnh mốc từng issue nếu cần, ghi rõ người nhận và lý do.
