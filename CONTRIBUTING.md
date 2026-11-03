# Hướng dẫn làm việc nhóm

## Nhánh và trách nhiệm

| Thành viên | Phần việc | Nhánh nhận việc | Issue |
|---|---|---|---|
| Nguyễn Xuân Đăng | Setup chung + API/frontend/Docker Auth/Workspace | `setup/platform` | [#1](https://github.com/xuandang0405/dacn/issues/1) |
| Phạm Minh Dương | API + frontend + Docker cho AI/tài liệu | `feature/ai-documents` | [#2](https://github.com/xuandang0405/dacn/issues/2) |
| Phạm Tấn Đạt | API + frontend + Docker cho Task/Kanban/Realtime | `feature/task-kanban` | [#3](https://github.com/xuandang0405/dacn/issues/3) |
| Trần Đăng Khoa | API + frontend + Docker cho Skills/Workload/Analytics | `feature/skills-analytics` | [#4](https://github.com/xuandang0405/dacn/issues/4) |

Phân công ngày 04/11 chia theo phân hệ. Cả bốn người làm API, giao diện và Docker của phân hệ mình; Đăng làm thêm setup và tích hợp nền chung. [Gói mã nguồn và danh sách tệp](docs/team/PHAN_CHIA_CODE_FULLSTACK.md).

Mỗi người nhận từng yêu cầu con, đọc điều kiện nghiệm thu, thực hiện thay đổi và tự push bằng tài khoản của mình. Đăng và Dương đã có quyền ghi. Đạt và Khoa được chủ repository bổ sung sau.

Danh sách đầu việc và bảng đối chiếu yêu cầu của thầy: [Yêu cầu tiến độ lần 2](docs/team/YEU_CAU_TIEN_DO_02.md). [Issue #8](https://github.com/xuandang0405/dacn/issues/8) tổng hợp hồ sơ; #1–#4 là nhóm việc của từng Lead, bên dưới có yêu cầu riêng để nhận và mở PR.

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
git switch --track origin/feature/ai-documents
```

Nếu đã có nhánh ở máy, dùng `git switch feature/ai-documents` rồi `git pull --ff-only`. Khi cần lấy thay đổi chung, chạy `git fetch origin` và `git merge origin/integration/mvp`; xử lý xung đột trước khi push. Không dùng tài khoản, email hoặc commit của người khác để ghi nhận phần việc của mình.

Mỗi PR nên giải quyết một yêu cầu con. Nếu cần làm nhiều yêu cầu song song, tạo nhánh riêng từ `origin/integration/mvp`, ví dụ `git switch -c feature/so-issue-ten-cong-viec origin/integration/mvp`, rồi push nhánh đó. Không dùng chung một nhánh cho phần việc của hai người.

## Push phần việc

```sh
git status
# Chỉ chọn các tệp thuộc phần việc đã kiểm tra.
git add path/to/changed-file
git diff --cached
git commit -m "fix: mo ta thay doi"
git push -u origin feature/ai-documents
```

Không dùng `git add .` khi chưa rà soát tệp cấu hình và dữ liệu. Không commit `.env`, khóa dịch vụ, token, database, tài liệu người dùng, `.venv`, `node_modules` hoặc thư mục build. Không force push lên nhánh chung.

## Mở Pull Request

1. Chọn base `integration/mvp`, compare là nhánh phần việc của mình.
2. Điền `Refs #<số yêu cầu con>`, phần đã sửa và cách kiểm tra theo PR template. Nếu chưa chạy được kiểm thử, ghi rõ lý do và phần chưa kiểm tra.
3. Kèm kết quả phù hợp: JSON/mã HTTP cho API, ảnh trước/sau cho UI, log migration cho CSDL, log hai client cho realtime. Che thông tin bí mật.
4. Yêu cầu một thành viên khác có quyền Write review. Người tạo PR không tự duyệt PR của mình.
5. Sửa yêu cầu review và chờ cả `Backend MySQL 8` lẫn `Frontend build` đạt trước khi merge. Push bổ sung có thể làm mất approval cũ.
6. Sau khi merge, kiểm tra lại tiêu chí issue rồi mới đánh dấu hoàn tất/đóng issue. Trong giai đoạn chuyển nhánh, không dựa vào từ khóa tự đóng issue.

Review hiện tại: Đăng review phần AI/tài liệu của Dương; Dương review setup của Đăng. Đạt/Khoa yêu cầu một người phù hợp trong hai người này review cho đến khi nhóm có đủ tài khoản. Các tệp model/schema, App/API client và Compose chung do Đăng tích hợp; mỗi bạn đề xuất đúng phần cần đổi và phối hợp trước khi merge. PR #10 nhập mã nền vào develop cần Dương review trước khi hợp nhất.

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
