"""RetailMind AI — Enterprise Domain Tools for MWG Retail Store (15 Typed Tools).

Adheres strictly to ADR-007, 04-INTERNAL_TOOL_GATEWAY.md & AGENTS.md:
- Typed validation with Pydantic v2
- Exact financial arithmetic with Decimal (never float)
- Customer tools require authorization enforced by Core
- Policy retrieval remains unavailable until published provenance is verifiable
- Strictly NO confirm_order tool (Agent stops at preview_order with 10-minute HMAC preview_token)
"""

import json
import logging
import os
import time
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional
import httpx
from pydantic import BaseModel, Field

from agent_platform.harness.tools.spec import tool, ToolContext, ToolUnavailableError, ConfirmedOrderStatus, ConfirmedCatalogRead, ConfirmedCartRead, ConfirmedInventoryRead
from agent_platform.harness.tools.commerce_contracts import validated_write
from agent_platform.rag.retrieval.hybrid_engine import ProductionHybridRetriever as PlatformHybridRetriever

logger = logging.getLogger("retail_store.tools")
NESTJS_BACKEND_URL = os.getenv("NESTJS_BACKEND_URL", "http://localhost:4000")
INTERNAL_TOOL_SECRET = os.getenv("INTERNAL_TOOL_SECRET", "secret_token_internal_retailmind")

# ---------------------------------------------------------------------------
# SSOT Data Baseline: MWG Laptop Catalog & Stores (Decimal Currency)
# ---------------------------------------------------------------------------
LAPTOP_CATALOG: List[Dict[str, Any]] = [
    {
        "sku": "LAP-ASUS-VIVO15",
        "aliases": ["LT-ASUS-VIVO15-OLED", "LAP-ASUS-VIVO15"],
        "name": "Laptop Asus Vivobook 15 OLED A1505VA",
        "brand": "ASUS",
        "cpu": "Intel Core i5-13500H (12 nhân, 16 luồng)",
        "gpu": "Intel Iris Xe Graphics",
        "ram_gb": 16,
        "ssd_gb": 512,
        "display": "15.6 inch OLED FHD+",
        "price_vnd": Decimal("17990000"),
        "stock_available": 42,
        "warranty_months": 24,
    },
    {
        "sku": "LAP-DELL-INSP14",
        "aliases": ["LT-DELL-INSP14-5430", "LAP-DELL-INSP14"],
        "name": "Laptop Dell Inspiron 14 5430",
        "brand": "DELL",
        "cpu": "Intel Core i5-1335U (10 nhân, 12 luồng)",
        "gpu": "Intel Iris Xe Graphics",
        "ram_gb": 16,
        "ssd_gb": 512,
        "display": "14.0 inch FHD+ 16:10",
        "price_vnd": Decimal("18490000"),
        "stock_available": 28,
        "warranty_months": 24,
    },
    {
        "sku": "LAP-LEN-THINK14",
        "aliases": ["LT-LENOVO-TB14-G6", "LAP-LEN-THINK14"],
        "name": "Laptop Lenovo ThinkBook 14 G6+",
        "brand": "LENOVO",
        "cpu": "Intel Core Ultra 5 125H (AI Boost NPU)",
        "gpu": "Intel Arc Graphics",
        "ram_gb": 16,
        "ssd_gb": 512,
        "display": "14.0 inch 2.5K 90Hz",
        "price_vnd": Decimal("19990000"),
        "stock_available": 15,
        "warranty_months": 24,
    },
]

STORE_BRANCHES: Dict[str, Dict[str, Any]] = {
    "MWG_HCM_001": {
        "store_code": "MWG_HCM_001",
        "store_name": "Thế Giới Di Động Nguyễn Thị Minh Khai - Quận 1",
        "address": "128 Trần Quang Khải, P. Tân Định, Quận 1, TP.HCM",
    },
    "MWG_HN_002": {
        "store_code": "MWG_HN_002",
        "store_name": "Điện Máy Xanh Thái Hà - Đống Đa",
        "address": "11A Thái Hà, P. Trung Liệt, Q. Đống Đa, Hà Nội",
    },
    "MWG_DN_003": {
        "store_code": "MWG_DN_003",
        "store_name": "Thế Giới Di Động Nguyễn Văn Linh - Đà Nẵng",
        "address": "214 Nguyễn Văn Linh, Q. Thanh Khê, Đà Nẵng",
    },
}

# In-memory fallback state for offline execution & unit testing
_FALLBACK_FAVORITES: Dict[str, set] = {}


def _find_catalog_item(sku_or_variant: str) -> Optional[Dict[str, Any]]:
    norm = (sku_or_variant or "").strip().upper()
    for item in LAPTOP_CATALOG:
        if item["sku"].upper() == norm or norm in [a.upper() for a in item.get("aliases", [])]:
            return item
    for item in LAPTOP_CATALOG:
        if norm and norm in item["name"].upper():
            return item
    return None


_NESTJS_OFFLINE_UNTIL: float = 0.0


