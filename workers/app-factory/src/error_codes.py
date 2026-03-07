"""
Infinity Worker - Error Code Generation System
Generates standardized error codes and error handling for all applications
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum
import json
import hashlib
from datetime import datetime


class ErrorSeverity(str, Enum):
    """Error severity levels"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"
    FATAL = "fatal"


class ErrorCategory(str, Enum):
    """Error categories for classification"""
    VALIDATION = "VALIDATION"
    AUTHENTICATION = "AUTH"
    AUTHORIZATION = "AUTHZ"
    DATABASE = "DB"
    NETWORK = "NET"
    FILE_SYSTEM = "FS"
    CONFIGURATION = "CONFIG"
    BUSINESS_LOGIC = "BIZ"
    EXTERNAL_SERVICE = "EXT"
    INTERNAL = "INT"
    USER_INPUT = "INPUT"
    RATE_LIMIT = "RATE"
    RESOURCE = "RES"
    TIMEOUT = "TIMEOUT"
    UNKNOWN = "UNK"


@dataclass
class ErrorCode:
    """Represents a single error code definition"""
    code: str
    name: str
    message: str
    description: str
    category: ErrorCategory
    severity: ErrorSeverity
    http_status: int = 500
    retryable: bool = False
    user_message: str = ""
    resolution: str = ""
    documentation_url: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "name": self.name,
            "message": self.message,
            "description": self.description,
            "category": self.category.value,
            "severity": self.severity.value,
            "http_status": self.http_status,
            "retryable": self.retryable,
            "user_message": self.user_message or self.message,
            "resolution": self.resolution,
            "documentation_url": self.documentation_url
        }


@dataclass
class ErrorCodeRegistry:
    """Registry of all error codes for an application"""
    app_name: str
    app_prefix: str
    version: str = "1.0.0"
    errors: Dict[str, ErrorCode] = field(default_factory=dict)
    
    def add_error(self, error: ErrorCode) -> None:
        self.errors[error.code] = error
    
    def get_error(self, code: str) -> Optional[ErrorCode]:
        return self.errors.get(code)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "app_name": self.app_name,
            "app_prefix": self.app_prefix,
            "version": self.version,
            "total_errors": len(self.errors),
            "errors": {k: v.to_dict() for k, v in self.errors.items()}
        }


