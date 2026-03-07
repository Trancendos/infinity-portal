"""
Infinity Worker - Smart Analytics Engine
Real-time metrics, usage patterns, performance insights, and AI-powered anomaly detection
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone, timedelta
from enum import Enum
from collections import defaultdict
import json
import time
import threading
import statistics
import math


class MetricType(str, Enum):
    """Types of metrics"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"
    RATE = "rate"


class TimeWindow(str, Enum):
    """Time windows for aggregation"""
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
            "1m": 60,
            "5m": 300,
            "15m": 900,
            "1h": 3600,
            "1d": 86400,
            "1w": 604800,
            "1M": 2592000
        }
        return windows.get(self.value, 3600)


@dataclass
class MetricPoint:
    """A single metric data point"""
    timestamp: float
    value: float
    labels: Dict[str, str] = field(default_factory=dict)


@dataclass
class Metric:
    """A metric with its data points"""
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
            labels=labels or {}
        ))
        # Keep only last 24 hours of data
        cutoff = time.time() - 86400
        self.points = [p for p in self.points if p.timestamp > cutoff]
    
    def get_current(self) -> Optional[float]:
        if not self.points:
            return None
        return self.points[-1].value
    
    def get_sum(self, window: TimeWindow = TimeWindow.HOUR) -> float:
        cutoff = time.time() - window.seconds
        return sum(p.value for p in self.points if p.timestamp > cutoff)
    
    def get_avg(self, window: TimeWindow = TimeWindow.HOUR) -> Optional[float]:
        cutoff = time.time() - window.seconds
        values = [p.value for p in self.points if p.timestamp > cutoff]
        return statistics.mean(values) if values else None
    
    def get_min(self, window: TimeWindow = TimeWindow.HOUR) -> Optional[float]:
        cutoff = time.time() - window.seconds
        values = [p.value for p in self.points if p.timestamp > cutoff]
        return min(values) if values else None
    
    def get_max(self, window: TimeWindow = TimeWindow.HOUR) -> Optional[float]:
        cutoff = time.time() - window.seconds
        values = [p.value for p in self.points if p.timestamp > cutoff]
        return max(values) if values else None
    
    def get_percentile(self, percentile: float, window: TimeWindow = TimeWindow.HOUR) -> Optional[float]:
        cutoff = time.time() - window.seconds
        values = sorted([p.value for p in self.points if p.timestamp > cutoff])
        if not values:
            return None
        index = int(len(values) * percentile / 100)
        return values[min(index, len(values) - 1)]
    
    def get_rate(self, window: TimeWindow = TimeWindow.MINUTE) -> float:
        """Get rate per second over the window"""
        cutoff = time.time() - window.seconds
        count = sum(1 for p in self.points if p.timestamp > cutoff)
        return count / window.seconds
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type.value,
            "description": self.description,
            "unit": self.unit,
            "current": self.get_current(),
            "sum_1h": self.get_sum(TimeWindow.HOUR),
            "avg_1h": self.get_avg(TimeWindow.HOUR),
            "min_1h": self.get_min(TimeWindow.HOUR),
            "max_1h": self.get_max(TimeWindow.HOUR),
            "p50_1h": self.get_percentile(50, TimeWindow.HOUR),
            "p95_1h": self.get_percentile(95, TimeWindow.HOUR),
            "p99_1h": self.get_percentile(99, TimeWindow.HOUR),
            "rate_1m": self.get_rate(TimeWindow.MINUTE),
            "data_points": len(self.points)
        }


@dataclass
class AnomalyAlert:
    """An anomaly detection alert"""
    id: str
    timestamp: str
    metric_name: str
    alert_type: str
    severity: str  # low, medium, high, critical
    message: str
    current_value: float
    expected_value: float
    deviation: float
    metadata: Dict[str, Any] = field(default_factory=dict)
    acknowledged: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "metric_name": self.metric_name,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "message": self.message,
            "current_value": self.current_value,
            "expected_value": self.expected_value,
            "deviation": self.deviation,
            "metadata": self.metadata,
            "acknowledged": self.acknowledged
        }


