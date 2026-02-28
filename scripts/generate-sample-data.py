#!/usr/bin/env python3
"""
Infinity OS — Sample Data Generator
Generates realistic test data aligned with the current database models.
Used for UAT, development, and demo environments.

Usage:
    python scripts/generate-sample-data.py
    python scripts/generate-sample-data.py --users 50 --agents 20 --output sample-data.json
    python scripts/generate-sample-data.py --sql --output sample-data.sql

ISO 27001: A.14.2 — Security in development and support processes
"""

import json
import random
import uuid
import argparse
from datetime import datetime, timedelta, timezone
from typing import Any


# ── Configuration ───────────────────────────────────────────

AGENT_DEFINITIONS = [
    {"id": "norman-ai", "name": "Norman AI", "tier": "T1_CRITICAL", "caps": ["security", "threat-detection", "vulnerability-scanning"]},
    {"id": "guardian-ai", "name": "Guardian AI", "tier": "T1_CRITICAL", "caps": ["protection", "access-control", "encryption"]},
    {"id": "mercury-ai", "name": "Mercury AI", "tier": "T1_CRITICAL", "caps": ["finance", "billing", "cost-optimization"]},
    {"id": "chronos-ai", "name": "Chronos AI", "tier": "T1_CRITICAL", "caps": ["scheduling", "time-management", "automation"]},
    {"id": "cornelius-ai", "name": "Cornelius AI", "tier": "T1_CRITICAL", "caps": ["orchestration", "workflow", "coordination"]},
    {"id": "sentinel-ai", "name": "Sentinel AI", "tier": "T2_IMPORTANT", "caps": ["monitoring", "alerting", "observability"]},
    {"id": "prometheus-ai", "name": "Prometheus AI", "tier": "T2_IMPORTANT", "caps": ["alerting", "prediction", "anomaly-detection"]},
    {"id": "oracle-ai", "name": "Oracle AI", "tier": "T2_IMPORTANT", "caps": ["prediction", "forecasting", "analytics"]},
    {"id": "atlas-ai", "name": "Atlas AI", "tier": "T2_IMPORTANT", "caps": ["navigation", "mapping", "discovery"]},
    {"id": "nexus-ai", "name": "Nexus AI", "tier": "T2_IMPORTANT", "caps": ["integration", "connection", "federation"]},
    {"id": "queen-ai", "name": "Queen AI", "tier": "T2_IMPORTANT", "caps": ["hive-management", "swarm-coordination", "delegation"]},
    {"id": "the-dr-ai", "name": "The Dr AI", "tier": "T2_IMPORTANT", "caps": ["code-repair", "debugging", "diagnostics"]},
    {"id": "iris-ai", "name": "Iris AI", "tier": "T3_NICE_TO_HAVE", "caps": ["visual-processing", "image-analysis", "ocr"]},
    {"id": "serenity-ai", "name": "Serenity AI", "tier": "T3_NICE_TO_HAVE", "caps": ["wellness", "user-experience", "accessibility"]},
    {"id": "luminous-ai", "name": "Luminous Mastermind AI", "tier": "T1_CRITICAL", "caps": ["reasoning", "generation", "analysis"]},
]

ROLES = ["super_admin", "org_admin", "auditor", "power_user", "user"]
RISK_LEVELS = ["PROHIBITED", "HIGH_RISK", "LIMITED_RISK", "MINIMAL_RISK"]
AUDIT_EVENTS = [
    "ai.generation.success", "ai.generation.failed", "ai.governance.rejected",
    "auth.user.login", "auth.user.logout", "auth.user.register",
    "file.created", "file.updated", "file.deleted",
    "build.started", "build.completed", "build.failed",
    "compliance.dpia.completed", "hitl.approved", "hitl.rejected",
]
COMPLIANCE_FRAMEWORKS = ["ISO_27001", "GDPR", "SOC2", "EU_AI_ACT", "WCAG_2_2"]
MEMORY_TYPES = ["conversation", "learning", "context", "preference", "fact", "task_result"]

FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Avery", "Sage", "River",
               "Kai", "Rowan", "Phoenix", "Skyler", "Dakota", "Reese", "Finley", "Harper", "Emery", "Blake"]
LAST_NAMES = ["Chen", "Patel", "Kim", "Santos", "Müller", "Okafor", "Tanaka", "Johansson", "Silva", "Kowalski",
              "Nguyen", "Andersen", "Dubois", "Rossi", "Yamamoto", "Petrov", "Larsson", "Fernandez", "Ali", "Park"]
DOMAINS = ["trancendos.com", "infinity-os.dev", "test.trancendos.com"]
ORG_NAMES = ["Trancendos HQ", "Engineering", "Research Lab", "Operations", "Security Team"]


