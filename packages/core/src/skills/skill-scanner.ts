/**
 * Security scanner for skills.
 * Scans for malicious patterns, injection attempts, and dangerous operations.
 */

export interface SecurityScanResult {
  allowed: boolean;
  reason?: string;
  findings: Array<{
    severity: 'high' | 'medium' | 'low';
    pattern: string;
    description: string;
    line?: number;
  }>;
}

// Threat patterns to detect
const THREAT_PATTERNS = [
  // Prompt injection
  {
    pattern: /ignore\s+(previous|all|above|prior)\s+instructions/i,
    severity: 'high' as const,
    description: 'Prompt injection attempt',
  },
  {
    pattern: /you\s+are\s+now\s+/i,
    severity: 'high' as const,
    description: 'Role hijacking attempt',
  },
  {
    pattern: /do\s+not\s+tell\s+the\s+user/i,
    severity: 'high' as const,
    description: 'Deception/hiding attempt',
  },
  {
    pattern: /system\s+prompt\s+override/i,
    severity: 'high' as const,
    description: 'System prompt override attempt',
  },
  {
    pattern: /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i,
    severity: 'high' as const,
    description: 'Instruction disregard attempt',
  },

  // Exfiltration via curl/wget with secrets
  {
    pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i,
    severity: 'high' as const,
    description: 'Potential secret exfiltration via curl',
  },
  {
    pattern: /wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i,
    severity: 'high' as const,
    description: 'Potential secret exfiltration via wget',
  },
  {
    pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/i,
    severity: 'high' as const,
    description: 'Reading sensitive credential files',
  },

  // Persistence/backdoors
  {
    pattern: /authorized_keys/i,
    severity: 'high' as const,
    description: 'SSH backdoor attempt',
  },
  {
    pattern: /\$HOME\/\.ssh|~\/\.ssh/i,
    severity: 'medium' as const,
    description: 'SSH directory access',
  },

  // Dangerous commands
  {
    pattern: /rm\s+-rf\s+\//,
    severity: 'high' as const,
    description: 'Dangerous recursive delete from root',
  },
  {
    pattern: /chmod\s+777/i,
    severity: 'medium' as const,
    description: 'Overly permissive file permissions',
  },
  {
    pattern: /eval\s*\(/i,
    severity: 'medium' as const,
    description: 'Dynamic code evaluation (eval)',
  },
];

// Invisible unicode characters that could be used for injection
const INVISIBLE_CHARS = [
  '\u200b', // Zero-width space
  '\u200c', // Zero-width non-joiner
  '\u200d', // Zero-width joiner
  '\u2060', // Word joiner
  '\ufeff', // Zero-width no-break space
  '\u202a', // Left-to-right embedding
  '\u202b', // Right-to-left embedding
  '\u202c', // Pop directional formatting
  '\u202d', // Left-to-right override
  '\u202e', // Right-to-left override
];

/**
 * Scan skill content for security threats.
 */
export function scanSkillContent(content: string): SecurityScanResult {
  const findings: SecurityScanResult['findings'] = [];

  // Check for invisible unicode characters
  for (const char of INVISIBLE_CHARS) {
    if (content.includes(char)) {
      findings.push({
        severity: 'high',
        pattern: `U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`,
        description: 'Invisible unicode character detected (possible injection)',
      });
    }
  }

  // Check threat patterns
  const lines = content.split('\n');
  for (const { pattern, severity, description } of THREAT_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        findings.push({
          severity,
          pattern: pattern.source,
          description,
          line: i + 1,
        });
      }
    }
  }

  // Determine if allowed
  const hasHighSeverity = findings.some((f) => f.severity === 'high');

  return {
    allowed: !hasHighSeverity,
    reason: hasHighSeverity
      ? 'High severity security threats detected'
      : findings.length > 0
        ? 'Medium/low severity findings detected'
        : undefined,
    findings,
  };
}

/**
 * Format scan results for display.
 */
export function formatScanReport(result: SecurityScanResult): string {
  if (result.findings.length === 0) {
    return 'No security issues found.';
  }

  const lines = ['Security scan findings:', ''];

  for (const finding of result.findings) {
    const severity = finding.severity.toUpperCase();
    const location = finding.line ? ` (line ${finding.line})` : '';
    lines.push(`[${severity}]${location} ${finding.description}`);
    lines.push(`  Pattern: ${finding.pattern}`);
    lines.push('');
  }

  return lines.join('\n');
}