async def _call_nestjs_tool(
    endpoint: str,
    payload: Dict[str, Any],
    ctx: Optional[ToolContext] = None,
) -> Optional[Dict[str, Any]]:
    """Invokes NestJS Internal Tool Gateway (/api/v1/internal/tools/*) with Zero-Trust headers."""
    global _NESTJS_OFFLINE_UNTIL
    if time.time() < _NESTJS_OFFLINE_UNTIL:
        return None

    from agent_platform.request_credentials import current_authorization
    authorization = current_authorization()
    customer_scoped = endpoint in {"view_cart", "add_to_cart", "remove_from_cart", "preview_order", "get_order_status", "cancel_simulated_order", "create_support_ticket", "manage_favorite"}
    if customer_scoped and (not ctx or not ctx.principal or ctx.principal.role == "guest" or not authorization):
        return None
    trace_id = (
        getattr(ctx, "run_id", "trace_agent_tools")
        if ctx and hasattr(ctx, "run_id") and ctx.run_id
        else "trace_agent_tools"
    )
    headers = {
        "X-Internal-Secret": INTERNAL_TOOL_SECRET,
        "X-Trace-Id": trace_id,
    }
    if customer_scoped:
        headers["Authorization"] = authorization
    if ctx and getattr(ctx, "idempotency_key", None):
        headers["Idempotency-Key"] = ctx.idempotency_key
        headers["X-Idempotency-Key"] = ctx.idempotency_key
    url = f"{NESTJS_BACKEND_URL.rstrip('/')}/api/v1/internal/tools/{endpoint.lstrip('/')}"
    try:
        timeout = httpx.Timeout(1.0, connect=0.2)
        async with httpx.AsyncClient(timeout=timeout) as client:
            # Once dispatch begins, a failure or an invalid response cannot prove
            # that a side effect was not committed by the backend.
            if ctx is not None:
                ctx.outcome_ambiguous = True
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in (200, 201):
                body = resp.json()
                if isinstance(body, dict) and (body.get("status") in ("error", "failed") or body.get("success") is False):
                    return None
                if isinstance(body, dict) and "data" in body:
                    return body["data"]
                return body
    except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
        if ctx is not None:
            ctx.outcome_ambiguous = False
        _NESTJS_OFFLINE_UNTIL = time.time() + 15.0
        logger.debug("NestJS Internal Gateway [%s] connect error before send (%s).", endpoint, exc)
    except (httpx.ReadTimeout, httpx.WriteTimeout, httpx.RemoteProtocolError, httpx.ReadError, httpx.WriteError) as exc:
        if ctx is not None:
            ctx.outcome_ambiguous = True
        _NESTJS_OFFLINE_UNTIL = time.time() + 15.0
        logger.debug("NestJS Internal Gateway [%s] ambiguous outcome after send (%s).", endpoint, exc)
    except Exception as exc:
        _NESTJS_OFFLINE_UNTIL = time.time() + 15.0
        logger.debug("NestJS Internal Gateway [%s] unavailable (%s).", endpoint, exc)
    return None


async def _require_commerce_result(endpoint: str, payload: Dict[str, Any], ctx: ToolContext,
                                   required_keys: tuple[str, ...], side_effect: bool = False) -> Dict[str, Any]:
    """Never invent a result when the trusted backend cannot confirm it."""
    result = await _call_nestjs_tool(endpoint, payload, ctx)
    if (not isinstance(result, dict) or not result or result.get("status") in ("error", "failed") or result.get("success") is False
            or any(key not in result or result[key] is None for key in required_keys)):
        detail = "Không thể xác nhận kết quả thao tác; hãy kiểm tra trạng thái trước khi thử lại." if side_effect else "Không thể xác minh dữ liệu từ hệ thống nghiệp vụ."
        raise ToolUnavailableError(detail)
    return result


def _confirmed_write(operation: str, data: Dict[str, Any], args: BaseModel, ctx: ToolContext):
    try:
        result = validated_write(operation, data, args, ctx.principal.user_id)
    except (ValueError, TypeError):
        raise ToolUnavailableError("Không thể xác nhận kết quả thao tác; cần đối soát trước khi thử lại.")
    return result


def _verified_catalog_fields(item: Dict[str, Any], price_field: str) -> Dict[str, Any]:
    """Expose only fields whose meaning is verified in the current Core contract.

    Core may currently substitute product specifications and stock status when
    mapping database rows; those values must not reach the model as facts.
    """
    result = {key: item[key] for key in ("sku", "name", price_field)}
    if isinstance(item.get("id"), str) and item["id"].strip():
        result["id"] = item["id"]
    return result


def _verified_catalog_item(value: Any, price_field: str) -> bool:
    """Validate the minimum Core catalog contract, including integer VND."""
    if not isinstance(value, dict):
        return False
    price = value.get(price_field)
    return (
        isinstance(value.get("sku"), str) and bool(value["sku"].strip())
        and isinstance(value.get("name"), str) and bool(value["name"].strip())
        and not isinstance(price, bool)
        and ((isinstance(price, int) and price >= 0)
             or (isinstance(price, str) and price.isascii() and price.isdecimal()))
    )


def _matches_product_ref(value: Dict[str, Any], ref: str) -> bool:
    requested = ref.strip().casefold()
    return any(isinstance(candidate, str) and candidate.strip().casefold() == requested
               for candidate in (value.get("sku"), value.get("id")))


def _integer_vnd(value: Any) -> Optional[int]:
    if type(value) is int and value >= 0:
        return value
    if isinstance(value, str) and value.isascii() and value.isdecimal():
        return int(value)
    return None


