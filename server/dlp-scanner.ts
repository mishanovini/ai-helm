/**
 * Data Loss Prevention (DLP) Scanner
 *
 * Scans user messages for sensitive data patterns (PII, financial data,
 * credentials) before they are sent to external LLM providers. Detects
 * and optionally redacts sensitive information to prevent accidental
 * data exposure.
 *
 * This is a client-side (server-internal) scanner — it runs before the
 * message leaves AI Helm, not on the LLM response.
 */

/** A single piece of sensitive data detected in a message */
export interface DLPFinding {
  /** Category of sensitive data (e.g., "credit_card", "ssn") */
  type: DLPCategory;
  /** Human-readable label for display */
  label: string;
  /** The matched text (masked for display — only first/last chars shown) */
  maskedMatch: string;
  /** Start index in the original message */
  startIndex: number;
  /** End index in the original message */
  endIndex: number;
}

/** Result of scanning a message for sensitive data */
export interface DLPScanResult {
  /** Whether any sensitive data was found */
  hasSensitiveData: boolean;
  /** List of findings, ordered by position in message */
  findings: DLPFinding[];
  /** Message with sensitive data redacted (replacements use [REDACTED_TYPE]) */
  redactedMessage: string;
  /** Short summary for UI display (e.g., "1 credit card number, 2 email addresses") */
  summary: string;
}

export type DLPCategory =
  | "credit_card"
  | "ssn"
  | "phone"
  | "email"
  | "api_key"
  | "ip_address"
  | "iban"
  | "passport";

interface DLPPattern {
  type: DLPCategory;
  label: string;
  pattern: RegExp;
  /** Optional validation function to reduce false positives */
  validate?: (match: string) => boolean;
  /** Redaction placeholder */
  redactAs: string;
}

/**
 * Luhn algorithm check for credit card number validation.
 * Reduces false positives from random 16-digit sequences.
 */
