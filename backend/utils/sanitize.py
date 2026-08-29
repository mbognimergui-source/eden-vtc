"""
Input sanitization utilities for EDEN VTC.
Protects against XSS, SQL injection, and other injection attacks.
"""
import html
import re
from typing import Any, Dict, Optional


# Patterns that should never appear in user input
_DANGEROUS_PATTERNS = [
    re.compile(r"<script[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),
    re.compile(r"data:text/html", re.IGNORECASE),
    re.compile(r"vbscript:", re.IGNORECASE),
]

# SQL injection patterns
_SQL_PATTERNS = [
    re.compile(r"\b(union\s+select|drop\s+table|insert\s+into|delete\s+from|update\s+\w+\s+set)\b", re.IGNORECASE),
    re.compile(r"(--|#|/\*|\*/)", re.IGNORECASE),
    re.compile(r"(\bor\b|\band\b)\s+\d+\s*=\s*\d+", re.IGNORECASE),
]


def sanitize_string(value: str, max_length: int = 10000) -> str:
    """
    Sanitize a string input:
    - Escape HTML entities
    - Remove dangerous patterns
    - Trim to max length
    """
    if not value:
        return value

    # Trim length
    value = value[:max_length]

    # Escape HTML entities
    value = html.escape(value, quote=True)

    # Remove null bytes
    value = value.replace("\x00", "")

    return value


def sanitize_html_content(value: str) -> str:
    """
    Remove dangerous HTML/JS patterns from a string.
    Use this for fields that might contain rich text.
    """
    if not value:
        return value

    for pattern in _DANGEROUS_PATTERNS:
        value = pattern.sub("", value)

    return value


def is_sql_injection_attempt(value: str) -> bool:
    """Check if a string contains SQL injection patterns."""
    if not value:
        return False

    for pattern in _SQL_PATTERNS:
        if pattern.search(value):
            return True

    return False


def sanitize_dict(data: Dict[str, Any], max_string_length: int = 10000) -> Dict[str, Any]:
    """
    Recursively sanitize all string values in a dictionary.
    """
    sanitized = {}
    for key, value in data.items():
        if isinstance(value, str):
            sanitized[key] = sanitize_string(value, max_string_length)
        elif isinstance(value, dict):
            sanitized[key] = sanitize_dict(value, max_string_length)
        elif isinstance(value, list):
            sanitized[key] = [
                sanitize_string(item, max_string_length) if isinstance(item, str)
                else sanitize_dict(item, max_string_length) if isinstance(item, dict)
                else item
                for item in value
            ]
        else:
            sanitized[key] = value
    return sanitized


def validate_email(email: str) -> bool:
    """Validate email format to prevent injection."""
    pattern = re.compile(
        r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    )
    return bool(pattern.match(email)) and len(email) <= 254


def validate_phone(phone: str) -> bool:
    """Validate phone number format."""
    # Allow international format with optional + prefix
    pattern = re.compile(r"^\+?[0-9\s\-()]{7,20}$")
    return bool(pattern.match(phone))


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename to prevent path traversal."""
    # Remove path separators and dangerous characters
    filename = re.sub(r"[/\\]", "", filename)
    filename = re.sub(r"\.\.", "", filename)
    filename = re.sub(r"[^\w\s\-.]", "", filename)
    return filename[:255]  # Max filename length