@dataclass
class UsagePattern:
    """A detected usage pattern"""
    pattern_type: str
    description: str
    confidence: float
    time_range: str
    metrics: List[str]
    insights: List[str]
    recommendations: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "pattern_type": self.pattern_type,
            "description": self.description,
            "confidence": self.confidence,
            "time_range": self.time_range,
            "metrics": self.metrics,
            "insights": self.insights,
            "recommendations": self.recommendations
        }


class AnalyticsEngine:
    """Smart analytics engine with real-time metrics and AI insights"""
    
    def __init__(self):
        self.metrics: Dict[str, Metric] = {}
        self.alerts: List[AnomalyAlert] = []
        self.patterns: List[UsagePattern] = []
        self._lock = threading.Lock()
        self._alert_counter = 0
        
        # Initialize default metrics
        self._init_default_metrics()
    
    def _init_default_metrics(self) -> None:
        """Initialize default system metrics"""
        default_metrics = [
            ("requests_total", MetricType.COUNTER, "Total HTTP requests", "requests"),
            ("requests_duration_ms", MetricType.HISTOGRAM, "Request duration", "ms"),
            ("requests_errors", MetricType.COUNTER, "Total request errors", "errors"),
            ("ai_requests_total", MetricType.COUNTER, "Total AI API requests", "requests"),
            ("ai_tokens_used", MetricType.COUNTER, "Total AI tokens used", "tokens"),
            ("ai_latency_ms", MetricType.HISTOGRAM, "AI request latency", "ms"),
            ("code_generations", MetricType.COUNTER, "Code generations", "generations"),
            ("deployments", MetricType.COUNTER, "Deployments triggered", "deployments"),
            ("active_sessions", MetricType.GAUGE, "Active user sessions", "sessions"),
            ("memory_usage_mb", MetricType.GAUGE, "Memory usage", "MB"),
            ("cpu_usage_percent", MetricType.GAUGE, "CPU usage", "%"),
            ("cache_hits", MetricType.COUNTER, "Cache hits", "hits"),
            ("cache_misses", MetricType.COUNTER, "Cache misses", "misses"),
            ("db_queries", MetricType.COUNTER, "Database queries", "queries"),
            ("db_latency_ms", MetricType.HISTOGRAM, "Database latency", "ms"),
            ("websocket_connections", MetricType.GAUGE, "WebSocket connections", "connections"),
            ("file_operations", MetricType.COUNTER, "File operations", "operations"),
            ("auth_attempts", MetricType.COUNTER, "Authentication attempts", "attempts"),
            ("auth_failures", MetricType.COUNTER, "Authentication failures", "failures"),
            ("rate_limit_hits", MetricType.COUNTER, "Rate limit hits", "hits"),
        ]
        
        for name, mtype, desc, unit in default_metrics:
            self.metrics[name] = Metric(
                name=name,
                type=mtype,
                description=desc,
                unit=unit
            )
    
    def record(self, metric_name: str, value: float, labels: Dict[str, str] = None) -> None:
        """Record a metric value"""
        with self._lock:
            if metric_name not in self.metrics:
                self.metrics[metric_name] = Metric(
                    name=metric_name,
                    type=MetricType.GAUGE,
                    description=f"Custom metric: {metric_name}"
                )
            self.metrics[metric_name].record(value, labels)
    
    def increment(self, metric_name: str, value: float = 1, labels: Dict[str, str] = None) -> None:
        """Increment a counter metric"""
        with self._lock:
            if metric_name not in self.metrics:
                self.metrics[metric_name] = Metric(
                    name=metric_name,
                    type=MetricType.COUNTER,
                    description=f"Counter: {metric_name}"
                )
            current = self.metrics[metric_name].get_current() or 0
            self.metrics[metric_name].record(current + value, labels)
    
    def get_metric(self, metric_name: str) -> Optional[Dict[str, Any]]:
        """Get a metric's current state"""
        with self._lock:
            if metric_name in self.metrics:
                return self.metrics[metric_name].to_dict()
            return None
    
    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """Get all metrics"""
        with self._lock:
            return {name: metric.to_dict() for name, metric in self.metrics.items()}
    
    def detect_anomalies(self) -> List[AnomalyAlert]:
        """Detect anomalies in metrics using statistical analysis"""
        new_alerts = []
        
        with self._lock:
            for name, metric in self.metrics.items():
                if len(metric.points) < 10:
                    continue
                
                # Get recent values
                recent = [p.value for p in metric.points[-100:]]
                current = recent[-1] if recent else 0
                
                if len(recent) < 5:
                    continue
                
                # Calculate statistics
                mean = statistics.mean(recent[:-1])
                stdev = statistics.stdev(recent[:-1]) if len(recent) > 2 else 0
                
                if stdev == 0:
                    continue
                
                # Z-score based anomaly detection
                z_score = abs((current - mean) / stdev) if stdev > 0 else 0
                
                if z_score > 3:  # More than 3 standard deviations
                    severity = "critical" if z_score > 5 else "high" if z_score > 4 else "medium"
                    
                    self._alert_counter += 1
                    alert = AnomalyAlert(
                        id=f"alert-{self._alert_counter:06d}",
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        metric_name=name,
                        alert_type="statistical_anomaly",
                        severity=severity,
                        message=f"Anomaly detected in {name}: value {current:.2f} deviates {z_score:.1f} std from mean {mean:.2f}",
                        current_value=current,
                        expected_value=mean,
                        deviation=z_score,
                        metadata={"stdev": stdev, "z_score": z_score}
                    )
                    new_alerts.append(alert)
                    self.alerts.append(alert)
                
                # Trend detection - sudden spikes
                if len(recent) >= 5:
                    recent_avg = statistics.mean(recent[-5:])
                    older_avg = statistics.mean(recent[:-5]) if len(recent) > 5 else recent_avg
                    
                    if older_avg > 0:
                        change_ratio = recent_avg / older_avg
                        
                        if change_ratio > 3:  # 3x increase
                            self._alert_counter += 1
                            alert = AnomalyAlert(
                                id=f"alert-{self._alert_counter:06d}",
                                timestamp=datetime.now(timezone.utc).isoformat(),
                                metric_name=name,
                                alert_type="spike_detected",
                                severity="high",
                                message=f"Spike detected in {name}: {change_ratio:.1f}x increase",
                                current_value=recent_avg,
                                expected_value=older_avg,
                                deviation=change_ratio,
                                metadata={"change_ratio": change_ratio}
                            )
                            new_alerts.append(alert)
                            self.alerts.append(alert)
        
        # Keep only last 1000 alerts
        self.alerts = self.alerts[-1000:]
        
        return new_alerts
    
    def analyze_patterns(self) -> List[UsagePattern]:
        """Analyze usage patterns and generate insights"""
        patterns = []
        
        with self._lock:
            # Analyze request patterns
            requests_metric = self.metrics.get("requests_total")
            if requests_metric and len(requests_metric.points) > 10:
                rate = requests_metric.get_rate(TimeWindow.MINUTE)
                avg_rate = requests_metric.get_rate(TimeWindow.HOUR)
                
                if rate > avg_rate * 2:
                    patterns.append(UsagePattern(
                        pattern_type="high_traffic",
                        description="Traffic is significantly higher than average",
                        confidence=0.85,
                        time_range="last_hour",
                        metrics=["requests_total"],
                        insights=[
                            f"Current rate: {rate:.2f} req/s",
                            f"Average rate: {avg_rate:.2f} req/s",
                            f"Traffic is {rate/avg_rate:.1f}x higher than normal"
                        ],
                        recommendations=[
                            "Consider scaling up resources",
                            "Enable additional caching",
                            "Monitor for potential DDoS"
                        ]
                    ))
            
            # Analyze AI usage patterns
            ai_metric = self.metrics.get("ai_tokens_used")
            if ai_metric and len(ai_metric.points) > 5:
                total_tokens = ai_metric.get_sum(TimeWindow.HOUR)
                if total_tokens > 100000:
                    patterns.append(UsagePattern(
                        pattern_type="high_ai_usage",
                        description="High AI token consumption detected",
                        confidence=0.9,
                        time_range="last_hour",
                        metrics=["ai_tokens_used", "ai_requests_total"],
                        insights=[
                            f"Tokens used in last hour: {total_tokens:,.0f}",
                            "Consider optimizing prompts"
                        ],
                        recommendations=[
                            "Review prompt efficiency",
                            "Implement response caching",
                            "Consider using smaller models for simple tasks"
                        ]
                    ))
            
            # Analyze error patterns
            errors_metric = self.metrics.get("requests_errors")
            requests_metric = self.metrics.get("requests_total")
            if errors_metric and requests_metric:
                error_count = errors_metric.get_sum(TimeWindow.HOUR)
                request_count = requests_metric.get_sum(TimeWindow.HOUR)
                
                if request_count > 0:
                    error_rate = error_count / request_count
                    if error_rate > 0.05:  # More than 5% errors
                        patterns.append(UsagePattern(
                            pattern_type="high_error_rate",
                            description="Error rate is above acceptable threshold",
                            confidence=0.95,
                            time_range="last_hour",
                            metrics=["requests_errors", "requests_total"],
                            insights=[
                                f"Error rate: {error_rate*100:.1f}%",
                                f"Total errors: {error_count:.0f}",
                                f"Total requests: {request_count:.0f}"
                            ],
                            recommendations=[
                                "Review error logs for patterns",
                                "Check external service health",
                                "Implement circuit breakers"
                            ]
                        ))
            
            # Analyze cache efficiency
            cache_hits = self.metrics.get("cache_hits")
            cache_misses = self.metrics.get("cache_misses")
            if cache_hits and cache_misses:
                hits = cache_hits.get_sum(TimeWindow.HOUR)
                misses = cache_misses.get_sum(TimeWindow.HOUR)
                total = hits + misses
                
                if total > 100:
                    hit_rate = hits / total
                    if hit_rate < 0.7:  # Less than 70% hit rate
                        patterns.append(UsagePattern(
                            pattern_type="low_cache_efficiency",
                            description="Cache hit rate is below optimal",
                            confidence=0.8,
                            time_range="last_hour",
                            metrics=["cache_hits", "cache_misses"],
                            insights=[
                                f"Cache hit rate: {hit_rate*100:.1f}%",
                                f"Cache hits: {hits:.0f}",
                                f"Cache misses: {misses:.0f}"
                            ],
                            recommendations=[
                                "Review cache key strategy",
                                "Increase cache TTL for stable data",
                                "Consider pre-warming cache"
                            ]
                        ))
            
            # Analyze latency patterns
            latency_metric = self.metrics.get("requests_duration_ms")
            if latency_metric and len(latency_metric.points) > 10:
                p95 = latency_metric.get_percentile(95, TimeWindow.HOUR)
                p50 = latency_metric.get_percentile(50, TimeWindow.HOUR)
                
                if p95 and p50 and p95 > 2000:  # P95 > 2 seconds
                    patterns.append(UsagePattern(
                        pattern_type="high_latency",
                        description="Request latency is higher than optimal",
                        confidence=0.85,
                        time_range="last_hour",
                        metrics=["requests_duration_ms"],
                        insights=[
                            f"P50 latency: {p50:.0f}ms",
                            f"P95 latency: {p95:.0f}ms",
                            f"P95/P50 ratio: {p95/p50:.1f}x"
                        ],
                        recommendations=[
                            "Profile slow endpoints",
                            "Optimize database queries",
                            "Consider async processing for heavy operations"
                        ]
                    ))
        
        self.patterns = patterns
        return patterns
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """Get comprehensive dashboard data"""
        # Detect anomalies and analyze patterns
        anomalies = self.detect_anomalies()
        patterns = self.analyze_patterns()
        
        # Calculate key metrics
        metrics = self.get_all_metrics()
        
        # Build dashboard
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "total_requests_1h": metrics.get("requests_total", {}).get("sum_1h", 0),
                "error_rate_1h": self._calculate_error_rate(),
                "avg_latency_ms": metrics.get("requests_duration_ms", {}).get("avg_1h", 0),
                "ai_tokens_1h": metrics.get("ai_tokens_used", {}).get("sum_1h", 0),
                "active_sessions": metrics.get("active_sessions", {}).get("current", 0),
                "cache_hit_rate": self._calculate_cache_hit_rate()
            },
            "metrics": metrics,
            "anomalies": {
                "total": len(self.alerts),
                "unacknowledged": len([a for a in self.alerts if not a.acknowledged]),
                "recent": [a.to_dict() for a in self.alerts[-10:]]
            },
            "patterns": [p.to_dict() for p in patterns],
            "health": self._calculate_health_score()
        }
    
    def _calculate_error_rate(self) -> float:
        """Calculate error rate percentage"""
        errors = self.metrics.get("requests_errors")
        requests = self.metrics.get("requests_total")
        
        if not errors or not requests:
            return 0
        
        error_sum = errors.get_sum(TimeWindow.HOUR)
        request_sum = requests.get_sum(TimeWindow.HOUR)
        
        if request_sum == 0:
            return 0
        
        return (error_sum / request_sum) * 100
    
    def _calculate_cache_hit_rate(self) -> float:
        """Calculate cache hit rate percentage"""
        hits = self.metrics.get("cache_hits")
        misses = self.metrics.get("cache_misses")
        
        if not hits or not misses:
            return 0
        
        hit_sum = hits.get_sum(TimeWindow.HOUR)
        miss_sum = misses.get_sum(TimeWindow.HOUR)
        total = hit_sum + miss_sum
        
        if total == 0:
            return 0
        
        return (hit_sum / total) * 100
    
    def _calculate_health_score(self) -> Dict[str, Any]:
        """Calculate overall system health score"""
        scores = []
        
        # Error rate score (0-100)
        error_rate = self._calculate_error_rate()
        error_score = max(0, 100 - error_rate * 10)
        scores.append(("error_rate", error_score))
        
        # Latency score
        latency_metric = self.metrics.get("requests_duration_ms")
        if latency_metric:
            p95 = latency_metric.get_percentile(95, TimeWindow.HOUR) or 0
            latency_score = max(0, 100 - (p95 / 50))  # Penalize for high latency
            scores.append(("latency", min(100, latency_score)))
        
        # Cache efficiency score
        cache_hit_rate = self._calculate_cache_hit_rate()
        cache_score = cache_hit_rate
        scores.append(("cache", cache_score))
        
        # Anomaly score
        unack_anomalies = len([a for a in self.alerts if not a.acknowledged])
        anomaly_score = max(0, 100 - unack_anomalies * 10)
        scores.append(("anomalies", anomaly_score))
        
        # Calculate overall score
        if scores:
            overall = sum(s[1] for s in scores) / len(scores)
        else:
            overall = 100
        
        status = "healthy" if overall >= 80 else "degraded" if overall >= 50 else "unhealthy"
        
        return {
            "overall_score": round(overall, 1),
            "status": status,
            "components": {name: round(score, 1) for name, score in scores}
        }
    
    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an alert"""
        for alert in self.alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                return True
        return False
    
    def get_time_series(
        self,
        metric_name: str,
        window: TimeWindow = TimeWindow.HOUR,
        resolution: int = 60  # seconds per bucket
    ) -> List[Dict[str, Any]]:
        """Get time series data for a metric"""
        with self._lock:
            metric = self.metrics.get(metric_name)
            if not metric:
                return []
            
            cutoff = time.time() - window.seconds
            points = [p for p in metric.points if p.timestamp > cutoff]
            
            if not points:
                return []
            
            # Bucket the data
            buckets = defaultdict(list)
            for point in points:
                bucket = int(point.timestamp / resolution) * resolution
                buckets[bucket].append(point.value)
            
            # Aggregate buckets
            result = []
            for bucket_time, values in sorted(buckets.items()):
                result.append({
                    "timestamp": datetime.fromtimestamp(bucket_time, timezone.utc).isoformat(),
                    "value": statistics.mean(values),
                    "min": min(values),
                    "max": max(values),
                    "count": len(values)
                })
            
            return result


# Global analytics engine instance
_analytics_engine: Optional[AnalyticsEngine] = None


def get_analytics_engine() -> AnalyticsEngine:
    """Get or create the global analytics engine"""
    global _analytics_engine
    if _analytics_engine is None:
        _analytics_engine = AnalyticsEngine()
    return _analytics_engine


def record_metric(name: str, value: float, labels: Dict[str, str] = None) -> None:
    """Convenience function to record a metric"""
    get_analytics_engine().record(name, value, labels)


def increment_metric(name: str, value: float = 1, labels: Dict[str, str] = None) -> None:
    """Convenience function to increment a counter"""
    get_analytics_engine().increment(name, value, labels)