function luhnCheck(digits: string): boolean {
  const nums = digits.replace(/\D/g, "");
  let sum = 0;
  let alternate = false;
  for (let i = nums.length - 1; i >= 0; i--) {
    let n = parseInt(nums[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/** Mask a matched string for display, showing only first and last 2 chars */
function maskMatch(match: string): string {
  const cleaned = match.trim();
  if (cleaned.length <= 4) return "****";
  return cleaned.slice(0, 2) + "*".repeat(Math.max(cleaned.length - 4, 3)) + cleaned.slice(-2);
}

/**
 * DLP patterns ordered from most-specific to least-specific.
 * Each pattern uses word boundaries or surrounding context to minimize
 * false positives in natural language.
 */
const DLP_PATTERNS: DLPPattern[] = [
  // Credit card numbers (13-19 digits, with optional separators)
  {
    type: "credit_card",
    label: "Credit card number",
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    validate: (match) => {
      const digits = match.replace(/\D/g, "");
      // Must be 13-19 digits and pass Luhn check
      if (digits.length < 13 || digits.length > 19) return false;
      // Must start with valid card prefix (Visa, MC, Amex, Discover, etc.)
      const validPrefixes = ["4", "5", "6", "34", "37", "30", "36", "38"];
      const hasValidPrefix = validPrefixes.some(p => digits.startsWith(p));
      return hasValidPrefix && luhnCheck(digits);
    },
    redactAs: "[REDACTED_CREDIT_CARD]",
  },

  // Social Security Numbers (XXX-XX-XXXX)
  {
    type: "ssn",
    label: "Social Security number",
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    validate: (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length !== 9) return false;
      const area = parseInt(digits.substring(0, 3), 10);
      const group = parseInt(digits.substring(3, 5), 10);
      const serial = parseInt(digits.substring(5), 10);
      // SSN rules: area 001-899 (not 666), group 01-99, serial 0001-9999
      if (area === 0 || area === 666 || area >= 900) return false;
      if (group === 0 || serial === 0) return false;
      return true;
    },
    redactAs: "[REDACTED_SSN]",
  },

  // API keys and tokens (common formats)
  {
    type: "api_key",
    label: "API key or token",
    pattern: /\b(?:sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{30,}|ghp_[a-zA-Z0-9]{36,}|glpat-[a-zA-Z0-9_-]{20,}|xox[baprs]-[a-zA-Z0-9-]{10,}|AKIA[A-Z0-9]{16})\b/g,
    redactAs: "[REDACTED_API_KEY]",
  },

  // IBAN (International Bank Account Number)
  {
    type: "iban",
    label: "Bank account (IBAN)",
    pattern: /\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?(?:[\dA-Z]{4}[\s]?){1,7}[\dA-Z]{1,4}\b/g,
    validate: (match) => {
      const cleaned = match.replace(/\s/g, "");
      return cleaned.length >= 15 && cleaned.length <= 34;
    },
    redactAs: "[REDACTED_IBAN]",
  },

  // Passport numbers (common formats: 1-2 letters + 6-9 digits)
  {
    type: "passport",
    label: "Passport number",
    // Only match when preceded by context clues (passport, travel document)
    pattern: /(?:passport|travel\s+document|document)\s*(?:#|number|no\.?)?\s*:?\s*([A-Z]{1,2}\d{6,9})\b/gi,
    redactAs: "[REDACTED_PASSPORT]",
  },

  // Phone numbers (US and international formats)
  {
    type: "phone",
    label: "Phone number",
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    validate: (match) => {
      const digits = match.replace(/\D/g, "");
      // Must be 10 or 11 digits (with/without country code)
      if (digits.length < 10 || digits.length > 11) return false;
      // Exclude obvious non-phone patterns (all same digit, sequential)
      if (/^(.)\1+$/.test(digits)) return false;
      return true;
    },
    redactAs: "[REDACTED_PHONE]",
  },

  // Email addresses
  {
    type: "email",
    label: "Email address",
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    validate: (match) => {
      // Exclude common placeholder/example emails
      const lower = match.toLowerCase();
      const excludePatterns = [
        "example.com", "test.com", "placeholder.com", "your-email",
        "user@", "email@", "name@", "demo.local",
      ];
      return !excludePatterns.some(p => lower.includes(p));
    },
    redactAs: "[REDACTED_EMAIL]",
  },

  // IPv4 addresses (with context — avoid matching version numbers)
  {
    type: "ip_address",
    label: "IP address",
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    validate: (match) => {
      // Exclude common non-sensitive IPs (localhost, private ranges used in examples)
      const excluded = ["127.0.0.1", "0.0.0.0", "255.255.255.255", "192.168.1.1", "10.0.0.1"];
      return !excluded.includes(match);
    },
    redactAs: "[REDACTED_IP]",
  },
];

/**
 * Scan a message for sensitive data patterns.
 *
 * @param message - The user's raw message text
 * @returns Scan result with findings, redacted message, and summary
 */
export function scanForSensitiveData(message: string): DLPScanResult {
  const findings: DLPFinding[] = [];

  for (const dlpPattern of DLP_PATTERNS) {
    // Reset regex lastIndex for global patterns
    dlpPattern.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = dlpPattern.pattern.exec(message)) !== null) {
      const matchText = match[1] || match[0]; // Use capture group if present
      const startIndex = match.index + (match[0].indexOf(matchText));
      const endIndex = startIndex + matchText.length;

      // Run optional validation to reduce false positives
      if (dlpPattern.validate && !dlpPattern.validate(matchText)) {
        continue;
      }

      // Check for overlapping findings (keep the more specific one)
      const overlaps = findings.some(
        f => startIndex < f.endIndex && endIndex > f.startIndex
      );
      if (overlaps) continue;

      findings.push({
        type: dlpPattern.type,
        label: dlpPattern.label,
        maskedMatch: maskMatch(matchText),
        startIndex,
        endIndex,
      });
    }
  }

  // Sort findings by position
  findings.sort((a, b) => a.startIndex - b.startIndex);

  // Build redacted message
  let redactedMessage = message;
  // Apply redactions in reverse order to preserve indices
  for (let i = findings.length - 1; i >= 0; i--) {
    const f = findings[i];
    const pattern = DLP_PATTERNS.find(p => p.type === f.type);
    if (pattern) {
      redactedMessage =
        redactedMessage.slice(0, f.startIndex) +
        pattern.redactAs +
        redactedMessage.slice(f.endIndex);
    }
  }

  // Build summary
  const typeCounts: Record<string, number> = {};
  for (const f of findings) {
    typeCounts[f.label] = (typeCounts[f.label] || 0) + 1;
  }
  const summaryParts: string[] = [];
  for (const label of Object.keys(typeCounts)) {
    const count = typeCounts[label];
    summaryParts.push(`${count} ${label}${count > 1 ? "s" : ""}`);
  }

  return {
    hasSensitiveData: findings.length > 0,
    findings,
    redactedMessage,
    summary: summaryParts.length > 0
      ? `Detected: ${summaryParts.join(", ")}`
      : "",
  };
}
