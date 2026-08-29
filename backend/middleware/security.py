"""
Security middleware for EDEN VTC application.
Provides protection against common web attacks:
- Rate limiting (brute force protection)
- Security headers (XSS, clickjacking, MIME sniffing)
- Input sanitization
- Request size limiting
- IP-based blocking for suspicious activity
- Automatic alert logging to database
"""
import asyncio
import hashlib
import json
import logging
import re
import time
from collections import defaultdict
from datetime import datetime
from typing import Dict, Tuple

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Rate limiting storage (in-memory, per Lambda instance)
_rate_limit_store: Dict[str, list] = defaultdict(list)
_blocked_ips: Dict[str, float] = {}

# Alert queue for async DB writes
_alert_queue: list = []

# Configuration
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 200  # limite historique conservée pour les rapports admin
# Les lectures (GET) alimentent le polling temps réel de l'app (suivi de course,
# positions GPS, alertes). Elles sont peu coûteuses : leur quota est donc large.
RATE_LIMIT_READ_MAX = 600
# Les écritures modifient l'état métier : quota plus strict.
RATE_LIMIT_WRITE_MAX = 120
RATE_LIMIT_AUTH_MAX = 10  # max auth mutation attempts per window (login, register, etc.)
BLOCK_DURATION = 300  # 5 minutes block for suspicious IPs
MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10MB max request body

# Endpoints d'authentification sensibles au bourrage d'identifiants.
AUTH_MUTATION_PATHS = ("/login", "/register", "/reset-password", "/auth/callback")

# Quotas par classe de requête, sur RATE_LIMIT_WINDOW secondes.
_CLASS_LIMITS = {
    "auth": RATE_LIMIT_AUTH_MAX,
    "read": RATE_LIMIT_READ_MAX,
    "write": RATE_LIMIT_WRITE_MAX,
}

# Nettoyage périodique du magasin en mémoire pour éviter une croissance illimitée.
STORE_PRUNE_INTERVAL = 120
_last_prune = 0.0

# Suspicious patterns in request paths/params
SUSPICIOUS_PATTERNS = [
    r"(\.\./|\.\.\\)",  # Path traversal
    r"(<script|javascript:|\bon\w+\s*=)",  # XSS attempts (\b évite les faux positifs
    # sur des paramètres légitimes comme period_month=, action=, version=, session=)
    r"(union\s+select|drop\s+table|insert\s+into|delete\s+from)",  # SQL injection
    r"(\$\{|%24%7B)",  # Template injection
    r"(etc/passwd|etc/shadow|proc/self)",  # File inclusion
    r"(cmd=|exec=|system\(|eval\()",  # Command injection
]

SUSPICIOUS_REGEX = re.compile("|".join(SUSPICIOUS_PATTERNS), re.IGNORECASE)

# Pattern to alert type mapping
ALERT_TYPE_PATTERNS = [
    (r"(\.\./|\.\.\\)", "path_traversal"),
    (r"(<script|javascript:|\bon\w+\s*=)", "xss_attempt"),
    (r"(union\s+select|drop\s+table|insert\s+into|delete\s+from)", "sql_injection"),
    (r"(\$\{|%24%7B)", "template_injection"),
    (r"(etc/passwd|etc/shadow|proc/self)", "file_inclusion"),
    (r"(cmd=|exec=|system\(|eval\()", "command_injection"),
]


def _get_client_ip(request: Request) -> str:
    """Extract real client IP from request headers."""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip", "")
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


def _hash_ip(ip: str) -> str:
    """Hash IP for privacy-conscious logging."""
    return hashlib.sha256(ip.encode()).hexdigest()[:12]


def _detect_alert_type(request: Request) -> str:
    """Detect the specific type of attack from request."""
    path = request.url.path
    query_string = str(request.url.query)
    full_input = f"{path} {query_string}"

    for pattern, alert_type in ALERT_TYPE_PATTERNS:
        if re.search(pattern, full_input, re.IGNORECASE):
            return alert_type

    return "suspicious_request"


def _queue_alert(alert_type: str, severity: str, source_ip: str,
                 target_path: str, description: str, details: dict = None):
    """Queue a security alert for async database write."""
    _alert_queue.append({
        "alert_type": alert_type,
        "severity": severity,
        "source_ip": _hash_ip(source_ip),
        "target_path": target_path,
        "description": description,
        "details": json.dumps(details or {}),
        "is_resolved": False,
    })


