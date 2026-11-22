# Trợ lý AI: từ câu trả lời đến kế hoạch có người nhận

Ngày cập nhật: 05/11/2026. Phạm vi: FastAPI/MySQL và Next.js đang chạy trong dự án.

## Cách dùng

- Vào Trợ lý AI, chọn dự án và tải tài liệu PDF, DOCX, TXT hoặc MD.
- Bấm Phân tích dự án và hướng dẫn, hoặc hỏi về phần cần thực hiện. Câu hỏi tiếp theo có thể dùng lại tối đa ba lượt trao đổi gần nhất của chính người dùng trong dự án đó.
- Ngay dưới câu trả lời, bấm Lập kế hoạch và phân công từ câu trả lời này. Không phải chép lại câu trả lời vào ô yêu cầu.
- Có thể nhập thêm phạm vi cần ưu tiên ở ô Yêu cầu bổ sung. Bỏ chọn Dùng câu trả lời và trao đổi gần đây nếu muốn lập kế hoạch trực tiếp từ tài liệu và yêu cầu mới.
- Kiểm tra tên việc, mô tả, giờ dự kiến, mức ưu tiên, kỹ năng, việc con và người thực hiện. Danh sách người nhận chỉ gồm người đang có quyền trong dự án.
- Bấm Xác nhận và giao việc. Đến bước này hệ thống mới tạo task, lưu người nhận và gửi thông báo. Người nhận xem việc ở Công việc của tôi hoặc bảng Kanban.

Giao diện và thông báo mới hỗ trợ tiếng Việt/tiếng Anh. Tải lại trang có thể khôi phục câu trả lời gần đây theo ngôn ngữ đang chọn mà không gọi Gemini. Bản sửa chưa xác nhận trên giao diện chưa được lưu thành task.

## Cách đề xuất người nhận

Gemini tạo nội dung công việc và kỹ năng cần thiết. Backend chọn người nhận từ dữ liệu thật sau khi nhận kết quả; không nhờ mô hình tự đoán mã tài khoản.

- Người đủ điều kiện phải có tài khoản hoạt động và là thành viên workspace đang hoạt động; OWNER/ADMIN có quyền dự án, MEMBER cần được thêm vào Project.
- So khớp tên kỹ năng không phân biệt hoa/thường và tính điểm theo mức 1–5 trong ma trận. Prompt ưu tiên tên kỹ năng đã khai báo trong workspace.
- Tính tải từ các việc chưa hoàn thành trong khoảng bảy ngày hiện tại, cộng thêm công việc đã đề xuất trước đó trong cùng bản nháp. Số giờ việc con không bị cộng trùng với việc cha.
- Ưu tiên người có kỹ năng khớp và tải dự kiến không quá 100%. Trong nhóm đủ điều kiện, điểm lựa chọn kết hợp mức khớp kỹ năng và tải dự kiến. Nếu mọi người có kỹ năng phù hợp đều quá tải, vẫn đưa ra đề xuất kèm cảnh báo để người dùng cân nhắc.
- Người có năng lực khai báo bằng 0 không được tự động chọn. Nếu không có ứng viên khả dụng, task để Chưa giao. Người dùng vẫn có thể chọn lại trong danh sách người có quyền.

Đây là gợi ý hỗ trợ quản lý, phụ thuộc chất lượng ma trận kỹ năng và ước lượng giờ. Nhãn Đề xuất ban đầu giúp phân biệt lý do lúc tạo bản nháp với thay đổi do người dùng thực hiện sau đó. Việc đổi người nhận không gọi lại Gemini.

## Giảm lượt gọi và token

