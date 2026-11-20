# Kiểm tra gói triển khai Windows/Docker

## Cập nhật source ngày 18/11/2026

Source hiện có migration 0006, key chống tạo task trùng, version việc con, giờ/tuần và các sửa lỗi giao việc/thống kê. 134 ca backend trên MySQL đạt, gồm một lượt chạy trong image backend Python 3.12 với source hiện tại mount vào /code. Frontend production build và kiểm thử browser API/MySQL local đạt; Gemini thật qua API local đã lập kế hoạch và lưu 4 task. Đã thử nâng DB có dữ liệu 0005 lên 0006. Không kiểm tra server bên ngoài, HTTPS công khai hoặc build/chạy lại toàn bộ gói Compose trong đợt 18/11. Chi tiết ở docs/SUA_LOI_ON_DINH_20261118.md trong repository.

## Kiểm tra toàn bộ gói trước đây ngày 06/11

Ngày kiểm tra: 06/11/2026. Kiểm tra trên máy Windows bằng Windows PowerShell 5.1, Docker Desktop Linux/x86_64 và Docker Compose 5.6.0. Đây là kiểm tra gói trên môi trường cục bộ riêng; chưa đăng nhập hoặc triển khai lên server đích.

## Kết quả

| Hạng mục | Kết quả thực tế |
|---|---|
| Khởi tạo cấu hình bằng PowerShell 5.1 | Đạt; sinh secret riêng, giữ nguyên khi chạy lại |
| Build image từ source được chọn để đóng gói | Đạt; Python 3.12.15, Node 22.23.4, MySQL 8.4.11 và Nginx stable-alpine |
| MySQL volume mới, chưa có user trước kiểm tra | Đạt; migration lên 0005, không tự seed khi SEED_DEMO=false |
| HTTP website/health/Swagger/ReDoc/OpenAPI qua gateway | Cả năm đường dẫn trả 200 |
| API qua proxy, refresh cookie và kiểm tra Origin | 15 kiểm tra HTTP đạt; Origin sai bị từ chối 403 |
| Upload UTF-8 vào kho tài liệu riêng | Đạt; metadata trong MySQL, file trong volume |
| Browser hai phiên, giao task và realtime | Bài assignment.spec.ts đạt, gồm sáu bước; có đổi người nhận, mất quyền, draft/xung đột, mất mạng, VI/EN và mobile |
| URL public không phải localhost | Browser chạy qua stm-server.test:18180 với ánh xạ DNS thử nghiệm; frontend gọi API và WebSocket cùng origin |
| Thay PUBLIC_URL và nạp lại cấu hình | Đạt; đổi từ IP loopback sang hostname thử nghiệm mà không sửa source hoặc URL API trong frontend |
| Dừng toàn bộ bằng stop-server.bat rồi chạy start-server.bat | Đạt; giữ được tài khoản, task và tài liệu đã tạo |
| Sao lưu bằng hướng dẫn PowerShell | Xuất SQL và copy file đạt; kiểm tra SQL chứa bảng, trigger và chữ Việt UTF-8. Chưa thử phục hồi một DB mới |
| Cổng công bố | Chỉ gateway; MySQL/API/frontend không bind cổng host riêng |
| Kiểm tra Nginx | nginx -t đạt |

Các dữ liệu thử đều là dữ liệu tổng hợp. Không lấy database hoặc tài liệu cá nhân đang dùng để kiểm tra, và không đóng database thử nghiệm vào ZIP.

## Cách tạo lại

- Giải nén source, chạy Setup và start-server.bat theo README_DEPLOY.md.
- Kiểm tra /health, /docs và đăng ký hai tài khoản để thử phân quyền, giao việc, cập nhật realtime.
- Có thể chạy frontend/tests/e2e/assignment.spec.ts trên máy kiểm thử đã có Node/Playwright; đặt E2E_UI_URL và E2E_API_URL cùng origin public, dùng tên miền/IP truy cập thật.
- Dừng/chạy lại để đối chiếu dữ liệu đã tạo; không dùng down -v.

## Giới hạn

- Chưa kiểm tra trên Windows Server đích vì chưa có thông tin engine/phiên bản máy đó. Docker Engine phải chạy Linux containers; không phải chỉ cài Docker là mọi engine Windows đều chạy được các image này.
- Không kiểm tra public DNS, Windows Firewall, cổng của nhà cung cấp, IIS/TLS hoặc HTTPS Internet của server đích.
- Không gọi Gemini thật trong đợt đóng gói và không kèm khóa API. API AI báo chưa cấu hình như dự kiến khi GEMINI_API_KEY trống. Chủ server tự điền khóa hợp lệ và có quota.
- Không gửi SMTP Internet; phần email cần cấu hình riêng trên server.
- Không chạy lại bài tải/soak hoặc đo RTO/RPO trong đợt này. Không coi kết quả khởi động container là bằng chứng SLA hoặc đã kiểm tra phục hồi backup.
- Thư mục source có bộ kiểm thử backend hiện có; lần hồi quy trước đạt 113 ca trên MySQL, không chạy lại toàn bộ bộ đó chỉ để đóng ZIP.

ZIP có MANIFEST.json ghi SHA-256 từng file source và tệp .zip.sha256 nằm cạnh gói. Script đóng gói kiểm tra CRC ZIP, chặn tệp môi trường riêng/runtime và so khớp bí mật cấu hình cục bộ trước khi tạo gói.
