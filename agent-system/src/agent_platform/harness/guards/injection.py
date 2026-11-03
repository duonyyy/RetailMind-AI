import re
from typing import List, Tuple, Optional
from agent_platform.harness.guards.sanitizer import InputSanitizer

# Multi-layered Adversarial Injection Patterns (Adapted from VinAI Day 11, Track 2 Day 24 & Track 3 Day 24)
INJECTION_PATTERNS: List[re.Pattern] = [
    # 1. Instruction Override & Policy Erasure (Anh + Việt)
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?(previous|prior|above)\s+instructions?", re.IGNORECASE),
    re.compile(r"forget\s+(all\s+)?(previous|prior)\s+(instructions?|prompt|rules?)", re.IGNORECASE),
    re.compile(r"bỏ\s+qua\s+(hết\s+|toàn\s+bộ\s+|mọi\s+|tất\s+cả\s+)?(các\s+)?(hướng\s+dẫn|chỉ\s+dẫn|chỉ\s+thị|yêu\s+cầu|quy\s+tắc|policy|quy\s+định)(\s*(trước|nội\s+bộ|hệ\s+thống))?", re.IGNORECASE),
    re.compile(r"quên\s+(hết\s+|toàn\s+bộ\s+|mọi\s+|tất\s+cả\s+)?(các\s+)?(chỉ\s+dẫn|hướng\s+dẫn|quy\s+tắc|system\s*prompt)", re.IGNORECASE),
    re.compile(r"lờ\s+đi\s+(mọi\s+)?(hướng\s+dẫn|chỉ\s+thị|quy\s+định|policy)", re.IGNORECASE),

    # 2. Jailbreak, DAN mode, Roleplay & Unrestricted Persona
    re.compile(r"you\s+are\s+now\s+(in\s+)?(dan|developer|unrestricted|jailbreak)\s+mode", re.IGNORECASE),
    re.compile(r"\bdan\s+mode\b|\bdo\s+anything\s+now\b", re.IGNORECASE),
    re.compile(r"act\s+as\s+(a\s+|an\s+)?(unrestricted|jailbroken|root|developer)\s*(ai|assistant)?", re.IGNORECASE),
    re.compile(r"you\s+must\s+act\s+as\b", re.IGNORECASE),
    re.compile(r"pretend\s+you\s+are\b", re.IGNORECASE),
    re.compile(r"(hãy\s+)?đóng\s+vai\s+(một\s+)?(ai|trợ\s+lý|chuyên\s+gia|admin|quản\s+trị\s+viên)\s*(không\s+giới\s+hạn|vô\s+hạn|jailbreak|bỏ\s+qua\s+quy\s+tắc)", re.IGNORECASE),
    re.compile(r"chế\s+độ\s+(không\s+giới\s+hạn|developer|bảo\s+trì\s+khẩn\s+cấp)", re.IGNORECASE),

    # 3. Authority Impersonation & Fake System Directives (VinAI Day 24 / Track 3 Day 24)
    re.compile(r"system\s*:\s*(override|order|bypass)", re.IGNORECASE),
    re.compile(r"\[?system\s*(prompt\s*)?(override|order|note|command)\]?", re.IGNORECASE),
    re.compile(r"(superadmin|root\s*admin|chế\s+độ\s+superadmin)", re.IGNORECASE),
    re.compile(r"\[admin\s+command[^\]]*\]", re.IGNORECASE),
    re.compile(r"chỉ\s+thị\s+từ\s+(admin|hệ\s+thống|dpo|ban\s+giám\s+đốc|ceo|quản\s+trị\s+viên)", re.IGNORECASE),
    re.compile(r"ghi\s+chú\s+nội\s+bộ(\s+cho\s+hệ\s+thống)?", re.IGNORECASE),
    re.compile(r"(dpo|admin|ban\s+giám\s+đốc|ceo)\s+(đã\s+)?(phê\s+duyệt|ra\s+lệnh|bảo\s+lãnh)", re.IGNORECASE),

    # 4. Prompt Leaking & Secret Revelation (VinAI Day 11)
    re.compile(r"reveal\s+your\s+(system\s+)?(prompt|instructions?|secret|api[_-]?key|password)", re.IGNORECASE),
    re.compile(r"(cho\s+tôi\s+biết|in\s+ra|tiết\s+lộ|hiển\s+thị)\s+(toàn\s+bộ\s+)?(system\s*prompt|hướng\s+dẫn\s+hệ\s+thống|lệnh\s+gốc|bí\s+mật)", re.IGNORECASE),
    re.compile(r"print\s+(all\s+)?(system\s+instructions?|initial\s+prompt)", re.IGNORECASE),
    re.compile(r"what\s+is\s+your\s+initial\s+system\s+prompt", re.IGNORECASE),
    re.compile(r"dump\s+all\s+(training\s+data|employee\s+records|system\s+prompt)", re.IGNORECASE),

    # 5. Data Exfiltration Lures (VinAI Day 24 Track 2)
    re.compile(r"!\[.*?\]\(https?://[^\s)]*(exfil|sink|steal|hook|collect)[^\s)]*\)", re.IGNORECASE),
    re.compile(r"\b(exfil|exfiltrate|exfiltration)\b", re.IGNORECASE),
    re.compile(r"send_to_sink", re.IGNORECASE),
    re.compile(r"(gửi|post)\s+(toàn\s+bộ\s+)?(cccd|sđt|dữ\s+liệu)\s+tới\s+https?://", re.IGNORECASE),
]