async def flush_alerts():
    """Flush queued alerts to database. Called from background task."""
    if not _alert_queue:
        return

    try:
        from core.database import get_db_session
        from services.security_alerts import Security_alertsService

        async with get_db_session() as db:
            service = Security_alertsService(db)
            while _alert_queue:
                alert_data = _alert_queue.pop(0)
                try:
                    await service.create(alert_data)
                except Exception as e:
                    logger.error(f"Failed to save alert: {e}")
    except ImportError:
        # Fallback: just log if DB module not available
        while _alert_queue:
            alert = _alert_queue.pop(0)
            logger.warning(f"SECURITY_ALERT (not saved): {alert}")
    except Exception as e:
        logger.error(f"Error flushing alerts: {e}")


def _rate_limit_identity(request: Request, ip: str) -> str:
    """
    Construit la clé du compteur de requêtes.

    Le trafic authentifié est compté par session et non par IP : au Cameroun une
    grande partie des utilisateurs partagent la même adresse NAT opérateur, si
    bien qu'un compteur purement IP ferait bloquer une ville entière à cause
    d'un seul utilisateur intensif.
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer ") and len(auth_header) > 20:
        return "u:" + hashlib.sha256(auth_header.encode()).hexdigest()[:24]
    return "ip:" + ip


def _request_class(request: Request) -> str:
    """Classe la requête : auth sensible, lecture (polling) ou écriture."""
    path = request.url.path
    if any(p in path for p in AUTH_MUTATION_PATHS):
        return "auth"
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return "read"
    return "write"


def _prune_store(now: float) -> None:
    """Purge les compteurs expirés et les blocages arrivés à échéance."""
    global _last_prune
    if now - _last_prune < STORE_PRUNE_INTERVAL:
        return
    _last_prune = now

    for key in list(_rate_limit_store.keys()):
        kept = [t for t in _rate_limit_store[key] if now - t < RATE_LIMIT_WINDOW]
        if kept:
            _rate_limit_store[key] = kept
        else:
            del _rate_limit_store[key]

    for blocked_ip in list(_blocked_ips.keys()):
        if now >= _blocked_ips[blocked_ip]:
            del _blocked_ips[blocked_ip]


def _is_rate_limited(request: Request, ip: str) -> Tuple[bool, int, str]:
    """
    Vérifie le quota de requêtes.

    Returns:
        (limité, secondes avant nouvelle tentative, classe de requête)
    """
    now = time.time()
    _prune_store(now)

    req_class = _request_class(request)
    bucket = f"{_rate_limit_identity(request, ip)}|{req_class}"
    ip_hash = _hash_ip(ip)

    # Un blocage posé par le détecteur d'intrusion s'applique à toutes les classes.
    blocked_until = _blocked_ips.get(ip)
    if blocked_until is not None:
        if now < blocked_until:
            remaining = max(1, int(blocked_until - now))
            logger.warning(f"Blocked IP {ip_hash} attempted access, {remaining}s remaining")
            return True, remaining, req_class
        del _blocked_ips[ip]

    timestamps = [t for t in _rate_limit_store[bucket] if now - t < RATE_LIMIT_WINDOW]
    _rate_limit_store[bucket] = timestamps
    max_requests = _CLASS_LIMITS[req_class]

    if len(timestamps) >= max_requests:
        # Retry-After reflète la libération réelle du plus ancien créneau,
        # au lieu d'imposer systématiquement une minute complète d'attente.
        retry_after = max(1, int(RATE_LIMIT_WINDOW - (now - timestamps[0])) + 1)

        # Seuls le bourrage d'identifiants et les rafales d'écriture justifient
        # un blocage d'IP. Du polling en lecture n'est jamais une attaque.
        if req_class != "read" and len(timestamps) >= max_requests * 3:
            _blocked_ips[ip] = now + BLOCK_DURATION
            logger.warning(f"IP {ip_hash} blocked for {BLOCK_DURATION}s due to excessive requests")

        return True, retry_after, req_class

    timestamps.append(now)
    return False, 0, req_class


def _is_suspicious_request(request: Request) -> bool:
    """Detect suspicious patterns in the request."""
    path = request.url.path
    if SUSPICIOUS_REGEX.search(path):
        return True

    query_string = str(request.url.query)
    if SUSPICIOUS_REGEX.search(query_string):
        return True

    suspicious_headers = ["x-forwarded-host", "x-original-url", "x-rewrite-url"]
    for header in suspicious_headers:
        value = request.headers.get(header, "")
        if value and SUSPICIOUS_REGEX.search(value):
            return True

    return False


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(self), payment=(self)"
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https: blob:; "
            "connect-src 'self' https: wss:; "
            "frame-ancestors 'none';"
        )

        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware to prevent brute force and DDoS."""

    async def dispatch(self, request: Request, call_next) -> Response:
        client_ip = _get_client_ip(request)
        path = request.url.path

        # Skip rate limiting for health checks and CORS preflight
        if path == "/health" or request.method == "OPTIONS":
            return await call_next(request)

        # Check rate limit
        is_limited, retry_after, req_class = _is_rate_limited(request, client_ip)
        if is_limited:
            ip_hash = _hash_ip(client_ip)
            max_requests = _CLASS_LIMITS[req_class]
            logger.warning(
                f"Rate limit exceeded ({req_class}) for IP {ip_hash} on {path}"
            )

            # Le polling en lecture n'est pas un incident de sécurité : ne pas
            # inonder la table d'alertes (ce qui aggravait la charge backend).
            if req_class != "read":
                _queue_alert(
                    alert_type="rate_limit_exceeded",
                    severity="high" if req_class == "auth" else "medium",
                    source_ip=client_ip,
                    target_path=path,
                    description=(
                        f"Rate limit dépassé sur {path} "
                        f"({max_requests} req/{RATE_LIMIT_WINDOW}s, classe {req_class})"
                    ),
                    details={
                        "ip_hash": ip_hash,
                        "path": path,
                        "retry_after": retry_after,
                        "request_class": req_class,
                    },
                )
                asyncio.ensure_future(_safe_flush())

            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too many requests",
                    "message": (
                        "Trop de requêtes en peu de temps. "
                        "La connexion reprend automatiquement dans quelques instants."
                    ),
                    "retry_after": retry_after,
                    "request_class": req_class,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                },
            )

        return await call_next(request)


