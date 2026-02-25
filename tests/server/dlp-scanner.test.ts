/**
 * Tests for the Data Loss Prevention (DLP) scanner module.
 * Verifies detection of sensitive data patterns (PII, financial data,
 * credentials) and redaction accuracy.
 */

import { describe, it, expect } from "vitest";
import { scanForSensitiveData, type DLPScanResult } from "../../server/dlp-scanner";

describe("DLP Scanner", () => {
  describe("credit card detection", () => {
    it("detects Visa card numbers", () => {
      const result = scanForSensitiveData("My card is 4111 1111 1111 1111");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].type).toBe("credit_card");
      expect(result.redactedMessage).toContain("[REDACTED_CREDIT_CARD]");
    });

    it("detects Mastercard numbers with dashes", () => {
      const result = scanForSensitiveData("Card: 5500-0000-0000-0004");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("credit_card");
    });

    it("rejects numbers that fail Luhn check", () => {
      // 4999999999999999 starts with valid prefix but fails Luhn
      const result = scanForSensitiveData("Random number: 4999999999999999");
      expect(result.findings.filter(f => f.type === "credit_card")).toHaveLength(0);
    });

    it("ignores short digit sequences", () => {
      const result = scanForSensitiveData("My order is 12345678");
      expect(result.findings.filter(f => f.type === "credit_card")).toHaveLength(0);
    });
  });

  describe("SSN detection", () => {
    it("detects SSN with dashes", () => {
      const result = scanForSensitiveData("My SSN is 123-45-6789");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("ssn");
      expect(result.redactedMessage).toContain("[REDACTED_SSN]");
    });

    it("detects SSN with spaces", () => {
      const result = scanForSensitiveData("SSN: 123 45 6789");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("ssn");
    });

    it("rejects invalid SSN areas (000, 666, 900+)", () => {
      expect(scanForSensitiveData("Number: 000-12-3456").hasSensitiveData).toBe(false);
      expect(scanForSensitiveData("Number: 666-12-3456").hasSensitiveData).toBe(false);
      expect(scanForSensitiveData("Number: 900-12-3456").hasSensitiveData).toBe(false);
    });

    it("rejects SSN with zero group or serial", () => {
      expect(scanForSensitiveData("Number: 123-00-6789").hasSensitiveData).toBe(false);
      expect(scanForSensitiveData("Number: 123-45-0000").hasSensitiveData).toBe(false);
    });
  });

  describe("API key detection", () => {
    it("detects OpenAI API keys", () => {
      const result = scanForSensitiveData("My key is sk-proj1234567890abcdefghij");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });

    it("detects Google API keys", () => {
      const result = scanForSensitiveData("Key: AIzaSyC1234567890abcdefghijklmnopqrs");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });

    it("detects GitHub personal access tokens", () => {
      const result = scanForSensitiveData("Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });

    it("detects AWS access key IDs", () => {
      const result = scanForSensitiveData("AWS key: AKIAIOSFODNN7EXAMPLE");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("api_key");
    });
  });

  describe("email detection", () => {
    it("detects real email addresses", () => {
      const result = scanForSensitiveData("Contact me at john.doe@company.org");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("email");
    });

    it("ignores example/placeholder emails", () => {
      const result = scanForSensitiveData("Use user@example.com as a test");
      expect(result.findings.filter(f => f.type === "email")).toHaveLength(0);
    });

    it("ignores demo.local emails", () => {
      const result = scanForSensitiveData("demo-user@demo.local");
      expect(result.findings.filter(f => f.type === "email")).toHaveLength(0);
    });
  });

  describe("phone number detection", () => {
    it("detects US phone numbers", () => {
      const result = scanForSensitiveData("Call me at (555) 123-4567");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("phone");
    });

    it("detects phone with country code", () => {
      const result = scanForSensitiveData("Phone: +1-555-123-4567");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("phone");
    });

    it("rejects repeated digit sequences", () => {
      const result = scanForSensitiveData("ID: 1111111111");
      expect(result.findings.filter(f => f.type === "phone")).toHaveLength(0);
    });
  });

  describe("IP address detection", () => {
    it("detects public IP addresses", () => {
      const result = scanForSensitiveData("Server IP: 203.0.113.45");
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings[0].type).toBe("ip_address");
    });

    it("ignores localhost and common private IPs", () => {
      expect(scanForSensitiveData("Use 127.0.0.1 for testing").findings.filter(f => f.type === "ip_address")).toHaveLength(0);
      expect(scanForSensitiveData("Gateway: 192.168.1.1").findings.filter(f => f.type === "ip_address")).toHaveLength(0);
    });
  });

  describe("multiple findings", () => {
    it("detects multiple types in one message", () => {
      const result = scanForSensitiveData(
        "My email is john@company.org and my SSN is 123-45-6789"
      );
      expect(result.hasSensitiveData).toBe(true);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
      const types = result.findings.map(f => f.type);
      expect(types).toContain("email");
      expect(types).toContain("ssn");
    });

    it("builds correct summary for multiple findings", () => {
      const result = scanForSensitiveData(
        "Email: john@company.org, Phone: (555) 123-4567"
      );
      expect(result.summary).toContain("Email address");
      expect(result.summary).toContain("Phone number");
    });

    it("redacts all findings in the message", () => {
      const result = scanForSensitiveData(
        "SSN: 123-45-6789, Email: john@company.org"
      );
      expect(result.redactedMessage).toContain("[REDACTED_SSN]");
      expect(result.redactedMessage).toContain("[REDACTED_EMAIL]");
      expect(result.redactedMessage).not.toContain("123-45-6789");
      expect(result.redactedMessage).not.toContain("john@company.org");
    });
  });

  describe("safe messages", () => {
    it("returns clean result for normal messages", () => {
      const result = scanForSensitiveData("What is the capital of France?");
      expect(result.hasSensitiveData).toBe(false);
      expect(result.findings).toHaveLength(0);
      expect(result.redactedMessage).toBe("What is the capital of France?");
      expect(result.summary).toBe("");
    });

    it("handles empty messages", () => {
      const result = scanForSensitiveData("");
      expect(result.hasSensitiveData).toBe(false);
    });

    it("does not flag code snippets with similar patterns", () => {
      const result = scanForSensitiveData(
        "function validate(input) { return input.match(/\\d{3}-\\d{2}-\\d{4}/) }"
      );
      // Regex pattern inside code shouldn't trigger SSN detection
      expect(result.findings.filter(f => f.type === "ssn")).toHaveLength(0);
    });
  });
});
