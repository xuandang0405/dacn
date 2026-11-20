# Triển khai Smart Task Manager trên máy Windows có Docker

Gói source gồm bản giao diện/logo/slogan mới, trợ lý Gemini lập kế hoạch và phân công, FastAPI, Next.js, migration MySQL, scheduler và cấu hình triển khai. Không kèm database đang dùng, tài liệu người dùng, khóa Gemini, mật khẩu hoặc lịch sử Git của máy phát triển.

## 1. Kiểm tra Docker trên server

Mở PowerShell và chạy:

```powershell
docker info --format '{{.OSType}}'
docker compose version
```

- Kết quả OSType phải là **linux**. Image Python, Node, Nginx và MySQL trong gói là image Linux.
- Windows 10/11 có Docker Desktop: chọn Linux containers, bật engine trước khi chạy.
- Nếu máy là Windows Server 2019/2022/2025 và Docker chỉ hỗ trợ Windows containers, gói này cần Docker Engine trong máy ảo Linux hoặc môi trường Linux phù hợp. Có thể dùng Docker CLI/context từ Windows trỏ tới engine Linux. Không cài Docker Desktop lên Windows Server như một cấu hình được nhà cung cấp hỗ trợ; [Docker nêu rõ giới hạn này](https://docs.docker.com/desktop/setup/install/windows-install/).
- Cần Docker Compose v2 trở lên và Internet để tải image, dependency trong lần build đầu. Không cần cài Python, Node.js hay MySQL trực tiếp lên Windows.
- Dự trù khoảng 4 GB RAM và 15 GB trống để bắt đầu thử nghiệm; đây là ước tính vận hành, không phải cấu hình đã benchmark cho tải sản xuất.

Các file cấu hình gateway được COPY vào image, không bind mount đường dẫn Windows. Dữ liệu dùng named volume của engine đang chọn. Giữ đúng Docker context trong suốt quá trình chạy, sao lưu và nâng cấp.

## 2. Giải nén và khởi tạo

Giải nén cả thư mục Smart_Task_Manager_Server, ví dụ vào `D:\Apps\Smart_Task_Manager_Server`. Không chạy file .bat ngay bên trong trình xem ZIP.

Mở PowerShell tại thư mục đó. Ví dụ IP server là 192.168.1.50, cổng 8080:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy_server.ps1 -Action Setup -PublicUrl http://192.168.1.50:8080
```

Script tạo `.env.server` trên chính server, tự sinh mật khẩu MySQL, JWT secret và mật khẩu dữ liệu demo. Chạy lại Setup giữ nguyên cấu hình đã có. Không chép `.env` cũ từ máy phát triển đè lên file này.

Mở `.env.server` bằng trình soạn thảo:

- PUBLIC_URL phải trùng chính xác địa chỉ người dùng mở trên trình duyệt, gồm http/https và cổng; không thêm đường dẫn hoặc dấu `/` cuối.
- Với truy cập HTTP trực tiếp, HTTP_PORT phải trùng cổng trong PUBLIC_URL. Setup tự lấy cổng từ URL nếu không truyền -HttpPort.
- Điền GEMINI_API_KEY riêng trên server nếu dùng AI; GEMINI_MODEL mặc định gemini-3.1-flash-lite. Không có khóa vẫn chạy được các chức năng khác; AI sẽ báo chưa cấu hình.
- Điền các biến SMTP nếu dùng chức năng gửi email khôi phục mật khẩu. SMTP_HOST trống thì chức năng gửi email chưa hoạt động.
- SEED_DEMO mặc định false để không công khai tài khoản demo trên server. Mặc định dữ liệu mới được tạo bằng đăng ký tài khoản và tạo workspace.
- Nếu cần dữ liệu tổng hợp để demo, đặt SEED_DEMO=true trước khi khởi động. Tài khoản mẫu: owner@demo.example.com, admin@demo.example.com, lan@demo.example.com; mật khẩu là DEMO_PASSWORD được sinh riêng trong `.env.server`. Seed không ghi đè tài khoản hoặc dữ liệu đã tồn tại.

File `.env.server` chứa bí mật của server; giữ riêng khi chia sẻ source hoặc sao lưu ra nơi khác. Các mật khẩu DB được sinh bằng ký tự hex, phù hợp DATABASE_URL; tránh tự thay bằng chuỗi có ký tự đặc biệt chưa URL-encode.

## 3. Chạy website

```powershell
.\start-server.bat
```

Hoặc bấm đúp start-server.bat. Nếu chưa Setup, script hỏi địa chỉ website rồi tự tạo cấu hình. Lần đầu có thể mất vài phút để tải image và build.

Quy trình tự động:

- Khởi động MySQL, kiểm tra kết nối thật.
- Chạy Alembic migration 0001–0006; seed chỉ khi SEED_DEMO=true.
- Chạy một backend worker, scheduler và frontend production.
- Khởi động Nginx gateway sau khi các dịch vụ đã khỏe.

Truy cập:

- Website: `http://192.168.1.50:8080`
- Kiểm tra DB/API: `http://192.168.1.50:8080/health`
- Swagger: `http://192.168.1.50:8080/docs`

Website, REST API và hai WebSocket dùng cùng địa chỉ. Trình duyệt không gọi localhost:8000 của máy người xem. Chỉ gateway được mở ra host; MySQL, backend và frontend không công bố cổng riêng.

Nếu máy khác chưa truy cập được, kiểm tra Windows Firewall và firewall/NAT của nhà cung cấp server. Ví dụ mở cổng đã chọn, chạy PowerShell quản trị trên server:

```powershell
New-NetFirewallRule -DisplayName 'Smart Task Manager HTTP' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

Thay 8080 theo cấu hình. Nếu truy cập qua Internet, đặt HTTPS ở reverse proxy/IIS hoặc hệ thống TLS đang có, như mục tiếp theo.

## 4. Domain và HTTPS

Gateway trong gói nhận HTTP ở cổng HTTP_PORT. Gói không tự cấp chứng chỉ hoặc thay cấu hình IIS của server.

Nếu đã có reverse proxy kết thúc TLS:

- Proxy `https://tasks.example.com` đến `http://127.0.0.1:8080` trên host chạy gateway; bật chuyển tiếp WebSocket.
- Đặt PUBLIC_URL=https://tasks.example.com và PUBLIC_SCHEME=https trong `.env.server`. Nếu proxy cùng host, có thể đặt HTTP_BIND=127.0.0.1 để cổng nội bộ không mở ra ngoài.
- Giữ nguyên Host và Origin của trình duyệt khi chuyển tiếp. Refresh cookie dùng Secure khi PUBLIC_URL bắt đầu bằng https.
- Chạy lại start-server.bat để áp dụng cấu hình. Frontend dùng đường dẫn cùng origin nên không cần nhập IP vào source hoặc build URL API riêng.

Backend kiểm tra Origin chính xác; chọn một địa chỉ truy cập chính. Mở bằng cả IP và domain khác nhau sẽ không cùng hợp lệ cho refresh/WebSocket. Khi có nhiều proxy phía trước, cần cấu hình IP client tin cậy theo topology thực tế; mặc định gateway loại bỏ X-Forwarded-For do client tự gửi để không cho giả mạo IP. Rate limiter có thể coi những người dùng đi qua cùng proxy ngoài là chung một IP nếu chưa thiết lập phần này.

Tham chiếu: [Nginx WebSocket proxying](https://nginx.org/en/docs/http/websocket.html).

## 5. Dừng, xem trạng thái và lỗi

```powershell
.\stop-server.bat
.\logs-server.bat
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy_server.ps1 -Action Status
```

stop-server.bat giữ dữ liệu. Không dùng `down -v`, không xóa volume mysql_data/project_documents nếu cần giữ DB và tài liệu.

- Cổng bị chiếm: đổi PUBLIC_URL và HTTP_PORT thống nhất, kiểm tra firewall rồi chạy lại.
- AI lỗi quota/model/key: kiểm tra cấu hình tài khoản nhà cung cấp; không giải quyết bằng cách gửi liên tục. Model phải hỗ trợ generateContent.
- Sau khi đổi `.env.server`, chạy lại start-server.bat. Chỉ restart container không nạp biến môi trường mới.
- Upload bị từ chối: backend vẫn giữ tối đa 3 tệp/dự án, 8 MB/tệp; gateway cho phép phần multipart lớn hơn một chút.
- Không nhận realtime: kiểm tra PUBLIC_URL, Origin và hỗ trợ WebSocket của proxy ngoài. Không tăng số backend worker hoặc scale backend: Hub hiện ở RAM, chưa có Redis/broker.
- Docker tự khởi động container bằng restart=unless-stopped khi engine chạy lại. Cần cấu hình engine/máy ảo Linux khởi động cùng Windows nếu yêu cầu tự phục hồi sau reboot.

## 6. Nâng cấp và giữ dữ liệu

- Giữ `.env.server`, COMPOSE_PROJECT_NAME, Docker context và hai volume hiện tại.
- Sao lưu trước khi nâng cấp. Dừng người dùng ghi dữ liệu khi cần một bản sao DB/tài liệu nhất quán.
- Thay source mới, không chép file cấu hình ví dụ đè lên `.env.server`.
- Chạy start-server.bat để build lại và chạy migration. Không tạo database bằng schema.sql trên database đã có dữ liệu.

Gói source không chứa dữ liệu trên máy phát triển. Nếu muốn chuyển dữ liệu hiện tại sang server, cần một lần export/import DB và kho tài liệu riêng; không chỉ copy file code.

Ví dụ lệnh bảo trì tại thư mục gói, sau khi đã nạp `.env.server`:

```powershell
$dc = @('compose', '--env-file', '.env.server', '-f', 'server/compose.yml')
docker @dc ps -a
docker @dc stop gateway backend scheduler
docker @dc exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysqldump --no-tablespaces --single-transaction --triggers -u "$MYSQL_USER" "$MYSQL_DATABASE" > /tmp/stm-backup.sql'
docker @dc cp mysql:/tmp/stm-backup.sql .\stm-backup.sql
docker @dc cp backend:/data/project_documents .\project-documents-backup
docker @dc up -d --wait
```

Kiểm tra từng lệnh thành công. Không dùng chuyển hướng PowerShell `>` trực tiếp để ghi stdout SQL từ Docker, vì Windows PowerShell 5.1 có thể đổi encoding. Câu lệnh trên tạo SQL trong container rồi copy ra, không in mật khẩu. Bản sao trên đĩa host cần được giữ riêng an toàn; hãy kiểm tra khôi phục trên database thử nghiệm trước khi dựa vào quy trình sao lưu này.

## 7. Những gì đã xác minh

Xem [VERIFICATION.md](VERIFICATION.md) trong gói để biết môi trường và phạm vi thực sự đã chạy. Không coi các dịch vụ ngoài như Gemini, SMTP hoặc TLS/domain server đích là đã kiểm thử chỉ vì container khởi động thành công.