class ErrorCodeGenerator:
    """Generates error codes and error handling code for applications"""
    
    # Standard error templates by category
    STANDARD_ERRORS = {
        ErrorCategory.VALIDATION: [
            ("INVALID_INPUT", "Invalid input provided", "The provided input failed validation"),
            ("MISSING_FIELD", "Required field missing", "A required field was not provided"),
            ("INVALID_FORMAT", "Invalid format", "The input format is incorrect"),
            ("VALUE_OUT_OF_RANGE", "Value out of range", "The provided value is outside acceptable range"),
            ("INVALID_TYPE", "Invalid type", "The provided value has an incorrect type"),
        ],
        ErrorCategory.AUTHENTICATION: [
            ("INVALID_CREDENTIALS", "Invalid credentials", "The provided credentials are incorrect"),
            ("TOKEN_EXPIRED", "Token expired", "The authentication token has expired"),
            ("TOKEN_INVALID", "Invalid token", "The authentication token is invalid"),
            ("SESSION_EXPIRED", "Session expired", "The user session has expired"),
            ("MFA_REQUIRED", "MFA required", "Multi-factor authentication is required"),
        ],
        ErrorCategory.AUTHORIZATION: [
            ("ACCESS_DENIED", "Access denied", "You do not have permission to access this resource"),
            ("INSUFFICIENT_PERMISSIONS", "Insufficient permissions", "Your role lacks required permissions"),
            ("RESOURCE_FORBIDDEN", "Resource forbidden", "Access to this resource is forbidden"),
            ("SCOPE_INSUFFICIENT", "Insufficient scope", "The token scope is insufficient"),
        ],
        ErrorCategory.DATABASE: [
            ("CONNECTION_FAILED", "Database connection failed", "Unable to connect to the database"),
            ("QUERY_FAILED", "Query failed", "The database query failed to execute"),
            ("RECORD_NOT_FOUND", "Record not found", "The requested record does not exist"),
            ("DUPLICATE_ENTRY", "Duplicate entry", "A record with this identifier already exists"),
            ("CONSTRAINT_VIOLATION", "Constraint violation", "The operation violates a database constraint"),
        ],
        ErrorCategory.NETWORK: [
            ("CONNECTION_TIMEOUT", "Connection timeout", "The network connection timed out"),
            ("HOST_UNREACHABLE", "Host unreachable", "The target host is unreachable"),
            ("DNS_RESOLUTION_FAILED", "DNS resolution failed", "Unable to resolve the hostname"),
            ("SSL_ERROR", "SSL/TLS error", "An SSL/TLS error occurred"),
        ],
        ErrorCategory.EXTERNAL_SERVICE: [
            ("SERVICE_UNAVAILABLE", "Service unavailable", "The external service is unavailable"),
            ("SERVICE_TIMEOUT", "Service timeout", "The external service request timed out"),
            ("SERVICE_ERROR", "Service error", "The external service returned an error"),
            ("RATE_LIMITED", "Rate limited", "The external service rate limit was exceeded"),
        ],
        ErrorCategory.INTERNAL: [
            ("INTERNAL_ERROR", "Internal error", "An unexpected internal error occurred"),
            ("NOT_IMPLEMENTED", "Not implemented", "This feature is not yet implemented"),
            ("CONFIGURATION_ERROR", "Configuration error", "A configuration error was detected"),
            ("INITIALIZATION_FAILED", "Initialization failed", "Component initialization failed"),
        ],
    }
    
    def __init__(self, app_name: str, app_prefix: str = None):
        self.app_name = app_name
        self.app_prefix = app_prefix or self._generate_prefix(app_name)
        self.registry = ErrorCodeRegistry(
            app_name=app_name,
            app_prefix=self.app_prefix
        )
    
    def _generate_prefix(self, app_name: str) -> str:
        """Generate a 3-letter prefix from app name"""
        words = app_name.upper().replace("-", " ").replace("_", " ").split()
        if len(words) >= 3:
            return "".join(w[0] for w in words[:3])
        elif len(words) == 2:
            return words[0][0] + words[1][:2]
        else:
            return app_name[:3].upper()
    
    def _generate_code(self, category: ErrorCategory, index: int) -> str:
        """Generate error code in format: PREFIX-CAT-NNNN"""
        return f"{self.app_prefix}-{category.value}-{index:04d}"
    
    def generate_standard_errors(self) -> ErrorCodeRegistry:
        """Generate standard error codes for all categories"""
        for category, errors in self.STANDARD_ERRORS.items():
            for idx, (name, message, description) in enumerate(errors, start=1):
                code = self._generate_code(category, idx)
                
                # Determine HTTP status based on category
                http_status = self._get_http_status(category, name)
                severity = self._get_severity(category)
                
                error = ErrorCode(
                    code=code,
                    name=name,
                    message=message,
                    description=description,
                    category=category,
                    severity=severity,
                    http_status=http_status,
                    retryable=self._is_retryable(category, name),
                    user_message=message,
                    resolution=self._get_resolution(category, name)
                )
                self.registry.add_error(error)
        
        return self.registry
    
    def add_custom_error(
        self,
        name: str,
        message: str,
        description: str,
        category: ErrorCategory,
        severity: ErrorSeverity = ErrorSeverity.ERROR,
        http_status: int = 500,
        retryable: bool = False,
        user_message: str = "",
        resolution: str = ""
    ) -> ErrorCode:
        """Add a custom error code"""
        # Find next available index for this category
        existing = [e for e in self.registry.errors.values() if e.category == category]
        next_idx = len(existing) + 100  # Custom errors start at 100
        
        code = self._generate_code(category, next_idx)
        error = ErrorCode(
            code=code,
            name=name,
            message=message,
            description=description,
            category=category,
            severity=severity,
            http_status=http_status,
            retryable=retryable,
            user_message=user_message or message,
            resolution=resolution
        )
        self.registry.add_error(error)
        return error
    
    def _get_http_status(self, category: ErrorCategory, name: str) -> int:
        """Determine appropriate HTTP status code"""
        status_map = {
            ErrorCategory.VALIDATION: 400,
            ErrorCategory.AUTHENTICATION: 401,
            ErrorCategory.AUTHORIZATION: 403,
            ErrorCategory.DATABASE: 500,
            ErrorCategory.NETWORK: 503,
            ErrorCategory.EXTERNAL_SERVICE: 502,
            ErrorCategory.INTERNAL: 500,
            ErrorCategory.RATE_LIMIT: 429,
            ErrorCategory.TIMEOUT: 504,
        }
        
        # Special cases
        if "NOT_FOUND" in name:
            return 404
        if "CONFLICT" in name or "DUPLICATE" in name:
            return 409
        
        return status_map.get(category, 500)
    
    def _get_severity(self, category: ErrorCategory) -> ErrorSeverity:
        """Determine error severity based on category"""
        severity_map = {
            ErrorCategory.VALIDATION: ErrorSeverity.WARNING,
            ErrorCategory.AUTHENTICATION: ErrorSeverity.WARNING,
            ErrorCategory.AUTHORIZATION: ErrorSeverity.WARNING,
            ErrorCategory.DATABASE: ErrorSeverity.ERROR,
            ErrorCategory.NETWORK: ErrorSeverity.ERROR,
            ErrorCategory.EXTERNAL_SERVICE: ErrorSeverity.ERROR,
            ErrorCategory.INTERNAL: ErrorSeverity.CRITICAL,
        }
        return severity_map.get(category, ErrorSeverity.ERROR)
    
    def _is_retryable(self, category: ErrorCategory, name: str) -> bool:
        """Determine if error is retryable"""
        retryable_categories = {
            ErrorCategory.NETWORK,
            ErrorCategory.EXTERNAL_SERVICE,
            ErrorCategory.TIMEOUT,
        }
        non_retryable_names = {"INVALID_CREDENTIALS", "ACCESS_DENIED", "DUPLICATE_ENTRY"}
        
        if name in non_retryable_names:
            return False
        return category in retryable_categories
    
    def _get_resolution(self, category: ErrorCategory, name: str) -> str:
        """Get resolution suggestion for error"""
        resolutions = {
            "INVALID_INPUT": "Check the input format and try again",
            "MISSING_FIELD": "Provide all required fields",
            "INVALID_CREDENTIALS": "Verify your username and password",
            "TOKEN_EXPIRED": "Please log in again to get a new token",
            "ACCESS_DENIED": "Contact an administrator for access",
            "CONNECTION_FAILED": "Check database connectivity and credentials",
            "RECORD_NOT_FOUND": "Verify the record ID exists",
            "SERVICE_UNAVAILABLE": "Wait and retry, or contact support",
            "RATE_LIMITED": "Wait before making more requests",
        }
        return resolutions.get(name, "Contact support if the issue persists")
    
    def generate_typescript_errors(self) -> str:
        """Generate TypeScript error handling code"""
        code = f'''// Auto-generated error codes for {self.app_name}
// Generated at: {datetime.now().isoformat()}

export enum ErrorCode {{
'''
        for error in self.registry.errors.values():
            code += f'  {error.name} = "{error.code}",\n'
        
        code += '''}\n
export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

export class ApplicationError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number = 500,
    retryable: boolean = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON(): AppError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

// Error factory functions
'''
        for error in self.registry.errors.values():
            func_name = self._to_camel_case(error.name)
            code += f'''
export function {func_name}(details?: Record<string, unknown>): ApplicationError {{
  return new ApplicationError(
    ErrorCode.{error.name},
    "{error.message}",
    {error.http_status},
    {str(error.retryable).lower()},
    details
  );
}}
'''
        return code
    
    def generate_python_errors(self) -> str:
        """Generate Python error handling code"""
        code = f'''"""
Auto-generated error codes for {self.app_name}
Generated at: {datetime.now().isoformat()}
"""

from enum import Enum
from typing import Optional, Dict, Any
from datetime import datetime


class ErrorCode(str, Enum):
'''
        for error in self.registry.errors.values():
            code += f'    {error.name} = "{error.code}"\n'
        
        code += '''

class ApplicationError(Exception):
    """Base application error with error code support"""
    
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        http_status: int = 500,
        retryable: bool = False,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.retryable = retryable
        self.details = details or {}
        self.timestamp = datetime.utcnow().isoformat()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "code": self.code.value,
            "message": self.message,
            "http_status": self.http_status,
            "retryable": self.retryable,
            "details": self.details,
            "timestamp": self.timestamp
        }


# Error factory functions
'''
        for error in self.registry.errors.values():
            func_name = self._to_snake_case(error.name)
            code += f'''
def {func_name}(details: Optional[Dict[str, Any]] = None) -> ApplicationError:
    """{error.description}"""
    return ApplicationError(
        code=ErrorCode.{error.name},
        message="{error.message}",
        http_status={error.http_status},
        retryable={error.retryable},
        details=details
    )

'''
        return code
    
    def generate_error_documentation(self) -> str:
        """Generate markdown documentation for all error codes"""
        doc = f'''# Error Code Reference - {self.app_name}

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

## Overview

This document contains all error codes used in the {self.app_name} application.
Error codes follow the format: `{self.app_prefix}-CATEGORY-NNNN`

## Error Categories

| Category | Prefix | Description |
|----------|--------|-------------|
'''
        for cat in ErrorCategory:
            doc += f"| {cat.name} | {cat.value} | {cat.name.replace('_', ' ').title()} errors |\n"
        
        doc += '''
## Severity Levels

| Level | Description |
|-------|-------------|
| DEBUG | Debugging information |
| INFO | Informational messages |
| WARNING | Warning conditions |
| ERROR | Error conditions |
| CRITICAL | Critical conditions |
| FATAL | Fatal errors |

## Error Codes

'''
        # Group by category
        by_category: Dict[ErrorCategory, List[ErrorCode]] = {}
        for error in self.registry.errors.values():
            if error.category not in by_category:
                by_category[error.category] = []
            by_category[error.category].append(error)
        
        for category, errors in by_category.items():
            doc += f'''### {category.name} Errors

| Code | Name | HTTP | Message | Retryable |
|------|------|------|---------|-----------|
'''
            for error in errors:
                retry = "✅" if error.retryable else "❌"
                doc += f"| `{error.code}` | {error.name} | {error.http_status} | {error.message} | {retry} |\n"
            doc += "\n"
        
        doc += '''## Error Response Format

All API errors follow this JSON structure:

```json
{
  "code": "APP-CAT-0001",
  "message": "Human readable error message",
  "details": {
    "field": "additional context"
  },
  "timestamp": "2026-01-24T12:00:00.000Z",
  "requestId": "req-uuid-here"
}
```

## Handling Errors

### Retryable Errors

Errors marked as retryable can be safely retried with exponential backoff:

```javascript
async function retryableRequest(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!error.retryable || i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

### Non-Retryable Errors

These errors require user intervention or code fixes and should not be automatically retried.
'''
        return doc
    
    def _to_camel_case(self, name: str) -> str:
        """Convert UPPER_SNAKE to camelCase"""
        parts = name.lower().split("_")
        return parts[0] + "".join(p.title() for p in parts[1:])
    
    def _to_snake_case(self, name: str) -> str:
        """Convert UPPER_SNAKE to lower_snake"""
        return name.lower()
    
    def export_json(self) -> str:
        """Export error registry as JSON"""
        return json.dumps(self.registry.to_dict(), indent=2)


# Convenience function for quick generation
def generate_error_codes_for_project(
    app_name: str,
    include_custom: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate complete error code package for a project"""
    generator = ErrorCodeGenerator(app_name)
    generator.generate_standard_errors()
    
    # Add any custom errors
    if include_custom:
        for custom in include_custom:
            generator.add_custom_error(**custom)
    
    return {
        "registry": generator.registry.to_dict(),
        "typescript": generator.generate_typescript_errors(),
        "python": generator.generate_python_errors(),
        "documentation": generator.generate_error_documentation(),
        "json": generator.export_json()
    }
