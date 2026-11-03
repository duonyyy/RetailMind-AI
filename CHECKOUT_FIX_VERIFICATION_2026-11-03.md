# Giỏ hàng, đặt hàng và thanh toán mô phỏng — đã sửa và kiểm tra

Ngày kiểm tra: 2026-11-03. Bản sửa đã được build và áp dụng vào Docker chính tại http://localhost:3000. Không commit/push.

## Thay đổi

- Giỏ hàng có lựa chọn cửa hàng thật; PATCH số lượng chuyển đúng storeId. Core bỏ UUID fixture mặc định. Đọc giỏ chưa chọn cửa hàng trả tồn kho `null`, không báo hết hàng giả.
- Các thao tác giỏ và checkout dùng cùng khóa theo customer để tránh sửa/xóa giỏ đồng thời làm mất dữ liệu.
- Checkout từ giỏ dùng đủ các sản phẩm. Core kiểm tra giỏ còn khớp bản xem trước và xóa giỏ trong cùng transaction với tạo đơn/giữ kho. Lỗi transaction giữ lại giỏ. Mua ngay một sản phẩm không xóa các món chưa mua.
- Bỏ cleanup receipt theo key sau rollback để request thua tranh chấp không xóa receipt của request đã commit.
- Thanh toán mô phỏng yêu cầu Idempotency-Key; receipt được lưu trong cùng transaction với trừ kho và audit. Gửi lại cùng key trả cùng kết quả. Khác key cho đơn đã thanh toán bị chặn.
- Thanh toán thiếu bản ghi kho hoặc thiếu lượng đã giữ bị từ chối; không dùng Math.max để che số lượng âm/sai.
- Modal chỉ đóng khi Core xác nhận `completed`; lỗi hiển thị và giữ key để thử lại. Trang biên nhận có nút thanh toán sau cho đơn chưa trả tiền và đọc trạng thái thật từ Core.
- Tên cửa hàng biên nhận lấy từ Core. Giao hàng tận nơi hiện bị vô hiệu hóa vì chưa có backend hỗ trợ; không hứa giao nhanh hay tự điền thông tin người nhận giả.

## Bằng chứng

1. **31/31 ca runtime** qua frontend BFF → Core đầy đủ → PostgreSQL thật, với migration thật, runtime DB role hạn chế và hai customer đăng ký/đăng nhập thật; không mock business service hoặc identity. Database và ba container riêng, đã dọn sau kiểm tra. [JSON](.test-rag-work/checkout-runtime.json).
2. Kiểm tra bao gồm: đổi số lượng/cửa hàng; không đủ hàng; preview chính xác hai SKU; token hỏng rollback; giỏ thay đổi chặn checkout cũ; hai request checkout cùng key; replay và payload mismatch; số order/order_items/reserved thật; IDOR đọc đơn/thanh toán; thanh toán thiếu key/thiếu reservation; thanh toán đồng thời cùng key chỉ trừ kho/audit một lần; mua ngay giữ giỏ; hủy trả reservation; ticket gắn đúng đơn/profile và replay; hai customer mua món cuối chỉ một người thành công (201/409).
3. **Trình duyệt thật:** login → cart Fixture B từ 1 lên 2 → checkout đủ giỏ → xác nhận đơn → nút thanh toán mô phỏng → biên nhận `completed`, tổng `4400000` VNĐ. Đối chiếu SQL sau thao tác: Fixture B tại Fixture Store A có on_hand=7, reserved=0, đúng hai sản phẩm vừa mua. [Ảnh](.test-rag-work/checkout-paid-ui.png).
4. **113 test Core passed**, 9 test fixture PostgreSQL cũ skipped trong lệnh chạy toàn bộ; bằng chứng runtime mới là 31 ca ở trên. [Log](.test-rag-work/core-checkout-regression.log).
5. **17 test frontend passed**; Docker production build Core/frontend thành công, bao gồm TypeScript và build 30 trang.
6. Sau khi thay image stack chính, **21/21 smoke Gemini thật passed**, gồm SSE BFF, catalog, đăng nhập, cart/favorite và replay. [JSON](.test-rag-work/live-after-checkout-fix.json).

## Giới hạn của kết luận

Luồng giỏ → checkout → thanh toán mô phỏng đã được chạy qua UI và PostgreSQL, không chuyển tiền thật. Không suy rộng thành kiểm tra toàn bộ UC01–UC12, mọi tải đồng thời hoặc production readiness. Lần này không gây mất gói TCP sau commit, không kiểm tra backup/restore, và không bổ sung RAG/refund execution. Khôi phục checkout sau khi mất phản hồi rồi reload vẫn cần đối soát đơn/mã thao tác; smoke không chứng minh toàn bộ các tình huống đó.

Không thay giá/tồn kho hay tạo đơn test trên database chính. Chỉ smoke Gemini sau triển khai tạo tài khoản/giỏ/favorite test riêng trong DB chính theo cách đã dùng trước đó; key không được ghi vào báo cáo.

Chạy lại runtime cô lập sau khi build image:

```powershell
agent-system\.venv\Scripts\python.exe -B scripts\test_checkout_runtime.py
```

Mặc định script tự dọn đúng container có nhãn fixture sau khi xong. Dữ liệu JSON/ảnh/log nằm trong thư mục gitignore `.test-rag-work`.