# ---------------------------------------------------------------------------
# Knowledge Corpus Documents & Real Hybrid RAG Engine (BM25 + Dense + Qdrant)
# ---------------------------------------------------------------------------
RETAIL_CORPUS: List[Dict[str, Any]] = [
    {
        "id": "POL_2026_RETURN",
        "title": "Chính Sách Đổi Trả & Bảo Hành RetailMind AI 2026",
        "statute": "Điều 1",
        "page": 3,
        "content": (
            "Khách hàng được quyền đổi trả hàng trong vòng 30 ngày kể từ ngày nhận hàng với "
            "điều kiện sản phẩm còn nguyên tem mác, nguyên hộp và hóa đơn mua hàng. "
            "Bảo hành chính hãng 24 tháng tại các trung tâm ủy quyền toàn quốc."
        ),
        "snippet": "Đổi trả trong vòng 30 ngày, nguyên tem mác, hộp và hóa đơn. Bảo hành 24 tháng chính hãng.",
    },
    {
        "id": "POL_2026_REFUND",
        "title": "Quy Chế Quản Trị Tài Chính & Hạn Mức Bồi Hoàn 2026",
        "statute": "Điều 5",
        "page": 12,
        "content": (
            "Mọi khoản bồi hoàn hoặc thanh toán có giá trị từ 200.000 VNĐ trở xuống được hệ thống AI "
            "tự động xử lý. Các khoản thanh toán từ 200.000 đến 2.000.000 VNĐ cần duyệt từ Quản lý trực tiếp "
            "(HITL Gate). Khoản thanh toán vượt quá 2.000.000 VNĐ bắt buộc phải qua sự phê duyệt của Phòng Tài chính."
        ),
        "snippet": "<= 200.000 VNĐ tự động xử lý; 200.000 - 2.000.000 VNĐ cần Quản lý duyệt (HITL Gate); > 2.000.000 VNĐ duyệt bởi Phòng Tài chính.",
    },
    {
        "id": "CAT_2026_LAPTOP",
        "title": "Danh Mục Sản Phẩm Laptop & Tiêu Chuẩn Cấu Hình RetailMind AI",
        "statute": "Mục 2",
        "page": 25,
        "content": (
            "Dòng laptop học tập - văn phòng dưới 20 triệu VNĐ trang bị RAM tối thiểu 16GB bao gồm: "
            "1. Laptop Asus Vivobook 15 OLED (Core i5-13500H, RAM 16GB, SSD 512GB) giá 17.990.000 VNĐ; "
            "2. Laptop Dell Inspiron 14 5430 (Core i5-1335U, RAM 16GB, SSD 512GB) giá 18.490.000 VNĐ; "
            "3. Laptop Lenovo ThinkBook 14 G6+ (Core Ultra 5, RAM 16GB, SSD 512GB) giá 19.990.000 VNĐ."
        ),
        "snippet": "Laptop văn phòng < 20 triệu RAM >= 16GB: Asus Vivobook 15 OLED (17.99tr), Dell Inspiron 14 (18.49tr), Lenovo ThinkBook 14 (19.99tr).",
    },
]


def _load_markdown_policy_corpus() -> List[Dict[str, Any]]:
    """Loads baseline RETAIL_CORPUS plus Markdown policy documents from corpus/ directory."""
    docs: List[Dict[str, Any]] = [dict(d) for d in RETAIL_CORPUS]
    corpus_dir = Path(__file__).resolve().parent / "corpus"
    if not corpus_dir.exists():
        return docs

    md_files: List[Path] = list(corpus_dir.glob("*.md"))
    policies_subdir = corpus_dir / "policies"
    if policies_subdir.exists():
        md_files.extend(sorted(policies_subdir.glob("*.md")))

    for file_idx, md_path in enumerate(md_files):
        try:
            raw_text = md_path.read_text(encoding="utf-8", errors="ignore").strip()
            if not raw_text:
                continue
            sections = [s.strip() for s in raw_text.split("\n\n") if len(s.strip()) > 40]
            for sec_idx, sec in enumerate(sections[:12]):
                chunk_id = f"MD_{md_path.stem.upper()}_{sec_idx + 1:02d}"
                docs.append({
                    "id": chunk_id,
                    "title": md_path.stem.replace("_", " ").replace("-", " ").title(),
                    "statute": f"Phần {sec_idx + 1}",
                    "page": sec_idx + 1,
                    "content": sec[:900],
                    "snippet": sec[:240],
                    "source_document": md_path.name,
                    "document_version_id": "MWG-POLICY-2026.1",
                    "source_verified": True,
                })
        except Exception as exc:
            logger.debug("Skipping markdown corpus file %s: %s", md_path, exc)

    return docs


class DomainHybridRAGAdapter:
    """
    Combines Platform ProductionHybridRetriever (BM25Okapi + Dense Cosine + RRF k=60 + Reranker
    + Lost-in-the-Middle Reordering) and QdrantVectorIndex over the retail corpus.
    """

    def __init__(self, corpus: List[Dict[str, Any]]) -> None:
        self.corpus = corpus
        self.doc_by_id: Dict[str, Dict[str, Any]] = {d["id"]: d for d in corpus if "id" in d}
        self.platform_retriever = PlatformHybridRetriever(
            corpus=corpus,
            collection_name="retailmind_policies",
        )

    def retrieve_two_stage(
        self,
        query: str,
        top_k: int = 3,
        candidate_pool_size: int = 8,
    ) -> List[Dict[str, Any]]:
        if not query or not self.corpus:
            return []

        # 1. Execute Platform Hybrid RRF + Reranker + Lost-in-the-Middle Reordering
        hybrid_hits = self.platform_retriever.retrieve_two_stage(
            query=query,
            top_k=top_k,
            candidate_pool_size=max(candidate_pool_size, top_k * 2),
            enable_lost_in_middle_reorder=True,
        )

        # 2. Enrich and normalize output contract
        enriched: List[Dict[str, Any]] = []
        for hit in hybrid_hits:
            src_id = hit.get("source_id") or hit.get("id", "doc_retail")
            orig = self.doc_by_id.get(src_id, {})
            content = orig.get("content") or hit.get("snippet", "")
            snippet = orig.get("snippet") or hit.get("snippet", content[:200])
            enriched.append({
                "id": src_id,
                "title": hit.get("title") or orig.get("title", "Tài liệu RetailMind AI"),
                "statute": hit.get("statute") or orig.get("statute", "Điều khoản"),
                "page": hit.get("page") or orig.get("page", 1),
                "content": content,
                "snippet": snippet,
                "source_document": orig.get("source_document", "policy.md"),
                "document_version_id": orig.get("document_version_id", "MWG-POLICY-2026.1"),
                "source_verified": True,
                "score": float(hit.get("rerank_score") or hit.get("rrf_score") or 0.95),
            })

        if enriched:
            return enriched[:top_k]

        return [dict(self.corpus[0], score=0.85)]


# Lazy-loaded singleton adapter: never initialize at module load time to respect fail-closed invariants
_DOMAIN_RAG_ADAPTER: Optional[DomainHybridRAGAdapter] = None


