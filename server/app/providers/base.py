"""Base provider abstractions, health monitoring, and connection watchdogs."""
import time
from typing import Optional, Dict, Any
from app.models import ProviderStatus, ProviderHealth

class BaseProvider:
    def __init__(self, name: str, endpoint: str):
        self.name = name
        self.endpoint = endpoint
        self.status = ProviderStatus.OK
        self.last_success_utc: Optional[str] = None
        self.last_attempt_utc: Optional[str] = None
        self.last_success_monotonic: float = 0.0
        self.consecutive_failures: int = 0
        self.records_retrieved: int = 0
        self.last_latency_ms: Optional[float] = None
        self.last_error_message: Optional[str] = None

    def record_success(self, count: int, latency_ms: float, timestamp_iso: str):
        self.status = ProviderStatus.OK
        self.consecutive_failures = 0
        self.last_success_utc = timestamp_iso
        self.last_attempt_utc = timestamp_iso
        self.last_success_monotonic = time.monotonic()
        self.records_retrieved = count
        self.last_latency_ms = round(latency_ms, 1)
        self.last_error_message = None

    def record_failure(self, message: str, timestamp_iso: str):
        self.consecutive_failures += 1
        self.last_attempt_utc = timestamp_iso
        self.last_error_message = message
        if self.consecutive_failures >= 3:
            self.status = ProviderStatus.DOWN
        else:
            self.status = ProviderStatus.DEGRADED

    def get_health(self) -> ProviderHealth:
        return ProviderHealth(
            provider=self.name,
            status=self.status,
            endpoint=self.endpoint,
            lastSuccessUtc=self.last_success_utc,
            lastAttemptUtc=self.last_attempt_utc,
            latencyMs=self.last_latency_ms,
            recordsRetrieved=self.records_retrieved,
            failureCount=self.consecutive_failures,
            message=self.last_error_message
        )

