"""Output Guardrail Engine for RetailMind AI.

Adapted from:
- VinAI Phase 1 Day 11 (Output Guardrail & Content Redaction)
- VinAI Track 3 Day 24 (NeMo Output Rail & Sensitive Fact Protection)

Guarantees that responses emitted by the Agent:
1. Do not contain unauthorized Markdown Image links (preventing image-based data exfiltration).
2. Do not leak credentials, bearer tokens, or internal API secrets.
3. Do not contain phishing patterns (e.g., requesting OTP, personal bank transfer).
"""

from __future__ import annotations

import logging
import re
from typing import Dict, Any, List, Tuple

logger = logging.getLogger("agent_platform.guards.output")

# 1. Markdown Image Exfiltration Detector
# Matches ![alt](http://...)
MD_IMAGE_REGEX = re.compile(r"!\[(.*?)\]\((https?://[^\s)]+)\)", re.IGNORECASE)

# Whitelist of allowed image CDN domains for RetailMind / MWG
ALLOWED_IMAGE_DOMAINS = (
    "cdn.tgdd.vn",
    "cdn.dienmayxanh.com",
    "mwg.vn",
    "retailmind.internal",
)

# High-risk Exfiltration Indicators in Image URLs
EXFIL_INDICATORS = ("exfil", "sink", "steal", "hook", "collect", "cccd=", "phone=", "pass=", "token=")


# 2. Secret & Token Leakage Patterns
SECRET_LEAKAGE_PATTERNS = [
    re.compile(r"\bsk-[a-zA-Z0-9_-]{20,}\b", re.IGNORECASE),
    re.compile(r"\bBearer\s+[a-zA-Z0-9_\-\.]{20,}\b", re.IGNORECASE),
    re.compile(r"\bsecret_token_\w+\b", re.IGNORECASE),
    re.compile(r"\b[a-f0-9]{32,64}\b", re.IGNORECASE),  # Raw API key / hashes if labelled as key
]

# 3. Phishing & Social Engineering Traps
PHISHING_PATTERNS = [
    re.compile(r"(chuyển\s+khoản\s+vào\s+stk\s+cá\s+nhân|gửi\s+tiền\s+vào\s+tài\s+khoản\s+riêng)", re.IGNORECASE),
    re.compile(r"(cung\s+cấp|gửi\s+cho\s+tôi)\s+(mã\s+otp|mật\s+khẩu\s+đăng\s+nhập|mã\s+cvv)", re.IGNORECASE),
]


class OutputGuardrail:
    """Sanitizes and enforces security boundaries on model output before emission."""

    @staticmethod
    def sanitize(output_text: str) -> str:
        if not output_text:
            return ""

        sanitized = output_text

        # 1. Neutralize Markdown Image Exfiltration
        def _replace_image(match: re.Match) -> str:
            alt_text = match.group(1) or "Image"
            url = match.group(2)
            url_lower = url.lower()

            # Always block exfiltration patterns or sensitive query parameters
            if any(ind in url_lower for ind in EXFIL_INDICATORS):
                logger.warning("OutputGuardrail: Blocked exfiltration image link: %s", url)
                return f"[Hình ảnh: {alt_text}]"

            # Check if domain is allowed
            is_allowed = any(domain in url_lower for domain in ALLOWED_IMAGE_DOMAINS)
            if not is_allowed:
                logger.warning("OutputGuardrail: Blocked untrusted markdown image URL: %s", url)
                return f"[Hình ảnh: {alt_text}]"
            return match.group(0)


        sanitized = MD_IMAGE_REGEX.sub(_replace_image, sanitized)

        # 2. Redact Leaked Secrets
        for pattern in SECRET_LEAKAGE_PATTERNS:
            sanitized = pattern.sub("[REDACTED_SECRET]", sanitized)

        # 3. Check Phishing Traps
        for pattern in PHISHING_PATTERNS:
            if pattern.search(sanitized):
                logger.error("OutputGuardrail: Detected phishing pattern in response: %s", sanitized[:100])
                return (
                    "Lưu ý an toàn: Nhân viên và hệ thống RetailMind AI tuyệt đối không bao giờ "
                    "yêu cầu cung cấp mã OTP, mật khẩu hay chuyển tiền vào tài khoản cá nhân. "
                    "Vui lòng liên hệ tổng đài chính thức để được hỗ trợ."
                )

        return sanitized
