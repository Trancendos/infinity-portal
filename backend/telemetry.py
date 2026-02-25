# telemetry.py — OpenTelemetry instrumentation for Infinity OS
"""
Configures distributed tracing and metrics collection.
Exports to OTLP collector when OTEL_EXPORTER_OTLP_ENDPOINT is set,
otherwise runs in no-op mode for development/testing.
"""
import os
import logging

logger = logging.getLogger("infinity-os.telemetry")

# Service identity
SERVICE_NAME = os.getenv("OTEL_SERVICE_NAME", "infinity-os-api")
SERVICE_VERSION = "3.0.0"
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")


def setup_telemetry(app=None):
    """Initialise OpenTelemetry tracing and instrument FastAPI + SQLAlchemy.

    Safe to call in any environment — if the OTel SDK is not installed or
    no exporter endpoint is configured, this is a no-op.
    """
    if not OTLP_ENDPOINT:
        logger.info("OpenTelemetry disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set)")
        return None

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME as RES_SVC_NAME
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        # Build resource descriptor
        resource = Resource.create({
            RES_SVC_NAME: SERVICE_NAME,
            "service.version": SERVICE_VERSION,
            "deployment.environment": ENVIRONMENT,
        })

        # Create and register tracer provider
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=OTLP_ENDPOINT, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        # Instrument FastAPI
        if app is not None:
            try:
                from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
                FastAPIInstrumentor.instrument_app(
                    app,
                    excluded_urls="health,healthz,ready",
                    tracer_provider=provider,
                )
                logger.info("FastAPI instrumented with OpenTelemetry")
            except ImportError:
                logger.warning("opentelemetry-instrumentation-fastapi not installed")

        # Instrument SQLAlchemy
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
            SQLAlchemyInstrumentor().instrument(tracer_provider=provider)
            logger.info("SQLAlchemy instrumented with OpenTelemetry")
        except ImportError:
            logger.warning("opentelemetry-instrumentation-sqlalchemy not installed")

        # Instrument HTTPX (outbound calls)
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            HTTPXClientInstrumentor().instrument(tracer_provider=provider)
            logger.info("HTTPX instrumented with OpenTelemetry")
        except ImportError:
            logger.warning("opentelemetry-instrumentation-httpx not installed")

        logger.info(f"OpenTelemetry initialised → {OTLP_ENDPOINT}")
        return provider

    except ImportError:
        logger.info("OpenTelemetry SDK not installed — tracing disabled")
        return None
    except Exception as e:
        logger.error(f"OpenTelemetry setup failed: {e}")
        return None


def get_tracer(name: str = "infinity-os"):
    """Get a tracer instance. Returns a no-op tracer if OTel is not configured."""
    try:
        from opentelemetry import trace
        return trace.get_tracer(name, SERVICE_VERSION)
    except ImportError:
        return None