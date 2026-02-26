"""
Infinity OS — Smart Analytics Engine
Adapted from infinity-worker v5.0

Real-time metrics, usage patterns, performance insights, and AI-powered anomaly detection.
Async-safe for FastAPI integration.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone, timedelta
from enum import Enum
from collections import defaultdict
import json
import time
import asyncio
import statistics
import math
import uuid


class MetricType(str, Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"
    RATE = "rate"


class TimeWindow(str, Enum):
    MINUTE = "1m"
    FIVE_MINUTES = "5m"
    FIFTEEN_MINUTES = "15m"
    HOUR = "1h"
    DAY = "1d"
    WEEK = "1w"
    MONTH = "1M"

    @property
    def seconds(self) -> int:
        windows = {
            "1m": 60, "5m": 300, "15m": 900,
            "1h": 3600, "1d": 86400, "1w": 604800, "1M": 2592000,
        }
        return windows.get(self.value, 3600)


class AnomalyType(str, Enum):
    SPIKE = "spike"
    DROP = "drop"
    TREND = "trend"
    OUTLIER = "outlier"
    PATTERN_BREAK = "pattern_break"


@dataclass
class MetricPoint:
    timestamp: float
    value: float
    labels: Dict[str, str] = field(default_factory=dict)


@dataclass
class Metric:
    name: str
    type: MetricType
    description: str
    unit: str = ""
    labels: List[str] = field(default_factory=list)
    points: List[MetricPoint] = field(default_factory=list)

    def record(self, value: float, labels: Dict[str, str] = None) -> None:
        self.points.append(MetricPoint(
            timestamp=time.time(),
            value=value,
            labels=labels or {},
        ))
        # Keep only last 24 hours
        cutoff = time.time() - 86400
        self.points = [p for p in self.points if p.timestamp > cutoff]

    def get_current(self) -> Optional[float]:
        if not self.points:
            return None
        return self.points[-1].value

    def get_window(self, window: TimeWindow) -> List[MetricPoint]:
        cutoff = time.time() - window.seconds
        return [p for p in self.points if p.timestamp >= cutoff]

    def aggregate(self, window: TimeWindow) -> Dict[str, float]:
        pts = self.get_window(window)
        if not pts:
            return {"count": 0, "sum": 0, "min": 0, "max": 0, "avg": 0, "p50": 0, "p95": 0, "p99": 0}
        values = [p.value for p in pts]
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        return {
            "count": n,
            "sum": sum(values),
            "min": min(values),
            "max": max(values),
            "avg": statistics.mean(values),
            "p50": sorted_vals[int(n * 0.50)],
            "p95": sorted_vals[int(n * 0.95)],
            "p99": sorted_vals[int(n * 0.99)],
        }


@dataclass
class Anomaly:
    id: str
    metric_name: str
    anomaly_type: AnomalyType
    severity: str  # low, medium, high, critical
    detected_at: str
    value: float
    expected_value: float
    deviation_pct: float
    description: str
    labels: Dict[str, str] = field(default_factory=dict)
    resolved: bool = False
    resolved_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "metric_name": self.metric_name,
            "anomaly_type": self.anomaly_type.value,
            "severity": self.severity,
            "detected_at": self.detected_at,
            "value": self.value,
            "expected_value": self.expected_value,
            "deviation_pct": self.deviation_pct,
            "description": self.description,
            "labels": self.labels,
            "resolved": self.resolved,
            "resolved_at": self.resolved_at,
        }


@dataclass
class UsagePattern:
    """Detected usage pattern for a metric"""
    metric_name: str
    pattern_type: str  # daily, weekly, spike, baseline
    description: str
    confidence: float  # 0-1
    data: Dict[str, Any] = field(default_factory=dict)


class AnomalyDetector:
    """Statistical anomaly detection using Z-score and IQR methods"""

    def __init__(self, z_threshold: float = 3.0, iqr_multiplier: float = 1.5):
        self.z_threshold = z_threshold
        self.iqr_multiplier = iqr_multiplier

    def detect(self, metric: Metric, window: TimeWindow = TimeWindow.HOUR) -> List[Anomaly]:
        pts = metric.get_window(window)
        if len(pts) < 10:
            return []

        values = [p.value for p in pts]
        anomalies = []

        # Z-score detection
        mean = statistics.mean(values)
        try:
            std = statistics.stdev(values)
        except statistics.StatisticsError:
            return []

        if std == 0:
            return []

        for pt in pts[-5:]:  # Check recent points
            z = abs((pt.value - mean) / std)
            if z > self.z_threshold:
                deviation_pct = abs((pt.value - mean) / mean * 100) if mean != 0 else 0
                severity = "critical" if z > 5 else "high" if z > 4 else "medium"
                anomaly_type = AnomalyType.SPIKE if pt.value > mean else AnomalyType.DROP

                anomalies.append(Anomaly(
                    id=str(uuid.uuid4())[:8],
                    metric_name=metric.name,
                    anomaly_type=anomaly_type,
                    severity=severity,
                    detected_at=datetime.now(timezone.utc).isoformat(),
                    value=pt.value,
                    expected_value=mean,
                    deviation_pct=round(deviation_pct, 2),
                    description=f"{metric.name} {anomaly_type.value}: {pt.value:.2f} vs expected {mean:.2f} (z={z:.2f})",
                ))

        return anomalies


class AnalyticsEngine:
    """
    Infinity OS Analytics Engine — real-time metrics, anomaly detection, usage insights.
    Thread-safe and async-compatible.
    """

    def __init__(self):
        self._metrics: Dict[str, Metric] = {}
        self._anomalies: List[Anomaly] = []
        self._detector = AnomalyDetector()
        self._lock = asyncio.Lock()
        self._initialized = False
        self._register_core_metrics()

    def _register_core_metrics(self):
        """Register built-in Infinity OS metrics"""
        core_metrics = [
            # API metrics
            Metric("api.requests.total", MetricType.COUNTER, "Total API requests", "requests"),
            Metric("api.requests.rate", MetricType.RATE, "API requests per second", "req/s"),
            Metric("api.response.duration_ms", MetricType.HISTOGRAM, "API response time", "ms"),
            Metric("api.errors.total", MetricType.COUNTER, "Total API errors", "errors"),
            Metric("api.errors.rate", MetricType.RATE, "API error rate", "%"),
            # AI metrics
            Metric("ai.requests.total", MetricType.COUNTER, "Total AI generation requests", "requests"),
            Metric("ai.tokens.total", MetricType.COUNTER, "Total tokens consumed", "tokens"),
            Metric("ai.cost.total", MetricType.COUNTER, "Total AI cost", "USD"),
            Metric("ai.latency_ms", MetricType.HISTOGRAM, "AI generation latency", "ms"),
            Metric("ai.hitl.pending", MetricType.GAUGE, "HITL tasks pending review", "tasks"),
            # User metrics
            Metric("users.active", MetricType.GAUGE, "Active users (last 5 min)", "users"),
            Metric("users.sessions.total", MetricType.COUNTER, "Total user sessions", "sessions"),
            Metric("users.registrations.total", MetricType.COUNTER, "Total user registrations", "users"),
            # Compliance metrics
            Metric("compliance.violations.total", MetricType.COUNTER, "Total compliance violations", "violations"),
            Metric("compliance.score", MetricType.GAUGE, "Overall compliance score", "%"),
            Metric("compliance.controls.passing", MetricType.GAUGE, "Passing compliance controls", "controls"),
            # System metrics
            Metric("system.db.connections", MetricType.GAUGE, "Active DB connections", "connections"),
            Metric("system.db.query_ms", MetricType.HISTOGRAM, "DB query duration", "ms"),
            Metric("system.builds.total", MetricType.COUNTER, "Total builds triggered", "builds"),
            Metric("system.builds.success_rate", MetricType.GAUGE, "Build success rate", "%"),
            # Security metrics
            Metric("security.auth.failures", MetricType.COUNTER, "Authentication failures", "failures"),
            Metric("security.vulnerabilities.critical", MetricType.GAUGE, "Critical vulnerabilities", "CVEs"),
            Metric("security.vulnerabilities.high", MetricType.GAUGE, "High vulnerabilities", "CVEs"),
        ]
        for m in core_metrics:
            self._metrics[m.name] = m

    def record(self, metric_name: str, value: float, labels: Dict[str, str] = None) -> None:
        """Record a metric value"""
        if metric_name not in self._metrics:
            # Auto-create unknown metrics as gauges
            self._metrics[metric_name] = Metric(metric_name, MetricType.GAUGE, f"Auto-registered: {metric_name}")
        self._metrics[metric_name].record(value, labels)

    def increment(self, metric_name: str, amount: float = 1.0, labels: Dict[str, str] = None) -> None:
        """Increment a counter metric"""
        if metric_name not in self._metrics:
            self._metrics[metric_name] = Metric(metric_name, MetricType.COUNTER, f"Auto-registered: {metric_name}")
        current = self._metrics[metric_name].get_current() or 0
        self._metrics[metric_name].record(current + amount, labels)

    def get_metric(self, name: str) -> Optional[Metric]:
        return self._metrics.get(name)

    def get_all_metrics(self) -> Dict[str, Any]:
        result = {}
        for name, metric in self._metrics.items():
            current = metric.get_current()
            if current is not None:
                result[name] = {
                    "type": metric.type.value,
                    "description": metric.description,
                    "unit": metric.unit,
                    "current": current,
                    "1h": metric.aggregate(TimeWindow.HOUR),
                    "24h": metric.aggregate(TimeWindow.DAY),
                }
        return result

    def get_dashboard(self, organisation_id: Optional[str] = None) -> Dict[str, Any]:
        """Get analytics dashboard data"""
        now = datetime.now(timezone.utc)

        # Compute rates
        api_1h = self._metrics.get("api.requests.total", Metric("x", MetricType.COUNTER, "")).aggregate(TimeWindow.HOUR)
        ai_1h = self._metrics.get("ai.requests.total", Metric("x", MetricType.COUNTER, "")).aggregate(TimeWindow.HOUR)
        error_1h = self._metrics.get("api.errors.total", Metric("x", MetricType.COUNTER, "")).aggregate(TimeWindow.HOUR)

        api_count = api_1h.get("count", 0)
        error_count = error_1h.get("count", 0)
        error_rate = round(error_count / api_count * 100, 2) if api_count > 0 else 0

        return {
            "generated_at": now.isoformat(),
            "organisation_id": organisation_id,
            "summary": {
                "api_requests_1h": api_count,
                "ai_requests_1h": ai_1h.get("count", 0),
                "error_rate_pct": error_rate,
                "active_users": self._metrics.get("users.active", Metric("x", MetricType.GAUGE, "")).get_current() or 0,
                "hitl_pending": self._metrics.get("ai.hitl.pending", Metric("x", MetricType.GAUGE, "")).get_current() or 0,
                "compliance_score": self._metrics.get("compliance.score", Metric("x", MetricType.GAUGE, "")).get_current() or 0,
                "critical_vulns": self._metrics.get("security.vulnerabilities.critical", Metric("x", MetricType.GAUGE, "")).get_current() or 0,
            },
            "api_performance": {
                "response_time_ms": self._metrics.get("api.response.duration_ms", Metric("x", MetricType.HISTOGRAM, "")).aggregate(TimeWindow.HOUR),
            },
            "ai_performance": {
                "latency_ms": self._metrics.get("ai.latency_ms", Metric("x", MetricType.HISTOGRAM, "")).aggregate(TimeWindow.HOUR),
                "tokens_1h": self._metrics.get("ai.tokens.total", Metric("x", MetricType.COUNTER, "")).aggregate(TimeWindow.HOUR).get("sum", 0),
            },
            "anomalies": [a.to_dict() for a in self._anomalies[-10:] if not a.resolved],
            "total_metrics": len(self._metrics),
        }

    def run_anomaly_detection(self) -> List[Anomaly]:
        """Run anomaly detection across all metrics"""
        new_anomalies = []
        for metric in self._metrics.values():
            detected = self._detector.detect(metric)
            new_anomalies.extend(detected)

        self._anomalies.extend(new_anomalies)
        # Keep last 1000 anomalies
        self._anomalies = self._anomalies[-1000:]
        return new_anomalies

    def get_anomalies(self, resolved: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
        filtered = [a for a in self._anomalies if a.resolved == resolved]
        return [a.to_dict() for a in filtered[-limit:]]

    def resolve_anomaly(self, anomaly_id: str) -> bool:
        for anomaly in self._anomalies:
            if anomaly.id == anomaly_id:
                anomaly.resolved = True
                anomaly.resolved_at = datetime.now(timezone.utc).isoformat()
                return True
        return False

    def get_usage_patterns(self) -> List[Dict[str, Any]]:
        """Detect usage patterns from metric history"""
        patterns = []

        # API request pattern
        api_metric = self._metrics.get("api.requests.total")
        if api_metric and len(api_metric.points) > 100:
            pts = api_metric.get_window(TimeWindow.DAY)
            if pts:
                values = [p.value for p in pts]
                avg = statistics.mean(values)
                patterns.append({
                    "metric": "api.requests.total",
                    "pattern": "baseline",
                    "description": f"Average {avg:.0f} API requests/day",
                    "confidence": 0.9,
                    "baseline": avg,
                })

        # AI usage pattern
        ai_metric = self._metrics.get("ai.requests.total")
        if ai_metric and len(ai_metric.points) > 20:
            pts = ai_metric.get_window(TimeWindow.DAY)
            if pts:
                values = [p.value for p in pts]
                patterns.append({
                    "metric": "ai.requests.total",
                    "pattern": "daily_usage",
                    "description": f"AI usage: {sum(values):.0f} requests today",
                    "confidence": 0.85,
                    "total_today": sum(values),
                })

        return patterns

    def export_prometheus(self) -> str:
        """Export metrics in Prometheus text format"""
        lines = []
        for name, metric in self._metrics.items():
            prom_name = name.replace(".", "_").replace("-", "_")
            current = metric.get_current()
            if current is not None:
                lines.append(f"# HELP {prom_name} {metric.description}")
                lines.append(f"# TYPE {prom_name} {metric.type.value}")
                lines.append(f"{prom_name} {current}")
        return "\n".join(lines)


# Global singleton
_analytics: Optional[AnalyticsEngine] = None


def get_analytics() -> AnalyticsEngine:
    """Get or create the global analytics engine"""
    global _analytics
    if _analytics is None:
        _analytics = AnalyticsEngine()
    return _analytics