class SampleDataGenerator:
    """Generates realistic sample data for Infinity OS."""

    def __init__(self, seed: int = 42):
        random.seed(seed)
        self.now = datetime.now(timezone.utc)

    def _uuid(self) -> str:
        return str(uuid.uuid4())

    def _past_date(self, max_days: int = 365) -> str:
        delta = timedelta(days=random.randint(0, max_days), hours=random.randint(0, 23))
        return (self.now - delta).isoformat()

    def _recent_date(self, max_hours: int = 72) -> str:
        delta = timedelta(hours=random.randint(0, max_hours))
        return (self.now - delta).isoformat()

    # ── Generators ──────────────────────────────────────────

    def generate_user(self, index: int) -> dict:
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        domain = random.choice(DOMAINS)
        return {
            "id": self._uuid(),
            "email": f"{first.lower()}.{last.lower()}{index}@{domain}",
            "username": f"{first.lower()}{last.lower()}{index}",
            "display_name": f"{first} {last}",
            "role": random.choice(ROLES),
            "is_active": random.random() > 0.05,
            "mfa_enabled": random.random() > 0.3,
            "created_at": self._past_date(365),
            "last_login": self._recent_date(168) if random.random() > 0.2 else None,
        }

    def generate_organisation(self, index: int) -> dict:
        return {
            "id": self._uuid(),
            "name": ORG_NAMES[index % len(ORG_NAMES)] if index < len(ORG_NAMES) else f"Team {index}",
            "slug": f"org-{index:03d}",
            "tier": random.choice(["free", "pro", "enterprise"]),
            "member_count": random.randint(1, 50),
            "created_at": self._past_date(365),
        }

    def generate_agent_registration(self, agent_def: dict) -> dict:
        return {
            "agent_id": agent_def["id"],
            "name": agent_def["name"],
            "version": f"{random.randint(1, 3)}.{random.randint(0, 9)}.{random.randint(0, 20)}",
            "tier": agent_def["tier"],
            "capabilities": agent_def["caps"],
            "dependencies": [],
            "deployment_target": random.choice(["docker-container", "k3s-pod", "cloudflare-worker"]),
            "status": random.choice(["ready", "ready", "ready", "processing", "degraded", "stopped"]),
            "registered_at": self._past_date(90),
            "last_heartbeat": self._recent_date(2),
            "heartbeat_count": random.randint(100, 50000),
            "total_tasks_completed": random.randint(0, 10000),
            "error_count": random.randint(0, 50),
        }

    def generate_agent_memory(self, agent_id: str, user_id: str | None = None) -> dict:
        memory_type = random.choice(MEMORY_TYPES)
        content_templates = {
            "conversation": f"User asked about {random.choice(['security', 'billing', 'deployment', 'compliance'])} configuration.",
            "learning": f"Learned that {random.choice(['response time', 'error rate', 'throughput'])} improves with {random.choice(['caching', 'batching', 'indexing'])}.",
            "context": f"Current project context: {random.choice(['production deployment', 'security audit', 'feature development', 'compliance review'])}.",
            "preference": f"User prefers {random.choice(['dark mode', 'verbose output', 'minimal notifications', 'detailed reports'])}.",
            "fact": f"System has {random.randint(1, 100)} active {random.choice(['users', 'services', 'workflows', 'integrations'])}.",
            "task_result": f"Task completed: {random.choice(['scan', 'build', 'deploy', 'audit'])} finished in {random.randint(1, 300)}s.",
        }
        return {
            "id": self._uuid(),
            "agent_id": agent_id,
            "user_id": user_id,
            "memory_type": memory_type,
            "content": content_templates.get(memory_type, "Generic memory entry."),
            "importance": round(random.uniform(0.1, 1.0), 2),
            "metadata": {"source": random.choice(["api", "event", "scheduled", "user-interaction"])},
            "created_at": self._past_date(30),
            "access_count": random.randint(0, 100),
        }

    def generate_audit_event(self, user_id: str) -> dict:
        event_type = random.choice(AUDIT_EVENTS)
        return {
            "id": self._uuid(),
            "event_type": event_type,
            "actor_id": user_id,
            "ip_address": f"192.168.{random.randint(1, 254)}.{random.randint(1, 254)}",
            "user_agent": "Mozilla/5.0 (Infinity OS Shell)",
            "metadata": {"source": "shell", "module": event_type.split(".")[0]},
            "created_at": self._recent_date(168),
        }

    def generate_ai_system(self, index: int) -> dict:
        return {
            "id": self._uuid(),
            "name": f"AI System {index:03d}",
            "description": f"Automated {random.choice(['classification', 'generation', 'analysis', 'detection'])} system",
            "risk_level": random.choice(RISK_LEVELS),
            "provider": random.choice(["groq", "openai", "anthropic", "huggingface", "local"]),
            "model_name": random.choice(["llama-3.1-70b", "gpt-4o-mini", "claude-3-haiku", "mixtral-8x7b"]),
            "purpose": random.choice(["content-generation", "code-review", "compliance-check", "threat-detection"]),
            "is_active": random.random() > 0.1,
            "created_at": self._past_date(180),
        }

    def generate_compliance_record(self, framework: str) -> dict:
        return {
            "id": self._uuid(),
            "framework": framework,
            "control_id": f"{framework[:3]}-{random.randint(1, 20)}.{random.randint(1, 10)}",
            "control_name": f"Control {random.randint(1, 100)}",
            "status": random.choice(["implemented", "implemented", "implemented", "partial", "planned"]),
            "evidence_url": f"https://github.com/Trancendos/infinity-portal/blob/main/compliance/",
            "last_assessed": self._recent_date(720),
            "next_review": (self.now + timedelta(days=random.randint(30, 180))).isoformat(),
        }

    # ── Main Generator ──────────────────────────────────────

    def generate_all(self, counts: dict[str, int] | None = None) -> dict[str, Any]:
        c = counts or {
            "users": 25,
            "organisations": 5,
            "agents": len(AGENT_DEFINITIONS),
            "memories_per_agent": 10,
            "audit_events": 100,
            "ai_systems": 10,
            "compliance_records": 30,
        }

        users = [self.generate_user(i) for i in range(c["users"])]
        orgs = [self.generate_organisation(i) for i in range(c["organisations"])]
        agents = [self.generate_agent_registration(a) for a in AGENT_DEFINITIONS[:c["agents"]]]

        memories = []
        for agent in agents:
            for _ in range(c.get("memories_per_agent", 10)):
                user_id = random.choice(users)["id"] if random.random() > 0.3 else None
                memories.append(self.generate_agent_memory(agent["agent_id"], user_id))

        audit_events = [
            self.generate_audit_event(random.choice(users)["id"])
            for _ in range(c["audit_events"])
        ]

        ai_systems = [self.generate_ai_system(i) for i in range(c["ai_systems"])]

        compliance_records = []
        for _ in range(c["compliance_records"]):
            fw = random.choice(COMPLIANCE_FRAMEWORKS)
            compliance_records.append(self.generate_compliance_record(fw))

        return {
            "generated_at": self.now.isoformat(),
            "generator": "Infinity OS Sample Data Generator v1.0",
            "seed": 42,
            "counts": {
                "users": len(users),
                "organisations": len(orgs),
                "agents": len(agents),
                "memories": len(memories),
                "audit_events": len(audit_events),
                "ai_systems": len(ai_systems),
                "compliance_records": len(compliance_records),
            },
            "data": {
                "users": users,
                "organisations": orgs,
                "agents": agents,
                "agent_memories": memories,
                "audit_events": audit_events,
                "ai_systems": ai_systems,
                "compliance_records": compliance_records,
            },
        }