- Câu trả lời được lưu trong bảng ai_requests hiện có, cùng phiên bản tài liệu và thông tin sử dụng. Không cần migration mới.
- Khi lập kế hoạch từ câu trả lời hoặc hỏi tiếp, gửi ngữ cảnh gần đây tối đa 12.000 ký tự và trích đoạn tài liệu tối đa 10.000 ký tự nội dung. Trích đoạn được chọn bằng từ khóa; đây chưa phải tìm kiếm ngữ nghĩa bằng embedding.
- Lần phân tích đầu vẫn đọc tài liệu đầy đủ. PDF gốc chỉ được gửi đầy đủ ở nhánh chưa có ngữ cảnh; nhánh tiếp nối trích xuất chữ ở backend. PDF scan có thể không có chữ trích xuất: mô hình phải dựa vào phân tích trước và nêu điều chưa chắc chắn.
- Cache kết quả chính xác trong 24 giờ, tra tối đa 40 yêu cầu gần đây của cùng người dùng và Project. Khóa cache có ngôn ngữ, yêu cầu, ngữ cảnh, model, phiên bản prompt và phiên bản tài liệu; kế hoạch còn xét danh mục kỹ năng.
- Dùng cache không gọi nhà cung cấp, trả provider_calls=0 và total_tokens=0. Phân công được tính lại theo tải hiện tại, không dùng lại người nhận đã lỗi thời.
- Chỉ dẫn ngắn, đầu ra kế hoạch có JSON schema, giới hạn độ dài trả lời và mức suy nghĩ low với dòng Gemini 3. Giới hạn đầu ra là 2.048 token cho hỏi đáp, 8.192 token cho kế hoạch. Nếu bị cắt đầu ra, API báo lỗi và không nhập JSON thiếu thành task.
- UI có mục Mức sử dụng AI để xem số lượt gọi và token do nhà cung cấp trả về. Không quy đổi trực tiếp số token thành chi phí vì còn phụ thuộc model, cơ chế cache của nhà cung cấp và đơn giá.

Tối ưu này thay đổi prompt, cách đưa ngữ cảnh và logic phân công. Không huấn luyện lại hoặc fine-tune mô hình Gemini. Với tài liệu ngắn, ngữ cảnh trao đổi có thể dài hơn phần văn bản tiết kiệm được; không cam kết mọi yêu cầu đều giảm token. Phân tích đầu tiên vẫn tiêu tốn token và cần được tính nếu so tổng chi phí cả phiên.

## Quyền và kiểm soát dữ liệu

- Ngữ cảnh lấy từ kết quả đã lưu ở server, không nhận câu trả lời tự khai báo từ client. Không thể lấy ngữ cảnh của người khác hoặc dự án khác bằng cách đổi context_id.
- Thêm/xóa tài liệu làm thay đổi dấu vân tay nội dung. Kế hoạch và ngữ cảnh cũ bị từ chối khi dùng lại hoặc xác nhận; giao diện yêu cầu phân tích lại.
- Khi chờ Gemini, API giải phóng giao dịch đọc. Sau khi Gemini trả lời, kiểm tra lại phiên, quyền dự án và phiên bản tài liệu trước khi lưu kết quả.
- Trước khi tạo task, xác thực tất cả người nhận. Một người không hợp lệ làm cả lần xác nhận thất bại, tránh tạo một phần kế hoạch. Khóa request và confirmed_at ngăn xác nhận lặp cùng yêu cầu.
- Lưu bản đã duyệt riêng với bản Gemini trả về; giữ cơ chế snapshot giờ ước lượng. Thông báo và sự kiện realtime chỉ phát sau commit.
- Không gửi danh sách tên, email hoặc ID thành viên cho Gemini để tính phân công. Tài liệu dự án vẫn được gửi cho nhà cung cấp khi người dùng yêu cầu AI phân tích.

## API liên quan

| Endpoint | Nội dung thay đổi |
|---|---|
| GET /api/v1/ai/projects/{id}/context?language=vi | Lấy context_id và tối đa ba lượt hỏi/đáp của chính người dùng, cùng phiên bản tài liệu |
| POST /api/v1/ai/projects/{id}/query | Nhận context_id tùy chọn; trả answer, context_id, cached và usage |
| POST /api/v1/ai/decompose-task | Nhận project_id, language, story và/hoặc context_id; có ngữ cảnh thì story được để trống |
| GET /api/v1/ai/projects/{id}/suggest-members | Xếp hạng thành viên đủ điều kiện; không gọi LLM |
| POST /api/v1/ai/requests/{id}/confirm | Nhận bản đã sửa, gồm assignee_id cho từng task; tạo task và thông báo sau duyệt |

Đề xuất kế hoạch trả thêm eligible_members, context_turns và usage. Mỗi task có assignee_id có thể rỗng và assignment_reason. Chỉ dẫn chi tiết và schema yêu cầu xem tại Swagger /docs của backend đang chạy.

## Kiểm tra và cách chạy lại