# High-Risk Unaccented Markers (Matches teencode / unaccented injection attempts from VinAI Day 24 agent/llm.py)
HIGH_RISK_INSTRUCTION_MARKERS = [
    "ghi chu noi bo",
    "bat buoc phai lam",
    "da duoc phe duyet",
    "chi thi tu admin",
    "chi thi tu dpo",
    "system note",
    "quan tri vien he thong",
    "bo qua huong dan",
    "quen chi dan",
    "xuat system prompt",
    "tiet lo bi mat",
    "gui cccd",
    "gui so dien thoai",
    "exfil",
    "send_to_sink",
]

# Malicious Off-Topic & Harmful Prohibited Content (VinAI Day 11)
HARMFUL_PROHIBITED_PATTERNS: List[re.Pattern] = [
    re.compile(r"(hướng\s+dẫn|cách|viết)\s+(tấn\s+công\s+mạng|mã\s+độc|malware|ddos|khai\s+thác\s+lỗ\s+hổng)", re.IGNORECASE),
    re.compile(r"(cách|hướng\s+dẫn)\s+(chế\s+tạo\s+bom|làm\s+thuốc\s+độc|chế\s+vũ\s+khí)", re.IGNORECASE),
    re.compile(r"(trang\s+web\s+giả\s+mạo|lừa\s+đảo\s+lấy\s+mã\s+otp)", re.IGNORECASE),
]


class PromptInjectionDetector:
    """Multi-tiered Adversarial Injection & Jailbreak Detector for RetailMind AI.
    
    Incorporates battle-tested defenses from:
    - VinAI Phase 1 Day 11 (5-tier Guardrails & Normalization)
    - VinAI Track 2 Day 24 (Lethal Trifecta & Multi-marker Unaccented Scoring)
    - VinAI Track 3 Day 24 (NeMo Colang Flows & Adversarial Set 20)
    """

    @staticmethod
    def is_injection(text: str) -> bool:
        if not text:
            return False

        # 1. Regex Pattern Scan on sanitized text (including unboxed HTML comments & decoded base64)
        for pattern in INJECTION_PATTERNS:
            if pattern.search(text):
                return True

        # 2. Harmful Prohibited Content Scan
        for pattern in HARMFUL_PROHIBITED_PATTERNS:
            if pattern.search(text):
                return True

        # 3. Multi-marker Unaccented Scoring (VinAI Day 24 find_injection algorithm)
        # Strips diacritics and checks for co-occurrence of >= 2 high-risk markers
        unaccented = InputSanitizer.strip_accents(text)
        matched_markers = [m for m in HIGH_RISK_INSTRUCTION_MARKERS if m in unaccented]
        if len(matched_markers) >= 2:
            return True

        return False

    @staticmethod
    def check_safety(text: str) -> Tuple[bool, Optional[str]]:
        """Returns (is_safe, refusal_reason)."""
        if not text:
            return True, None
        if PromptInjectionDetector.is_injection(text):
            return False, "Yêu cầu của bạn bị từ chối do vi phạm quy chuẩn an toàn bảo mật hệ thống."
        return True, None

