# Nhận code website ngày 04/11/2026

Bản tổng chứa đủ ứng dụng và kiểm thử. Bốn gói riêng chứa CODE_CUA_BAN theo phân công, danh sách tệp, bản diff so với mã nền và lệnh kiểm tra. Các phân hệ dùng chung database, API client và cấu hình; chạy toàn website bằng bản tổng, không chạy một thư mục CODE_CUA_BAN như ứng dụng riêng.

| Người | Phạm vi cần đọc và kiểm tra | Issue | Smoke Docker |
|---|---|---|---|
| Đăng | Auth/workspace/invitation; AuthScreen/App/Settings; DB, cấu hình, CI và Docker chung | #14, #19, #20 | auth-checks |
| Dương | AI/documents/storage/Gemini; AIAssistant và draft; upload/quyền/provider | #23, #24, #7 | ai-checks |
| Đạt | Project/task/transaction/collaboration; Board/MyTasks/Notifications; realtime và tải | #15, #25, #5 | task-checks |
| Khoa | Skills/workload/analytics; Skills/Overview; baseline và mẫu thống kê | #18, #26, #6 | insights-checks |

Danh sách tệp trong từng gói xác định người phụ trách chính. Tệp dùng chung do Đăng tích hợp sau khi các thành viên đối chiếu. Không chép đè .env hoặc chép cả gói ZIP vào repository.

## Việc làm ngay

1. Đăng gửi mỗi người đúng gói ZIP, cấp Write cho Đạt/Khoa; người nhận chấp nhận lời mời.
2. Mỗi người đọc DOC_TRUOC.txt rồi bấm 1_CHUAN_BI.bat. Công cụ tạo bản clone mới trong DU_AN_LAM_VIEC, không sửa bản clone cũ. Nhập tên/email GitHub của chính mình.
3. Chạy Docker, thử các chức năng trong phần được giao, đối chiếu TEST_REPORT.md và bản diff. Nếu có lỗi mới, sửa trong DU_AN_LAM_VIEC và kiểm thử lại.
4. Bấm 2_PUSH_CODE.bat để chọn những tệp thực sự thay đổi của mình, xem diff, nhập thông điệp và xác nhận push. Nếu đổi tệp chung, thống nhất với Đăng trước. Tệp mới phải bổ sung DANH_SACH_TEP.txt.
5. Bản đã kiểm thử của đợt sửa được review tập trung tại [PR #27](https://github.com/xuandang0405/dacn/pull/27). Ghi nhận kiểm tra của từng người ở issue; Dương review PR. Sau merge, các bản sửa mới mở PR vào integration/mvp.

Các commit sửa lỗi đã có trong lịch sử và giữ tác giả ban đầu. Không tạo commit rỗng hoặc đổi tác giả để tăng số lượng. Nếu không sửa thêm gì, công cụ báo không có thay đổi mới là đúng: dùng kết quả kiểm tra/review để xác nhận phần đã nhận, không nhập lại cùng một bản phát hành bốn lần.

## Lấy code thủ công

Ví dụ Dương, khi PR tổng còn chờ review:

```sh
git clone --branch fix/finalize-web-20261104 https://github.com/xuandang0405/dacn.git dacn-duong-final
cd dacn-duong-final
git switch -c review/final-duong-20261104
git config user.name "Họ tên của chính bạn"
git config user.email "Email GitHub đã xác minh của chính bạn"
python scripts/setup_demo_env.py
docker compose -p dacn -f docker-compose.yml -f docker/compose.mail.yml up -d --build --wait
docker compose -p dacn -f docker-compose.yml -f docker/compose.mail.yml -f docker/compose.ai-checks.yml run --rm --no-deps -T ai-checks
```

Khi có sửa mới đã kiểm thử:

```sh
git status
git add backend/app/api/ai.py frontend/src/components/AIAssistant.tsx
git diff --cached
git commit -m "fix(ai): mô tả lỗi đã sửa; refs #23"
git push -u origin review/final-duong-20261104
```

Tên nhánh tương ứng: review/final-dang-20261104, review/final-duong-20261104, review/final-dat-20261104, review/final-khoa-20261104. Mỗi tên là nhánh mới để không đụng bản làm việc cũ. Khi PR #27 đã merge, tạo nhánh sửa mới từ origin/integration/mvp.

## Chia commit theo thay đổi thật

Các nhóm sửa đã được chia thành commit riêng trong PR tổng: analytics/baseline, validation lời mời, skill 0, thứ tự ưu tiên, refresh/session, kết nối pool, recovery/CORS, realtime/cleanup, AI/draft, quyền và draft UI, i18n/thông báo, dependency/Docker, smoke, E2E/CI và bằng chứng. Có thể xem bằng `git log --oneline origin/integration/mvp..HEAD` hoặc `git log --oneline -- đường/dẫn/tệp`.

Khi sửa tiếp, mỗi commit nên giải quyết một lỗi hoặc thay đổi nghiệp vụ cùng kiểm tra của nó. Không tách mỗi dòng/thay tên/định dạng thành commit để tăng số lượng. Không sửa thêm chức năng ngoài bản đồ án đã chốt.