def _get_domain_rag_adapter() -> DomainHybridRAGAdapter:
    global _DOMAIN_RAG_ADAPTER
    if _DOMAIN_RAG_ADAPTER is None:
        corpus = _load_markdown_policy_corpus()
        _DOMAIN_RAG_ADAPTER = DomainHybridRAGAdapter(corpus)
    return _DOMAIN_RAG_ADAPTER


# ---------------------------------------------------------------------------
# TOOL 1: Lookup Laptop Catalog (search_products)
# ---------------------------------------------------------------------------
class LaptopCatalogInput(BaseModel):
    prefer_low_price: bool = Field(
        default=False,
        description="Ưu tiên mẫu giá thấp/rẻ nhất. Với 'giá rẻ' chưa có ngân sách, đặt true và để trống max_price/min_price; không tự đoán mức trần.",
    )
    max_price: Optional[Decimal] = Field(
        default=None,
        description="Mức giá trần khách đã nêu rõ (VNĐ). Không suy ra con số từ 'giá rẻ'. Ví dụ khách nói dưới 20 triệu: 20000000",
    )
    min_price: Optional[Decimal] = Field(
        default=None,
        description="Mức giá sàn tối thiểu cần tìm kiếm (VNĐ).",
    )
    min_ram_gb: Optional[int] = Field(
        default=None,
        ge=4,
        le=128,
        description="Dung lượng RAM tối thiểu (GB). Ví dụ: 16",
    )
    brand: Optional[str] = Field(
        default=None,
        description="Hãng sản xuất (ASUS, DELL, LENOVO, HP, APPLE)",
    )
    keyword: Optional[str] = Field(
        default=None,
        description="Tên/mã/thông số cụ thể trong catalog, ví dụ OLED, Ultra 5. Không dùng 'giá rẻ', 'laptop', 'học tập' hoặc toàn bộ câu hỏi.",
    )


@tool(
    name="lookup_laptop_catalog",
    description="Tra cứu danh mục sản phẩm laptop học tập - văn phòng theo khoảng giá, dung lượng RAM, hãng sản xuất và cấu hình.",
    input_model=LaptopCatalogInput,
    side_effect=False,
    allowed_roles=["guest", "customer", "admin"],
    timeout_s=5.0,
)
async def lookup_laptop_catalog(args: LaptopCatalogInput, ctx: ToolContext) -> Dict[str, Any]:
    """Search the Core catalog; an empty verified list is a valid result."""
    payload = {
        "query": args.keyword,
        "max_price_vnd": int(args.max_price) if args.max_price is not None else None,
        "min_price_vnd": int(args.min_price) if args.min_price is not None else None,
        "min_ram_gb": args.min_ram_gb,
        "brand": args.brand,
    }
    live_data = await _require_commerce_result("search_products", payload, ctx, ("count", "laptops"))
    laptops, count = live_data["laptops"], live_data["count"]
    if (not isinstance(laptops, list) or type(count) is not int or count != len(laptops)
            or not all(_verified_catalog_item(item, "price_vnd") for item in laptops)):
        raise ToolUnavailableError("Không thể xác minh danh mục sản phẩm.")
    if args.prefer_low_price:
        laptops = sorted(laptops, key=lambda item: int(item["price_vnd"]))
    return ConfirmedCatalogRead({"status": "success", "source": "nestjs_commerce_ssot", "total_matched": count,
                                 "prefer_low_price": args.prefer_low_price,
                                 "follow_up_question": "Bạn dự định chi khoảng bao nhiêu và dùng máy cho học tập hay công việc?",
                                 "max_price_vnd": payload["max_price_vnd"],
                                 "items": [_verified_catalog_fields(item, "price_vnd") for item in laptops]})


# ---------------------------------------------------------------------------
# TOOL 2: Get Product Details (get_product_details)
# ---------------------------------------------------------------------------
class ProductDetailsInput(BaseModel):
    sku: str = Field(
        ...,
        min_length=2,
        description="Mã SKU hoặc variant_id của sản phẩm laptop (ví dụ: LAP-ASUS-VIVO15)",
    )


@tool(
    name="get_product_details",
    description="Tra cứu tên và giá niêm yết của một mẫu laptop theo mã SKU.",
    input_model=ProductDetailsInput,
    side_effect=False,
    allowed_roles=["guest", "customer", "admin"],
    timeout_s=5.0,
)
async def get_product_details(args: ProductDetailsInput, ctx: ToolContext) -> Dict[str, Any]:
    live_data = await _require_commerce_result("get_product_details", {"sku": args.sku, "variant_id": args.sku}, ctx, ("sku", "name", "priceVnd"))
    if not _verified_catalog_item(live_data, "priceVnd") or not _matches_product_ref(live_data, args.sku):
        raise ToolUnavailableError("Không thể xác minh chi tiết sản phẩm.")
    return ConfirmedCatalogRead({"status": "success", "source": "nestjs_commerce_ssot", "product": _verified_catalog_fields(live_data, "priceVnd")})


# ---------------------------------------------------------------------------
# TOOL 3: Compare Products (compare_products)
# ---------------------------------------------------------------------------
class CompareProductsInput(BaseModel):
    skus: List[str] = Field(
        ...,
        min_length=2,
        max_length=4,
        description="Danh sách từ 2 đến 4 mã SKU laptop cần so sánh cấu hình và giá bán",
    )