- 113 kiểm thử backend đạt trên database MySQL/InnoDB thử nghiệm riêng; migration 0001–0005 áp dụng từ đầu. Bài kiểm tra seed dùng SQLite riêng như trước.
- 6 kiểm thử client đạt; lint, TypeScript và production build đạt.
- Hai kịch bản browser nghiệp vụ cũ, gồm 16 bước, đạt với API và CSDL thật. Lượt này chưa đo lại bài tải.
- Bài browser riêng kiểm tra giao diện duyệt, đổi/bỏ người nhận, VI/EN, khôi phục sau reload, lỗi quota và màn hình 390 px đạt. Bài này dùng provider stub; việc ghi task và quyền được kiểm tra độc lập ở backend/MySQL và lượt gọi Gemini thật.
- Bộ test mới bao gồm ngữ cảnh riêng tư, tài liệu thay đổi, cache hết hạn, cập nhật tải khi dùng cache, chọn người hợp lệ, ghi nhận bản đã sửa, rollback khi người nhận sai, xác nhận lặp, thông báo realtime, giới hạn token và nhánh PDF.

Tại gốc repository:

```sh
python scripts/verify_docker.py --project dacn-finalcheck --skip-load --output-dir test-results/ai-planning-20261105/mysql-final
npm --prefix frontend run lint
npm --prefix frontend test
```

Để chạy thí nghiệm Gemini thật, cần khóa và quota hợp lệ trong cấu hình backend. Ví dụ PowerShell, chạy từ thư mục frontend; thay cổng theo môi trường:

```powershell
$env:E2E_UI_URL='http://localhost:3100'
$env:E2E_API_URL='http://localhost:8100'
$env:E2E_OUTPUT_DIR=(Join-Path (Get-Location) '../test-results/ai-planning-20261105/live')
$env:E2E_LIVE_AI='1'
npm.cmd run test:e2e -- ai-planning.spec.ts
```

Runner tạo tài khoản và workspace tổng hợp riêng; dọn workspace thử nghiệm sau khi kết thúc. Không dùng project demo chính để ghi dữ liệu thí nghiệm. Lượt chạy có Gemini phát sinh sử dụng API thật; CI mặc định bỏ qua bài này. File live-ai-evaluation.json chứa phản hồi mẫu và token, không chứa khóa API hoặc token đăng nhập.

Đặt thêm E2E_AI_BASELINE=1 nếu cần hai lượt so sánh với cách gửi tài liệu đầy đủ. Luồng chính cần bốn lượt gọi Gemini; phép đối chứng thêm hai lượt. Các retry tạm thời có thể làm số lần gọi thực tế cao hơn.

## Kết quả Gemini thật và giới hạn

Luồng tiếng Việt đã tạo bản nháp, tự đề xuất người có kỹ năng phù hợp, nhận thay đổi người thực hiện/tên việc từ UI, lưu đúng vào MySQL và tạo thông báo. Nhánh tiếng Anh phân tích và lập kế hoạch theo ngữ cảnh trả HTTP 200. Endpoint cấu hình là gemini-3.5-flash; modelVersion trong phản hồi của lượt đo ghi gemini-3.6-flash, nên số liệu giữ cả tên cấu hình và tên nhà cung cấp báo về.

| Phép so sánh bước lập kế hoạch VI | Input token | Tổng token |
|---|---:|---:|
| Gửi đầy đủ tài liệu và yêu cầu | 6.720 | 7.511 |
| Dùng câu trả lời đã có và trích đoạn | 1.278 | 2.031 |
| Mức giảm trong phép thử | 80,98% | 72,96% |

Phân tích đầu tiên của lượt đo dùng 7.921 token tổng; không tính lượt đó vào mức giảm của riêng bước lập kế hoạch. Vì vậy không suy ra rằng phân tích rồi lập kế hoạch luôn rẻ hơn chỉ lập kế hoạch trực tiếp. Tài liệu thử là một brief tổng hợp có 180 ghi chú phụ lục; đây là một cặp phép thử, chưa phải benchmark đại diện hay điểm chất lượng tổng quát. Yêu cầu lặp đã trúng cache trả 0 lượt gọi và 0 token mới.

Lượt đối chứng tiếng Anh gặp provider 503 sau retry giới hạn. Lần chạy tiếp bị daily quota; đã dừng gọi thêm. Bộ live đầy đủ chưa đạt, và chưa công bố mức giảm token/điểm chất lượng EN. Phần khôi phục VI/EN, giao diện mobile và xử lý lỗi được xác minh riêng bằng provider stub và kiểm thử backend. Xem [số liệu portable](testing/ai-planning-20261105/token-comparison.json); kết quả gốc có thể tạo lại bằng runner khi quota được làm mới.

Hướng dẫn kỹ thuật tham chiếu: [thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [đo token](https://ai.google.dev/gemini-api/docs/generate-content/tokens), [structured output](https://ai.google.dev/gemini-api/docs/structured-output). Các con số kiểm thử trong tài liệu này do runner của dự án đo, không lấy từ ví dụ tài liệu nhà cung cấp.
