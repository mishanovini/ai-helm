/**
 * Settings Page — API Key Management
 *
 * Allows users to configure API keys for Gemini, OpenAI, and Anthropic.
 * Keys are stored in browser localStorage only (never server-side).
 *
 * Security features:
 * - Validates all keys against provider APIs before saving
 * - Blocks save if any key fails validation
 * - Per-key inline validation on blur with debounce
 * - Previously-saved keys display masked; Show button only works for freshly-entered keys
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon,
  Key,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  XCircle,
  Loader2,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getStoredAPIKeys, saveAPIKeys, clearAPIKeys, hasAnyAPIKey, type APIKeys } from "@/lib/api-keys";
import { ProgressCard } from "@/components/PromptProgressWidget";
import { useAuth } from "@/hooks/use-auth";

type Provider = "gemini" | "openai" | "anthropic";

interface ValidationState {
  status: "idle" | "validating" | "valid" | "invalid";
  error?: string;
}

/** Mask a key for display, showing only first 4 and last 4 characters */
function maskKey(key: string): string {
  if (!key || key.length < 8) return "••••••••";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

export default function Settings() {
  const { toast } = useToast();
  const { isAuthenticated, authRequired } = useAuth();

  // The actual key values (real text when fresh, real text from storage when loaded)
  const [keys, setKeys] = useState<APIKeys>({
    gemini: "",
    openai: "",
    anthropic: "",
  });

  // Track which keys were just entered in this session (vs loaded from storage)
  const [freshKeys, setFreshKeys] = useState({
    gemini: false,
    openai: false,
    anthropic: false,
  });

  // Show/hide toggle per key — only functional for fresh keys
  const [showKeys, setShowKeys] = useState({
    gemini: false,
    openai: false,
    anthropic: false,
  });

  // Per-key inline validation status
  const [keyStatus, setKeyStatus] = useState<Record<Provider, ValidationState>>({
    gemini: { status: "idle" },
    openai: { status: "idle" },
    anthropic: { status: "idle" },
  });

  const [isValidating, setIsValidating] = useState(false);

  // Debounce timers for inline validation
  const debounceTimers = useRef<Record<Provider, NodeJS.Timeout | null>>({
    gemini: null,
    openai: null,
    anthropic: null,
  });

  useEffect(() => {
    const storedKeys = getStoredAPIKeys();
    if (storedKeys) {
      setKeys(storedKeys);
      // All loaded keys are NOT fresh — they display masked
    }
  }, []);

  /** Validate a single key against its provider API */
  const validateSingleKey = useCallback(async (provider: Provider, key: string) => {
    if (!key.trim()) {
      setKeyStatus(prev => ({ ...prev, [provider]: { status: "idle" } }));
      return;
    }

    setKeyStatus(prev => ({ ...prev, [provider]: { status: "validating" } }));

    try {
      const response = await fetch("/api/validate-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, key }),
      });
      const data = await response.json();

      setKeyStatus(prev => ({
        ...prev,
        [provider]: data.valid
          ? { status: "valid" }
          : { status: "invalid", error: data.error || "Invalid key" },
      }));
    } catch {
      setKeyStatus(prev => ({
        ...prev,
        [provider]: { status: "invalid", error: "Validation unavailable" },
      }));
    }
  }, []);

  /** Handle key input change — mark as fresh and schedule inline validation */
  const handleKeyChange = useCallback((provider: Provider, value: string) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
    setFreshKeys(prev => ({ ...prev, [provider]: true }));

    // Reset validation status on change
    setKeyStatus(prev => ({ ...prev, [provider]: { status: "idle" } }));

    // Clear existing debounce timer
    if (debounceTimers.current[provider]) {
      clearTimeout(debounceTimers.current[provider]!);
    }

    // Schedule inline validation after 500ms
    if (value.trim()) {
      debounceTimers.current[provider] = setTimeout(() => {
        validateSingleKey(provider, value);
      }, 500);
    }
  }, [validateSingleKey]);

  /** Handle blur — trigger immediate validation if key is non-empty */
  const handleKeyBlur = useCallback((provider: Provider) => {
    const key = keys[provider];
    if (key.trim() && freshKeys[provider]) {
      // Clear debounce and validate immediately on blur
      if (debounceTimers.current[provider]) {
        clearTimeout(debounceTimers.current[provider]!);
      }
      validateSingleKey(provider, key);
    }
  }, [keys, freshKeys, validateSingleKey]);

  /** Save handler — validates ALL keys BEFORE saving */
  const handleSave = async () => {
    if (!hasAnyAPIKey(keys)) {
      toast({
        title: "No API Keys",
        description: "Please provide at least one API key to use the application.",
        variant: "destructive",
      });
      return;
    }

    setIsValidating(true);

    try {
      const response = await fetch("/api/validate-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(keys),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Validation Failed",
          description: "Could not validate your API keys. Please try again.",
          variant: "destructive",
        });
        return;
      }

      const { valid, results } = data;

      // Update per-key status from bulk validation
      const providers: Provider[] = ["gemini", "openai", "anthropic"];
      const newStatus = { ...keyStatus };
      for (const p of providers) {
        if (keys[p]) {
          newStatus[p] = results[p]?.valid
            ? { status: "valid" }
            : { status: "invalid", error: results[p]?.error || "Invalid key" };
        }
      }
      setKeyStatus(newStatus);

      if (!valid) {
        // Build error message listing which keys failed
        const failures = providers
          .filter(p => keys[p] && results[p] && !results[p].valid)
          .map(p => `${p.charAt(0).toUpperCase() + p.slice(1)}: ${results[p].error || "Invalid key"}`);

        toast({
          title: "Invalid API Keys",
          description: failures.join(". ") || "One or more keys failed validation.",
          variant: "destructive",
        });
        return; // DO NOT save
      }

      // All provided keys passed — now save
      saveAPIKeys(keys);

      // After saving, mark all keys as no longer fresh (they're now stored)
      setFreshKeys({ gemini: false, openai: false, anthropic: false });
      setShowKeys({ gemini: false, openai: false, anthropic: false });

      const validKeys = providers.filter(p => results[p]?.valid).map(
        p => p.charAt(0).toUpperCase() + p.slice(1)
      );

      toast({
        title: "API Keys Validated & Saved",
        description: `Successfully validated and saved: ${validKeys.join(", ")}`,
      });
    } catch (error: any) {
      console.error("API key validation error:", error);
      toast({
        title: "Validation Error",
        description: "Could not connect to the validation service. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleClear = () => {
    setKeys({ gemini: "", openai: "", anthropic: "" });
    setFreshKeys({ gemini: false, openai: false, anthropic: false });
    setShowKeys({ gemini: false, openai: false, anthropic: false });
    setKeyStatus({
      gemini: { status: "idle" },
      openai: { status: "idle" },
      anthropic: { status: "idle" },
    });
    clearAPIKeys();

    toast({
      title: "API Keys Cleared",
      description: "All API keys have been removed from your browser.",
    });
  };

  const hasKeys = hasAnyAPIKey(keys);

  /** Render a single API key input row with validation indicators and show/hide */
  const renderKeyInput = (
    provider: Provider,
    label: string,
    recommended: boolean,
    helpUrl: string,
    helpLabel: string,
  ) => {
    const isFresh = freshKeys[provider];
    const status = keyStatus[provider];
    const keyValue = keys[provider];
    const isShowing = showKeys[provider];

    // For non-fresh keys, display masked value in the input
    const displayValue = isFresh ? keyValue : (keyValue ? maskKey(keyValue) : "");

    return (
      <div className="space-y-2 mb-4" key={provider}>
        <Label htmlFor={`${provider}-key`} className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          {label}
          <span className="text-xs text-muted-foreground">
            ({recommended ? "Recommended" : "Optional"})
          </span>
          {/* Inline validation indicator */}
          {status.status === "validating" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1" />
          )}
          {status.status === "valid" && (
            <CheckCircle2 className="h-4 w-4 text-green-500 ml-1" />
          )}
          {status.status === "invalid" && (
            <span className="flex items-center gap-1 ml-1" title={status.error}>
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs text-red-500">{status.error}</span>
            </span>
          )}
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${provider}-key`}
            type={isFresh && isShowing ? "text" : "password"}
            value={displayValue}
            onChange={(e) => handleKeyChange(provider, e.target.value)}
            onBlur={() => handleKeyBlur(provider)}
            onFocus={() => {
              // When focusing a non-fresh field, clear the masked value so user can type
              if (!isFresh && keyValue) {
                setKeys(prev => ({ ...prev, [provider]: "" }));
                setFreshKeys(prev => ({ ...prev, [provider]: true }));
                setKeyStatus(prev => ({ ...prev, [provider]: { status: "idle" } }));
              }
            }}
            placeholder={keyValue && !isFresh ? "Key saved — click to replace" : `Enter your ${label}`}
            data-testid={`input-${provider}-key`}
          />
          {isFresh ? (
            <Button
              variant="outline"
              onClick={() => setShowKeys(prev => ({ ...prev, [provider]: !isShowing }))}
              data-testid={`button-toggle-${provider}`}
            >
              {isShowing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          ) : keyValue ? (
            <Button variant="outline" disabled title="Saved keys are hidden for security">
              <Lock className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Get your API key from{" "}
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            {helpLabel}
          </a>
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <SettingsIcon className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Settings</h1>
            </div>
            <Link href="/">
              <Button variant="outline" data-testid="button-back-to-chat">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Chat
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground">
            Configure at least one AI provider API key. Gemini is recommended for full feature access.
          </p>
        </div>

        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Privacy Note:</strong> Your API keys are stored locally in your browser only.
            They are never sent to our servers or stored in any database. They are only transmitted
            directly to the respective AI providers (Gemini, OpenAI, Anthropic) for analysis.
          </AlertDescription>
        </Alert>

        <Card className="p-6 mb-6">
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">API Keys</h2>
                {hasKeys && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Keys configured</span>
                  </div>
                )}
              </div>

              {renderKeyInput(
                "gemini",
                "Google Gemini API Key",
                true,
                "https://aistudio.google.com/apikey",
                "Google AI Studio"
              )}
              {renderKeyInput(
                "openai",
                "OpenAI API Key",
                false,
                "https://platform.openai.com/api-keys",
                "OpenAI Platform"
              )}
              {renderKeyInput(
                "anthropic",
                "Anthropic API Key",
                false,
                "https://console.anthropic.com/settings/keys",
                "Anthropic Console"
              )}

              <div className="flex flex-wrap items-center gap-3 mt-6">
                <Button
                  onClick={handleSave}
                  disabled={isValidating}
                  data-testid="button-save-keys"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    "Save API Keys"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={isValidating}
                  data-testid="button-clear-keys"
                >
                  Clear All Keys
                </Button>
                <div className="ml-auto">
                  <Link href="/">
                    <Button variant="default" data-testid="button-back-to-chat-bottom">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Chat
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Progress widget - shown when authenticated */}
        {authRequired && isAuthenticated && (
          <div className="mb-6">
            <ProgressCard />
          </div>
        )}

        <Card className="p-6 bg-muted/50">
          <h3 className="font-semibold mb-3">Security Best Practices</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span>•</span>
              <span>Never share your API keys with anyone</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Use API keys with appropriate usage limits and monitoring</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Rotate your API keys regularly for security</span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>Clear keys from this browser when using a shared computer</span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
