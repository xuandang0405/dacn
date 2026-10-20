# Tái lập kết quả kiểm thử

Ngày chốt: 13/10/2026. Cơ sở dữ liệu đã chạy: MariaDB 10.4.32/InnoDB, REPEATABLE READ, một API worker. MySQL 8 là stack đích chưa được nghiệm thu.

## Chuẩn bị

- Python 3.12 trở lên; cài `backend/requirements.txt` trong môi trường ảo.
- MariaDB/InnoDB hoặc MySQL 8 đang chạy. Người chạy tự cung cấp tài khoản có quyền tạo database kiểm thử.
- Tạo `backend/.env` với DATABASE_URL và JWT_SECRET ngẫu nhiên từ 32 ký tự. Không cần khóa Gemini cho kiểm thử hồi quy.
- Cổng 8820 trống cho dịch vụ HTTP của bài tải. Frontend không phải điều kiện của runner API.

Từ thư mục `backend`:

```sh
python tests/run_verification.py
```

Runner tạo một database riêng có tên `dacn_verify_<ngày>_<ngẫu nhiên>`, áp dụng Alembic 0001–0005 rồi chạy pytest. Không lấy dữ liệu của người dùng làm dữ liệu tải. Một test seed dùng SQLite tạm thời; fixture API dùng InnoDB thật. Các nhánh lỗi Gemini dùng MockTransport.

## Kịch bản và dữ liệu

- 75 test: 13 chức năng/API, 11 sửa lỗi kiến trúc, 33 validation/null và 18 ngoại lệ AI/tài liệu.
- Kiểm tra task/cột độc lập không bị khóa chặn nhau; hai request cùng version chỉ một request thành công.
- Di chuyển ngược chiều có giới hạn thời gian; thứ tự thẻ liên tục, không trùng.
- Trigger không cho sửa snapshot trực tiếp; hai WebSocket nhận cùng sự kiện sau COMMIT.
- 100 tài khoản và 100 task tổng hợp. Mỗi loại thao tác chạy 5 lượt, mỗi lượt đồng thời 100 yêu cầu. 500 GET + 500 PATCH; PATCH dùng các task độc lập.
- Thời gian đo tính từ trước request đến sau phản hồi, gồm thời gian xếp hàng; đọc version trước mỗi lượt PATCH không nằm trong từng mẫu độ trễ.

## Tệp đầu ra

| Tệp | Nội dung |
|---|---|
| integration-tests.xml | Kết quả từng test theo JUnit |
| verification-summary.json | Thời điểm chạy, số test, lỗi và phương pháp |
| innodb_evidence.json | Kịch bản đồng thời, status HTTP, p50/p95/max và bài tải |
| ai-evaluation.json | Trạng thái và kết quả thí nghiệm AI riêng |

Tệp kết quả không chứa mật khẩu hay access token. Database kiểm thử được giữ để đối chiếu; tên được ghi tại `backend/.integration/database.txt`, chỉ tồn tại trên máy chạy. Có thể xóa database này sau khi đối chiếu, bằng công cụ quản trị SQL. Runner không tự xóa database.

`python -m pytest -q` dùng SQLite để chạy nhanh nếu không đặt TEST_DATABASE_URL. Kết quả đó không kiểm tra khóa InnoDB. Để chạy lại riêng trên database kiểm thử đã chuẩn bị, TEST_DATABASE_URL phải trỏ tới database có `_verify_` trong tên.

Số đo thay đổi theo máy, tải nền và phiên bản database. Bài thử ngắn không chứng minh uptime, RTO/RPO, hiệu năng nhiều worker hoặc chất lượng mô hình AI.