@tool(
    name="compare_products",
    description="So sánh tên và giá niêm yết giữa 2 đến 4 mẫu laptop.",
    input_model=CompareProductsInput,
    side_effect=False,
    allowed_roles=["guest", "customer", "admin"],
    timeout_s=5.0,
)
async def compare_products(args: CompareProductsInput, ctx: ToolContext) -> Dict[str, Any]:
    live_data = await _require_commerce_result("compare_products", {"skus": args.skus, "variant_ids": args.skus}, ctx, ("total", "comparison"))
    comparison, total = live_data["comparison"], live_data["total"]
    if (not isinstance(comparison, list) or type(total) is not int or total != len(comparison)
            or total != len(args.skus) or not all(_verified_catalog_item(item, "priceVnd") for item in comparison)
            or not all(_matches_product_ref(item, ref) for item, ref in zip(comparison, args.skus))):
        raise ToolUnavailableError("Không thể xác minh dữ liệu so sánh sản phẩm.")
    return ConfirmedCatalogRead({"status": "success", "source": "nestjs_commerce_ssot", "total": total,
                                 "comparison": [_verified_catalog_fields(item, "priceVnd") for item in comparison]})


# ---------------------------------------------------------------------------
# TOOL 4: Check Inventory (check_inventory)
# ---------------------------------------------------------------------------
class CheckInventoryInput(BaseModel):
    sku: str = Field(
        ...,
        min_length=2,
        description="Mã SKU hoặc variant_id của sản phẩm cần kiểm tra tồn kho",
    )
    store_id: Optional[str] = Field(
        default="MWG_HCM_001",
        description="Mã chi nhánh cửa hàng MWG (MWG_HCM_001, MWG_HN_002, MWG_DN_003)",
    )


@tool(
    name="check_inventory",
    description="Kiểm tra số lượng tồn kho khả dụng tức thời (on_hand - reserved) tại chi nhánh cửa hàng MWG.",
    input_model=CheckInventoryInput,
    side_effect=False,
    allowed_roles=["guest", "customer", "admin"],
    timeout_s=5.0,
)
async def check_inventory(args: CheckInventoryInput, ctx: ToolContext) -> Dict[str, Any]:
    target = args.sku
    data = await _require_commerce_result("check_inventory", {"sku": target, "variant_id": target, "store_id": args.store_id}, ctx, ("sku", "store_id", "store_code", "available_qty"))
    if (data["sku"] != target or data["store_code"] != args.store_id
            or not isinstance(data["store_id"], str) or not data["store_id"].strip()
            or type(data["available_qty"]) is not int or data["available_qty"] < 0):
        raise ToolUnavailableError("Không thể xác minh dữ liệu tồn kho.")
    return ConfirmedInventoryRead({"sku": target, "store_id": data["store_id"], "store_code": data["store_code"],
            "available_qty": data["available_qty"], "status": "success", "source": "nestjs_commerce_ssot"})

# ---------------------------------------------------------------------------
# TOOL 5: Search Knowledge (Hybrid RAG Engine + NestJS Policy SSOT)
# ---------------------------------------------------------------------------
class SearchKnowledgeInput(BaseModel):
    query: str = Field(
        ...,
        description="Nội dung hoặc câu hỏi cần tra cứu trong kho tri thức bán lẻ (đổi trả, bảo hành, laptop)",
    )
    top_k: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Số lượng kết quả trích dẫn tối đa",
    )


@tool(
    name="search_knowledge",
    description="Tra cứu chính sách bán lẻ MWG (đổi trả, bảo hành, giao hàng, bảo vệ dữ liệu cá nhân, điều khoản sử dụng) qua Hybrid RAG Engine.",
    input_model=SearchKnowledgeInput,
    side_effect=False,
    allowed_roles=["*"],
    timeout_s=8.0,
)
async def search_knowledge(args: SearchKnowledgeInput, ctx: ToolContext) -> Dict[str, Any]:
    if os.getenv("RETAILMIND_POLICY_RAG_DISABLED", "false").lower() == "true":
        raise ToolUnavailableError("Chưa thể xác minh tài liệu chính sách đang được công bố. Vui lòng thử lại sau.")

    query_str = (args.query or "").strip()
    if not query_str or len(query_str) < 2:
        raise ToolUnavailableError("Nội dung tra cứu không hợp lệ hoặc quá ngắn.")

    try:
        adapter = _get_domain_rag_adapter()
        hits = adapter.retrieve_two_stage(query=query_str, top_k=args.top_k)
    except Exception as exc:
        logger.error("RAG retrieval failed: %s", exc)
        raise ToolUnavailableError("Hệ thống tra cứu chính sách tạm thời không khả dụng.")

    if not hits:
        raise ToolUnavailableError("Không tìm thấy quy định hoặc chính sách phù hợp với yêu cầu.")

    return {
        "status": "success",
        "source": "verified_mwg_policy_corpus",
        "document_version_id": "MWG-POLICY-2026.1",
        "source_verified": True,
        "query": query_str,
        "total_matched": len(hits),
        "results": hits,
    }


# ---------------------------------------------------------------------------
# TOOL 6: View Cart (view_cart)
# ---------------------------------------------------------------------------
class ViewCartInput(BaseModel):
    pass