class RequestValidationMiddleware(BaseHTTPMiddleware):
    """Validate and sanitize incoming requests."""

    async def dispatch(self, request: Request, call_next) -> Response:
        client_ip = _get_client_ip(request)
        ip_hash = _hash_ip(client_ip)

        # Check for suspicious patterns
        if _is_suspicious_request(request):
            alert_type = _detect_alert_type(request)
            logger.warning(
                f"Suspicious request detected from IP {ip_hash}: "
                f"{request.method} {request.url.path} (type: {alert_type})"
            )

            # Block the IP temporarily
            _blocked_ips[client_ip] = time.time() + BLOCK_DURATION

            # Queue critical alert
            _queue_alert(
                alert_type=alert_type,
                severity="critical",
                source_ip=client_ip,
                target_path=request.url.path,
                description=f"Attaque {alert_type} détectée et bloquée depuis IP {ip_hash}",
                details={
                    "method": request.method,
                    "path": request.url.path,
                    "query": str(request.url.query)[:200],
                    "user_agent": request.headers.get("user-agent", "unknown")[:200],
                    "ip_hash": ip_hash,
                    "blocked_until": datetime.fromtimestamp(
                        _blocked_ips[client_ip]
                    ).isoformat(),
                }
            )

            # Try to flush alerts in background
            asyncio.ensure_future(_safe_flush())

            return JSONResponse(
                status_code=403,
                content={
                    "error": "Forbidden",
                    "message": "Requête suspecte détectée et bloquée.",
                },
            )

        # Check request size
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_SIZE:
            logger.warning(f"Request too large from IP {ip_hash}: {content_length} bytes")

            _queue_alert(
                alert_type="file_upload_violation",
                severity="medium",
                source_ip=client_ip,
                target_path=request.url.path,
                description=f"Requête surdimensionnée ({int(content_length) // 1024 // 1024}MB) bloquée",
                details={"content_length": content_length, "ip_hash": ip_hash}
            )

            asyncio.ensure_future(_safe_flush())

            return JSONResponse(
                status_code=413,
                content={
                    "error": "Request too large",
                    "message": "La taille de la requête dépasse la limite autorisée.",
                },
            )

        return await call_next(request)


async def _safe_flush():
    """Safely flush alerts, catching all exceptions."""
    try:
        await flush_alerts()
    except Exception as e:
        logger.error(f"Background alert flush failed: {e}")