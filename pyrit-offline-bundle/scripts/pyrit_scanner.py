#!/usr/bin/env python3
"""PyRIT Offline Scanner — AI Red-Teaming for Pre-Deployment Validation
ISO 27001: A.14.2.5 - Secure Development | A.12.6.1 - Vulnerability Management
Usage: python pyrit_scanner.py --target ./repo --config ./config/offline-bundle.yaml
"""
import argparse, json, sys, os, re, hashlib, time
from pathlib import Path
from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Dict, List, Optional, Any

@dataclass
class Finding:
    file: str; line: int = 0; type: str = ""; severity: str = "medium"
    snippet: str = ""; confidence: float = 0.5; description: str = ""

@dataclass
class RiskScore:
    overall: float = 0.0; jailbreak: float = 0.0; harmful_content: float = 0.0
    prompt_injection: float = 0.0; category_scores: Dict[str, float] = field(default_factory=dict)
    passed: bool = True; threshold: float = 0.85

@dataclass
class ScanResult:
    target: str = ""; timestamp: str = ""; risk_score: Optional[RiskScore] = None
    findings: List[Dict] = field(default_factory=list); scan_duration_seconds: float = 0.0
    files_scanned: int = 0; pyrit_version: str = "2.0.0-offline"

SECURITY_PATTERNS = {
    "hardcoded_secret": {"pattern": r"(password|secret|api_key|token|private_key)\s*[=:]\s*["\'][^"\']{8,}["\']", "severity": "high", "description": "Potential hardcoded secret"},
    "eval_usage": {"pattern": r"\beval\s*\(", "severity": "high", "description": "Use of eval() - code injection vector"},
    "exec_usage": {"pattern": r"\bexec\s*\(", "severity": "high", "description": "Use of exec() - code injection vector"},
    "sql_injection": {"pattern": r"(execute|query)\s*\(\s*f["\']|\+\s*["\']\s*(SELECT|INSERT|UPDATE|DELETE)", "severity": "critical", "description": "Potential SQL injection"},
    "prompt_injection": {"pattern": r"(ignore\s+previous|system\s+prompt|you\s+are\s+now|jailbreak|DAN\s+mode)", "severity": "high", "description": "Prompt injection pattern"},
    "jwt_none_alg": {"pattern": r"(alg|algorithm)["\']?\s*[:=]\s*["\']?none", "severity": "critical", "description": "JWT none algorithm vulnerability"},
    "insecure_random": {"pattern": r"Math\.random\(\)|random\.random\(\)", "severity": "medium", "description": "Insecure random number generation"},
    "cors_wildcard": {"pattern": r"Access-Control-Allow-Origin["\']?\s*[:=]\s*["\']?\*", "severity": "medium", "description": "CORS wildcard origin"},
    "debug_enabled": {"pattern": r"(DEBUG|debug)\s*[=:]\s*(True|true|1|["\']true)", "severity": "medium", "description": "Debug mode enabled"},
    "unsafe_deserialization": {"pattern": r"(pickle\.loads|yaml\.load\((?!.*Loader))", "severity": "critical", "description": "Unsafe deserialization"},
    "path_traversal": {"pattern": r"\.\.[\\/]", "severity": "high", "description": "Potential path traversal"},
    "shell_injection": {"pattern": r"(subprocess\.call|os\.system|os\.popen)\s*\(.*\+", "severity": "critical", "description": "Potential shell injection"},
    "xxe_vulnerability": {"pattern": r"etree\.parse|parseString|XMLParser", "severity": "medium", "description": "Potential XXE vulnerability"},
    "ssrf_pattern": {"pattern": r"requests\.(get|post|put)\s*\(\s*(user|req|request|input)", "severity": "high", "description": "Potential SSRF"},
}

SCAN_EXTENSIONS = {".py", ".js", ".ts", ".jsx", ".tsx", ".yaml", ".yml", ".json", ".toml", ".cfg", ".ini", ".env", ".sh", ".ps1", ".rs"}

def scan_file(filepath: str) -> List[Finding]:
    findings = []
    try:
        content = Path(filepath).read_text(errors="ignore")
        for name, pattern_info in SECURITY_PATTERNS.items():
            for i, line in enumerate(content.split("\n"), 1):
                if re.search(pattern_info["pattern"], line, re.IGNORECASE):
                    findings.append(Finding(
                        file=filepath, line=i, type=name, severity=pattern_info["severity"],
                        snippet=line.strip()[:120], confidence=0.7, description=pattern_info["description"],
                    ))
    except Exception as e:
        findings.append(Finding(file=filepath, type="scan_error", severity="info", description=str(e)))
    return findings

def calculate_risk(findings: List[Finding], config: dict) -> RiskScore:
    weights = config.get("risk_scoring", {}).get("weights", {"jailbreak_success": 0.4, "harmful_content": 0.35, "prompt_injection": 0.25})
    thresholds = config.get("risk_scoring", {}).get("thresholds", {"block": 0.85, "warn": 0.70})
    severity_weights = {"critical": 1.0, "high": 0.8, "medium": 0.5, "low": 0.2, "info": 0.05}
    if not findings:
        return RiskScore(overall=0.0, passed=True, threshold=thresholds["block"])
    total = sum(severity_weights.get(f.severity, 0.3) for f in findings)
    normalized = min(1.0, total / max(len(findings) * 2, 1))
    prompt_inj = sum(1 for f in findings if "injection" in f.type or "prompt" in f.type) / max(len(findings), 1)
    harmful = sum(1 for f in findings if f.severity in ("critical", "high")) / max(len(findings), 1)
    jailbreak = sum(1 for f in findings if "jailbreak" in f.type or "eval" in f.type) / max(len(findings), 1)
    overall = (weights["jailbreak_success"] * jailbreak + weights["harmful_content"] * harmful + weights["prompt_injection"] * prompt_inj + normalized) / 2
    return RiskScore(overall=round(overall, 4), jailbreak=round(jailbreak, 4), harmful_content=round(harmful, 4),
                     prompt_injection=round(prompt_inj, 4), passed=overall < thresholds["block"], threshold=thresholds["block"])

def load_config(path: str) -> dict:
    try:
        import yaml
        with open(path) as f: return yaml.safe_load(f)
    except: return {"risk_scoring": {"thresholds": {"block": 0.85, "warn": 0.70}, "weights": {"jailbreak_success": 0.4, "harmful_content": 0.35, "prompt_injection": 0.25}}}

def main():
    parser = argparse.ArgumentParser(description="PyRIT Offline Scanner")
    parser.add_argument("-t", "--target", required=True, help="Target directory to scan")
    parser.add_argument("-c", "--config", default="./config/offline-bundle.yaml")
    parser.add_argument("-o", "--output", default="./results")
    parser.add_argument("--format", choices=["json", "text"], default="json")
    args = parser.parse_args()

    config = load_config(args.config)
    target = Path(args.target)
    if not target.exists():
        print(f"Target not found: {target}"); sys.exit(1)

    start = time.time()
    all_findings = []
    files_scanned = 0
    for p in target.rglob("*"):
        if p.is_file() and p.suffix in SCAN_EXTENSIONS and ".git" not in str(p) and "node_modules" not in str(p):
            all_findings.extend(scan_file(str(p)))
            files_scanned += 1

    risk = calculate_risk(all_findings, config)
    duration = round(time.time() - start, 2)
    result = ScanResult(target=str(target), timestamp=datetime.utcnow().isoformat() + "Z",
                        risk_score=asdict(risk), findings=[asdict(f) for f in all_findings],
                        scan_duration_seconds=duration, files_scanned=files_scanned)

    os.makedirs(args.output, exist_ok=True)
    outfile = os.path.join(args.output, f"pyrit-scan-{datetime.utcnow().strftime("%Y%m%d-%H%M%S")}.json")
    with open(outfile, "w") as f: json.dump(asdict(result), f, indent=2)

    print(f"\nPyRIT Scan Complete")
    print(f"Files scanned: {files_scanned}")
    print(f"Findings: {len(all_findings)} ({sum(1 for f in all_findings if f.severity == 'critical')} critical, {sum(1 for f in all_findings if f.severity == 'high')} high)")
    print(f"Risk score: {risk.overall} (threshold: {risk.threshold})")
    print(f"Status: {"PASS" if risk.passed else "FAIL"}")
    print(f"Duration: {duration}s")
    print(f"Report: {outfile}")

    if not risk.passed:
        sys.exit(1)

if __name__ == "__main__":
    main()