# ── CLI ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Infinity OS Sample Data Generator")
    parser.add_argument("--users", type=int, default=25, help="Number of users")
    parser.add_argument("--agents", type=int, default=15, help="Number of agents")
    parser.add_argument("--memories", type=int, default=10, help="Memories per agent")
    parser.add_argument("--events", type=int, default=100, help="Audit events")
    parser.add_argument("--output", type=str, default="sample-data.json", help="Output file")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--pretty", action="store_true", default=True, help="Pretty print JSON")
    args = parser.parse_args()

    generator = SampleDataGenerator(seed=args.seed)
    data = generator.generate_all({
        "users": args.users,
        "organisations": 5,
        "agents": min(args.agents, len(AGENT_DEFINITIONS)),
        "memories_per_agent": args.memories,
        "audit_events": args.events,
        "ai_systems": 10,
        "compliance_records": 30,
    })

    with open(args.output, "w") as f:
        json.dump(data, f, indent=2 if args.pretty else None, default=str)

    counts = data["counts"]
    total = sum(counts.values())
    print(f"✅ Sample data generated: {args.output}")
    print(f"   Users: {counts['users']}")
    print(f"   Organisations: {counts['organisations']}")
    print(f"   Agents: {counts['agents']}")
    print(f"   Memories: {counts['memories']}")
    print(f"   Audit Events: {counts['audit_events']}")
    print(f"   AI Systems: {counts['ai_systems']}")
    print(f"   Compliance Records: {counts['compliance_records']}")
    print(f"   Total Records: {total}")


if __name__ == "__main__":
    main()