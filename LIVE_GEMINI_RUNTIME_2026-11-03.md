# Kiểm tra Docker và Gemini thật — 2026-11-03

**Cập nhật sau đó:** lỗi giỏ/cửa hàng, checkout và thanh toán đã được sửa và kiểm tra tiếp. Xem [kết quả mới nhất](CHECKOUT_FIX_VERIFICATION_2026-11-03.md). Các giới hạn bên dưới mô tả lần smoke trước bản sửa này.

## Kết luận

VERIFIED_RUNTIME trong phạm vi smoke commerce bên dưới. Chưa xác nhận toàn bộ UC01–UC12 hoặc sẵn sàng production.

Stack được build từ working tree hiện tại và để chạy tại http://localhost:3000. Core: http://localhost:4000; Agent: http://localhost:8000; Phoenix: http://localhost:6006.

## Bằng chứng thực thi

- Gemini `models.list`: HTTP 200; key truy cập được `gemini-3.5-flash-lite`.
- Gemini `generateContent`: HTTP 200, `modelVersion=gemini-3.5-flash-lite`, trả đúng `RETAILMIND_GEMINI_OK`; 24 token, khoảng 2,28 giây. Key không được ghi vào báo cáo.
- Container Agent: `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.5-flash-lite`, `PERSISTENCE_ADAPTER=postgres`, schema `agent`.
- 8 container chạy; PostgreSQL 16.15, Redis, MinIO và Qdrant có healthcheck healthy.
- Backend, Agent và frontend production image build thành công; Next.js sinh đủ 30 trang.
- Smoke HTTP thật: **23/23**. Chi tiết: [JSON](.test-rag-work/live-runtime-final-restart.json).
- Agent unit/HTTP regression: **316 passed**, một warning dependency Redis. Provider/identity fixture, không phải 316 ca Gemini thật. [Log](.test-rag-work/agent-regression-final.log).
- Core cart regression: **12 passed**, gồm từ chối thiếu cửa hàng. Đây là unit test.
- Core PostgreSQL cô lập: **9 passed**. [Log](.test-rag-work/postgres-runtime-regression.log). Container fixture đã tự dừng/xóa; không reset volume dự án.

## Phạm vi smoke Gemini thật

- Frontend trả HTTP 200; BFF `/api/proxy/chat/stream` phát SSE có answer hoàn tất và `[DONE]` khi Gemini gọi catalog Core.
- Guest tra catalog và chi tiết giá bằng tool; câu trả lời có `verified_commerce`.
- Guest gọi cart Core bị 401.
- Đăng ký, đăng nhập và `/auth/me` dùng Core/PostgreSQL thật, không mock identity.
- Customer đọc giỏ; thêm một SKU tại cửa hàng thật đã chọn.
- Gửi lại cùng operation UUID với model call mới: giỏ vẫn có đúng một sản phẩm; Core receipt confirmed.
- Restart container Agent thực sự, gửi lại cùng operation UUID qua Gemini: giỏ vẫn có đúng một sản phẩm. Đây là bằng chứng restart tiến trình Agent, chưa phải restart PostgreSQL/Core hoặc mất gói TCP sau commit.
- Thêm favorite và replay: một favorite, không lặp mutation.
- Ticket thiếu đơn bị chặn, không tạo ticket. Response hiện là `unknown_outcome`; chưa phải trải nghiệm hỏi bổ sung thông tin hoàn chỉnh.

Giá/các mã SKU trong câu trả lời được kiểm tra qua catalog Core thực, không dùng danh mục local fallback. Các số lượng giỏ/favorite được đọc lại bằng API Core.

## Lỗi đã phát hiện và sửa trong lượt này

1. `.env` dùng tên hiển thị model. Đổi sang mã API `gemini-3.5-flash-lite`; không thay key.
2. Gemini từ chối schema Pydantic có `exclusiveMinimum` khi gửi qua `parameters`. Adapter dùng `parametersJsonSchema` và giữ nguyên validation phía server; thêm regression. [Tài liệu FunctionDeclaration](https://aistudio.google.com/api-reference/caching).
3. Core runtime thiếu UPDATE trên cột `idempotency_keys.status`. Đã bổ sung đúng quyền cột đó vào DB đang chạy và SQL triển khai; không cấp superuser/quyền rộng.
4. Add-cart dùng UUID cửa hàng fixture không tồn tại trong DB hiện tại. Tool nhận/chuyển `store_id`; Core yêu cầu cửa hàng rõ ràng thay vì UUID đó. Smoke lấy mã từ API stores thật.
5. Một test frontend compatibility giả định Core luôn tắt. Cô lập transport của ca unavailable để kết quả không phụ thuộc backend tình cờ đang mở.

Một lần smoke trong giai đoạn dịch vụ vừa được thay image gặp timeout/circuit cooldown ở tool Core. Sau khi dịch vụ ổn định, lần kiểm tra cuối đạt 23/23. Chưa có bằng chứng SLO/khả năng chịu tải hay readiness probe đầy đủ.

## Giới hạn còn lại

- Chưa chạy checkout → thanh toán mô phỏng → receipt end-to-end với Gemini thật.
- Chưa chạy thành công ticket gắn đơn thật qua Gemini; chỉ kiểm tra từ chối thiếu đơn. Fixture PostgreSQL riêng có ticket/cancel/cart/favorite transaction, concurrency và rollback; profile resolver trong fixture HTTP vẫn mock, model scripted.
- Timeout sau commit ở fixture được mô phỏng bằng trì hoãn response/promise, không phải gây đứt mạng TCP thật.
- Core cart update/read vẫn còn mặc định UUID cửa hàng fixture; nhánh đọc có thể trả stock=0 khi không resolve được cửa hàng. Cần thống nhất ngữ cảnh cửa hàng/giá trị tồn chưa xác định cho toàn bộ API/UI giỏ, không coi smoke add-cart là đã sửa toàn bộ giỏ hàng.
- Chưa kiểm tra mọi quyền Admin/IDOR, quản trị tồn/đơn, multi-turn tool history, load, backup/restore hoặc giao diện bằng trình duyệt.
- RAG nguồn/version/ACL và thực thi refund vẫn fail-closed theo phạm vi trước đó.
- Không coi metric FinOps hiện tại là hóa đơn/token thực tế của Gemini; harness còn tính usage ước lượng.

Các account có email `live_*@example.invalid` và `direct_*@example.invalid`, giỏ/favorite và checkpoint của lần test được giữ lại làm bằng chứng. Không thay tồn kho hay tạo đơn trên DB dự án. Không commit/push và không lưu key/password/access token trong báo cáo.

## Chạy lại

```powershell
docker compose --env-file .env --env-file agent-system/.env up -d --build
agent-system\.venv\Scripts\python.exe -B scripts\test_live_agent_runtime.py --customer --restart-agent
```

Lệnh smoke tạo tài khoản test mới và có restart Agent development; không chạy đồng thời với người đang dùng Agent. File JSON kết quả nằm trong thư mục đã gitignore. Kiểm tra API chỉ dùng câu hỏi test và dữ liệu catalog, không gửi dữ liệu khách hàng thật lên provider.