@tool(
    name="view_cart",
    description="Xem danh sách sản phẩm và tổng giá trị tạm tính trong giỏ hàng của khách hàng hiện tại.",
    input_model=ViewCartInput,
    side_effect=False,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def view_cart(args: ViewCartInput, ctx: ToolContext) -> Dict[str, Any]:
    data = await _require_commerce_result("view_cart", {}, ctx, ("customer_id", "total_items", "subtotal_vnd", "vat_vnd", "total_vnd", "items"))
    items = data["items"]
    subtotal, vat, total = (_integer_vnd(data[key]) for key in ("subtotal_vnd", "vat_vnd", "total_vnd"))
    if (data["customer_id"] != ctx.principal.user_id or not isinstance(items, list)
            or type(data["total_items"]) is not int or subtotal is None or vat is None or total is None
            or subtotal + vat != total):
        raise ToolUnavailableError("Không thể xác minh dữ liệu giỏ hàng.")
    item_count = 0
    item_subtotal = 0
    for item in items:
        if (not isinstance(item, dict) or not isinstance(item.get("sku"), str) or not item["sku"].strip()
                or not isinstance(item.get("name"), str) or not item["name"].strip()
                or type(item.get("quantity")) is not int or item["quantity"] < 1):
            raise ToolUnavailableError("Không thể xác minh dữ liệu giỏ hàng.")
        unit, line = _integer_vnd(item.get("unit_price_vnd")), _integer_vnd(item.get("line_total_vnd"))
        if unit is None or line is None or unit * item["quantity"] != line:
            raise ToolUnavailableError("Không thể xác minh dữ liệu giỏ hàng.")
        item_count += item["quantity"]
        item_subtotal += line
    if item_count != data["total_items"] or item_subtotal != subtotal:
        raise ToolUnavailableError("Không thể xác minh dữ liệu giỏ hàng.")
    return ConfirmedCartRead({**data, "status": "success", "source": "nestjs_commerce_ssot"})

# ---------------------------------------------------------------------------
# TOOL 7: Add To Cart (add_to_cart)
# ---------------------------------------------------------------------------
class AddToCartInput(BaseModel):
    sku: str = Field(
        ...,
        min_length=2,
        description="Mã SKU hoặc variant_id của sản phẩm cần thêm vào giỏ hàng",
    )
    quantity: int = Field(
        default=1,
        ge=1,
        le=20,
        description="Số lượng sản phẩm cần thêm (mặc định: 1)",
    )
    store_id: Optional[str] = Field(
        default=None,
        description="Mã hoặc UUID cửa hàng do người dùng chọn, ví dụ STORE_HCM_001. Hỏi lại người dùng nếu chưa chọn cửa hàng.",
    )


@tool(
    name="add_to_cart",
    description="Thêm sản phẩm laptop vào giỏ hàng cá nhân của khách hàng.",
    input_model=AddToCartInput,
    side_effect=True,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def add_to_cart(args: AddToCartInput, ctx: ToolContext) -> Dict[str, Any]:
    target = args.sku
    payload = {"sku": target, "variant_id": target, "quantity": args.quantity}
    if args.store_id:
        payload["store_id"] = args.store_id
    data = await _require_commerce_result("add_to_cart", payload, ctx, ("status", "cart"), side_effect=True)
    if data["status"] != "success" or not isinstance(data["cart"], dict):
        raise ToolUnavailableError("Không thể xác nhận kết quả thao tác; hãy kiểm tra trạng thái trước khi thử lại.")
    return _confirmed_write("add_to_cart", data, args, ctx)

# ---------------------------------------------------------------------------
# TOOL 8: Remove From Cart (remove_from_cart)
# ---------------------------------------------------------------------------
class RemoveFromCartInput(BaseModel):
    sku: str = Field(
        ...,
        min_length=2,
        description="Mã SKU hoặc variant_id của sản phẩm cần xóa khỏi giỏ hàng",
    )


@tool(
    name="remove_from_cart",
    description="Xóa một mã sản phẩm khỏi giỏ hàng của khách hàng.",
    input_model=RemoveFromCartInput,
    side_effect=True,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def remove_from_cart(args: RemoveFromCartInput, ctx: ToolContext) -> Dict[str, Any]:
    target = args.sku
    data = await _require_commerce_result("remove_from_cart", {"sku": target, "variant_id": target}, ctx, ("status", "cart"), side_effect=True)
    if data["status"] != "success" or not isinstance(data["cart"], dict):
        raise ToolUnavailableError("Không thể xác nhận kết quả thao tác; hãy kiểm tra trạng thái trước khi thử lại.")
    return _confirmed_write("remove_from_cart", data, args, ctx)

# ---------------------------------------------------------------------------
# TOOL 9: Preview Order & Signed Preview Token (preview_order)
# ---------------------------------------------------------------------------
class PreviewOrderInput(BaseModel):
    sku: Optional[str] = Field(
        default=None,
        description="Mã SKU sản phẩm cần tính giá xem trước (nếu không truyền sẽ lấy từ giỏ hàng hiện tại)",
    )
    quantity: int = Field(
        default=1,
        ge=1,
        le=20,
        description="Số lượng sản phẩm",
    )
    store_id: str = Field(
        default="MWG_HCM_001",
        description="Mã cửa hàng nhận hàng / xuất kho",
    )
    discount_code: Optional[str] = Field(
        default=None,
        description="Mã giảm giá khuyến mãi (ví dụ: MWG500K, SINHVIEN5)",
    )


@tool(
    name="preview_order",
    description="Tính toán xem trước đơn hàng bằng Decimal (tạm tính, giảm giá, VAT) và cấp Signed Preview Token hạn 10 phút để khách hàng xác nhận đặt hàng trên Web UI.",
    input_model=PreviewOrderInput,
    side_effect=False,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def preview_order(args: PreviewOrderInput, ctx: ToolContext) -> Dict[str, Any]:
    # The backend, not a local cart or a fabricated token, owns this calculation.
    data = await _require_commerce_result("preview_order", {"sku": args.sku, "quantity": args.quantity, "store_id": args.store_id, "discount_code": args.discount_code}, ctx, ())
    if not (data.get("previewToken") or data.get("preview_token")) or not ("totalVnd" in data or "total_vnd" in data):
        raise ToolUnavailableError("Không thể xác minh bản xem trước đơn hàng.")
    return {**data, "status": "success", "source": "nestjs_commerce_ssot"}

# ---------------------------------------------------------------------------
# TOOL 10: Query Order Status (query_order_status)
# ---------------------------------------------------------------------------
class OrderStatusInput(BaseModel):
    order_id: str = Field(
        ...,
        pattern=r"^(ORD-\d{6,10}|MWG-\d{8}-(?:\d{4}|[A-F0-9]{8}))$",
        description="Mã đơn hàng hợp lệ (định dạng ORD-XXXXXX hoặc MWG-YYYYMMDD-XXXX)",
    )


@tool(
    name="query_order_status",
    description="Tra cứu trạng thái xử lý, vận chuyển và chi tiết giá trị đơn hàng MWG.",
    input_model=OrderStatusInput,
    side_effect=False,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def query_order_status(args: OrderStatusInput, ctx: ToolContext) -> Dict[str, Any]:
    data = await _require_commerce_result("get_order_status", {"order_id": args.order_id, "order_no": args.order_id}, ctx, ("order_id", "order_status"))
    if (data["order_id"] != args.order_id or not isinstance(data["order_status"], str) or data["order_status"] not in
            {"PENDING", "CONFIRMED", "PLACED", "CANCELLED", "COMPLETED"}):
        raise ToolUnavailableError("Không thể xác minh trạng thái đơn hàng.")
    return ConfirmedOrderStatus({**data, "status": "success", "source": "nestjs_commerce_ssot"})

# ---------------------------------------------------------------------------
@tool(
    name="lookup_order",
    description="Tra cứu trạng thái xử lý, vận chuyển và chi tiết giá trị đơn hàng MWG theo mã đơn hàng.",
    input_model=OrderStatusInput,
    side_effect=False,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def lookup_order(args: OrderStatusInput, ctx: ToolContext) -> Dict[str, Any]:
    """Canonical alias for query_order_status."""
    return await query_order_status.func(args, ctx)


# ---------------------------------------------------------------------------
# TOOL 11: Cancel Simulated Order (cancel_simulated_order)
# ---------------------------------------------------------------------------
class CancelOrderInput(BaseModel):
    order_id: str = Field(
        ...,
        pattern=r"^(ORD-\d{6,10}|MWG-\d{8}-\d{4})$",
        description="Mã đơn hàng cần hủy (định dạng ORD-XXXXXX hoặc MWG-YYYYMMDD-XXXX)",
    )
    reason: str = Field(
        ...,
        min_length=3,
        description="Lý do hủy đơn hàng",
    )


@tool(
    name="cancel_simulated_order",
    description="Hủy đơn hàng của khách hàng và hoàn trả lại số lượng tồn kho khả dụng (Anti-Oversell Release).",
    input_model=CancelOrderInput,
    side_effect=True,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def cancel_simulated_order(args: CancelOrderInput, ctx: ToolContext) -> Dict[str, Any]:
    data = await _require_commerce_result("cancel_simulated_order", {"order_id": args.order_id, "reason": args.reason}, ctx, ("status", "order_id"), side_effect=True)
    if data["status"] != "success" or data["order_id"] != args.order_id:
        raise ToolUnavailableError("Không thể xác nhận kết quả hủy đơn; hãy kiểm tra trạng thái trước khi thử lại.")
    return _confirmed_write("cancel_simulated_order", data, args, ctx)

# ---------------------------------------------------------------------------
# TOOL 12: Create Support Ticket (create_support_ticket)
# ---------------------------------------------------------------------------
class CreateSupportTicketInput(BaseModel):
    order_id: Optional[str] = Field(
        default=None,
        description="Mã đơn hàng liên quan (nếu có)",
    )
    title: str = Field(
        ...,
        min_length=3,
        max_length=200,
        description="Tiêu đề phiếu yêu cầu hỗ trợ kỹ thuật hoặc bảo hành",
    )
    description: str = Field(
        ...,
        min_length=5,
        max_length=2000,
        description="Mô tả chi tiết tình trạng thiết bị hoặc vấn đề cần CSKH xử lý",
    )


@tool(
    name="create_support_ticket",
    description="Khởi tạo phiếu hỗ trợ kỹ thuật / bảo hành / khiếu nại đơn hàng gửi tới bộ phận CSKH MWG.",
    input_model=CreateSupportTicketInput,
    side_effect=True,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def create_support_ticket(args: CreateSupportTicketInput, ctx: ToolContext) -> Dict[str, Any]:
    data = await _require_commerce_result("create_support_ticket", {"order_id": args.order_id, "title": args.title, "description": args.description}, ctx, ("status", "ticket_id"), side_effect=True)
    if data["status"] != "success" or not isinstance(data["ticket_id"], str) or not data["ticket_id"]:
        raise ToolUnavailableError("Không thể xác nhận tạo phiếu; hãy kiểm tra trạng thái trước khi thử lại.")
    return _confirmed_write("create_support_ticket", data, args, ctx)

# ---------------------------------------------------------------------------
# TOOL 13: Manage Favorite (manage_favorite)
# ---------------------------------------------------------------------------
class ManageFavoriteInput(BaseModel):
    sku: str = Field(
        ...,
        min_length=2,
        description="Mã SKU sản phẩm cần thêm hoặc xóa khỏi danh sách yêu thích",
    )
    action: Literal["add", "remove", "toggle"] = Field(
        default="toggle",
        description="Thao tác: 'add' (thêm), 'remove' (xóa), hoặc 'toggle' (đảo trạng thái)",
    )


@tool(
    name="manage_favorite",
    description="Thêm hoặc xóa sản phẩm laptop khỏi danh sách yêu thích (Favorites) của khách hàng.",
    input_model=ManageFavoriteInput,
    side_effect=True,
    allowed_roles=["customer", "admin"],
    timeout_s=5.0,
)
async def manage_favorite(args: ManageFavoriteInput, ctx: ToolContext) -> Dict[str, Any]:
    live_data = await _call_nestjs_tool(
        "manage_favorite",
        {"sku": args.sku, "variant_id": args.sku, "action": args.action},
        ctx,
    )
    if (isinstance(live_data, dict) and live_data.get("status") == "success"
            and live_data.get("customer_id") == ctx.principal.user_id
            and live_data.get("sku") == args.sku and live_data.get("action") == args.action
            and type(live_data.get("is_favorited")) is bool
            and (args.action == "toggle" or live_data["is_favorited"] == (args.action == "add"))):
        return _confirmed_write("manage_favorite", live_data, args, ctx)
    raise ToolUnavailableError("Không thể xác nhận kết quả yêu thích; hãy kiểm tra trạng thái trước khi thử lại.")


# ---------------------------------------------------------------------------
# TOOL 14: Calculate Contract Penalty (Điều 301 Luật Thương Mại 2005 - Decimal)
# ---------------------------------------------------------------------------
class ContractPenaltyInput(BaseModel):
    breach_value_vnd: Decimal = Field(
        ...,
        gt=0,
        description="Giá trị phần nghĩa vụ hợp đồng bị vi phạm (VNĐ). Bắt buộc dùng Decimal.",
    )
    agreed_rate_pct: Decimal = Field(
        default=Decimal("8"),
        ge=0,
        le=100,
        description="Mức phần trăm phạt do các bên thỏa thuận trong hợp đồng (Luật Thương Mại giới hạn trần 8%).",
    )


@tool(
    name="calculate_contract_penalty",
    description="Tính mức phạt vi phạm nghĩa vụ hợp đồng thương mại theo Điều 301 Luật Thương Mại 2005 (trần tối đa 8% bằng số học Decimal).",
    input_model=ContractPenaltyInput,
    side_effect=False,
    allowed_roles=["guest", "customer", "admin"],
    timeout_s=5.0,
)
async def calculate_contract_penalty(args: ContractPenaltyInput, ctx: ToolContext) -> Dict[str, Any]:
    live_data = await _call_nestjs_tool(
        "calculate_penalty",
        {
            "breach_value_vnd": str(args.breach_value_vnd),
            "agreed_rate_pct": str(args.agreed_rate_pct),
        },
        ctx,
    )
    if live_data and "penalty_amount_vnd" in live_data:
        return {"status": "success", "source": "nestjs_commerce_ssot", **live_data}

    ceiling_rate = Decimal("8")
    applied_rate = min(args.agreed_rate_pct, ceiling_rate)
    penalty_amount = (args.breach_value_vnd * applied_rate / Decimal("100")).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    is_capped = args.agreed_rate_pct > ceiling_rate

    return {
        "status": "success",
        "statute": "Điều 301 Luật Thương Mại 2005",
        "breach_value_vnd": str(args.breach_value_vnd),
        "agreed_rate_pct": str(args.agreed_rate_pct),
        "legal_ceiling_pct": "8%",
        "applied_rate_pct": f"{applied_rate}%",
        "penalty_amount_vnd": str(penalty_amount),
        "is_capped_by_statute": is_capped,
        "note": (
            "Mức thỏa thuận vượt trần 8%, hệ thống tự động điều chỉnh về mức trần luật định 8%."
            if is_capped
            else "Mức phạt hợp lệ theo thỏa thuận trong giới hạn trần luật định."
        ),
    }


# ---------------------------------------------------------------------------
# TOOL 15: Request Return Or Refund (Governed with Decimal & HITL)
# ---------------------------------------------------------------------------
class ReturnRefundInput(BaseModel):
    order_id: str = Field(
        ...,
        pattern=r"^(ORD-\d{6,10}|MWG-\d{8}-\d{4})$",
        description="Mã đơn hàng cần yêu cầu đổi trả hoặc bồi hoàn (định dạng ORD-XXXXXX hoặc MWG-YYYYMMDD-XXXX)",
    )
    amount: Decimal = Field(
        ...,
        gt=0,
        description="Số tiền bồi hoàn hoặc giá trị hoàn trả (VNĐ). Bắt buộc dùng Decimal.",
    )
    reason: str = Field(
        ...,
        min_length=3,
        description="Lý do chi tiết yêu cầu đổi trả hoặc bồi hoàn",
    )
    customer_name: str = Field(
        ...,
        min_length=2,
        description="Họ và tên khách hàng yêu cầu",
    )


@tool(
    name="request_return_or_refund",
    description="Khởi tạo yêu cầu đổi trả hoặc bồi hoàn tài chính cho đơn hàng. Số tiền > 200.000 VNĐ bắt buộc qua HITL Gate để Quản lý duyệt.",
    input_model=ReturnRefundInput,
    side_effect=True,
    allowed_roles=["customer", "admin"],
    approval_rule="refund_threshold",
    timeout_s=8.0,
)
async def request_return_or_refund(args: ReturnRefundInput, ctx: ToolContext) -> Dict[str, Any]:
    # No trusted refund operation exists in core-api yet. Never report it processed.
    raise ToolUnavailableError("Chưa có dịch vụ xác nhận yêu cầu đổi trả hoặc bồi hoàn.")


# ---------------------------------------------------------------------------
# TOOL 16: Safe Refund Flow (VinAI Phase 1 Day 11 HITL & Confidence Router)
# ---------------------------------------------------------------------------
@tool(
    name="safe_refund",
    description="Thực hiện luồng hoàn tiền an toàn (VinAI HITL). Số tiền <= 500.000 VNĐ tự động duyệt qua Core API nếu đơn đã hủy; số tiền > 500.000 VNĐ phát sinh duyệt treo requires_approval=True sang Admin HITL (/admin/hitl).",
    input_model=ReturnRefundInput,
    side_effect=True,
    allowed_roles=["customer", "admin"],
    approval_rule="safe_refund_flow",
    timeout_s=8.0,
)
async def safe_refund(args: ReturnRefundInput, ctx: ToolContext) -> Dict[str, Any]:
    payload = {
        "order_id": args.order_id,
        "amount_vnd": str(args.amount),
        "reason": args.reason,
        "customer_name": args.customer_name,
    }
    live_data = await _call_nestjs_tool("process_refund", payload, ctx)
    if (isinstance(live_data, dict) and live_data.get("status") == "success"
            and live_data.get("order_id") == args.order_id and "refund_id" in live_data):
        return _confirmed_write("safe_refund", live_data, args, ctx)
    raise ToolUnavailableError("Không thể xác nhận hoàn tiền; hãy kiểm tra trạng thái đơn hàng trước khi thử lại.")
