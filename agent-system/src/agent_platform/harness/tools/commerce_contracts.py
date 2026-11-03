"""Validated Core write responses and their deterministic customer-facing wording."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr


class CoreResult(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    status: Literal["success"]


class CartSnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    customer_id: StrictStr = Field(min_length=1)
    items: list[dict]


class CartWriteResult(CoreResult):
    cart: CartSnapshot


class OrderCancelResult(CoreResult):
    order_id: StrictStr = Field(min_length=1)
    action: Literal["CANCELLED"]


class TicketDetails(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    customerId: StrictStr = Field(min_length=1)
    ticketCode: StrictStr = Field(min_length=1)


class TicketWriteResult(CoreResult):
    ticket_id: StrictStr = Field(min_length=1)
    ticket: TicketDetails


class FavoriteWriteResult(CoreResult):
    customer_id: StrictStr = Field(min_length=1)
    sku: StrictStr = Field(min_length=1)
    action: Literal["add", "remove", "toggle"]
    is_favorited: StrictBool


class RefundWriteResult(CoreResult):
    order_id: StrictStr = Field(min_length=1)
    refund_id: StrictStr = Field(min_length=1)


class ConfirmedCommerceWrite(dict):
    """Internal result constructed only after validation against Core's response."""


def validated_write(tool_name: str, data: dict, args: BaseModel, customer_id: str) -> ConfirmedCommerceWrite:
    if tool_name in ("add_to_cart", "remove_from_cart"):
        result = CartWriteResult.model_validate(data)
        if result.cart.customer_id != customer_id:
            raise ValueError("cart owner mismatch")
        if tool_name == "add_to_cart":
            answer = f"Đã xác nhận thêm {args.quantity} sản phẩm {args.sku} vào giỏ hàng."
        else:
            answer = f"Đã xác nhận xóa sản phẩm {args.sku} khỏi giỏ hàng."
    elif tool_name == "cancel_simulated_order":
        result = OrderCancelResult.model_validate(data)
        if result.order_id != args.order_id:
            raise ValueError("order mismatch")
        answer = f"Đã xác nhận hủy đơn hàng {result.order_id}."
    elif tool_name == "create_support_ticket":
        result = TicketWriteResult.model_validate(data)
        if result.ticket.customerId != customer_id or result.ticket.ticketCode != result.ticket_id:
            raise ValueError("ticket mismatch")
        answer = f"Đã xác nhận tạo phiếu hỗ trợ {result.ticket_id}."
    elif tool_name == "manage_favorite":
        result = FavoriteWriteResult.model_validate(data)
        if (result.customer_id != customer_id or result.sku != args.sku or result.action != args.action
                or (args.action != "toggle" and result.is_favorited != (args.action == "add"))):
            raise ValueError("favorite mismatch")
        state = "có trong" if result.is_favorited else "không còn trong"
        answer = f"Đã xác nhận sản phẩm {result.sku} {state} danh sách yêu thích."
    elif tool_name in ("safe_refund", "request_return_or_refund"):
        result = RefundWriteResult.model_validate(data)
        if result.order_id != args.order_id:
            raise ValueError("order mismatch")
        answer = f"Đã xác nhận bồi hoàn thành công cho đơn hàng {result.order_id} (Mã giao dịch: {result.refund_id})."
    else:
        raise ValueError("unsupported commerce operation")
    return ConfirmedCommerceWrite({**data, "source": "nestjs_commerce_ssot", "contract_version": 1, "operation": tool_name, "outcome": "confirmed", "answer": answer})
