import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Key, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getStoredAPIKeys, saveAPIKeys, clearAPIKeys, hasAnyAPIKey, type APIKeys } from "@/lib/api-keys";

export default function Settings() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<APIKeys>({
    gemini: "",
    openai: "",
    anthropic: "",
  });
  const [showKeys, setShowKeys] = useState({
    gemini: false,
    openai: false,
    anthropic: false,
  });
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    // Load API keys from localStorage
    const storedKeys = getStoredAPIKeys();
    if (storedKeys) {
      setKeys(storedKeys);
    }
  }, []);

  const handleSave = async () => {
    // Validate at least one key is provided
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
      // Validate API keys with the backend
      const response = await fetch('/api/validate-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(keys),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: "Validation Failed",
          description: data.error || "Failed to validate API keys. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Check validation results
      const { valid, results } = data;

      if (!valid) {
        // Build error message based on validation results
        let errorMessage = '';
        
        if (results.gemini && !results.gemini.valid) {
          errorMessage = `Gemini: ${results.gemini.error || 'Invalid key'}`;
        }
        
        if (results.openai && keys.openai && !results.openai.valid) {
          errorMessage += (errorMessage ? '\n' : '') + `OpenAI: ${results.openai.error || 'Invalid key'}`;
        }
        
        if (results.anthropic && keys.anthropic && !results.anthropic.valid) {
          errorMessage += (errorMessage ? '\n' : '') + `Anthropic: ${results.anthropic.error || 'Invalid key'}`;
        }

        toast({
          title: "Invalid API Keys",
          description: errorMessage || "One or more API keys are invalid.",
          variant: "destructive",
        });
        return;
      }

      // All validations passed - save to localStorage
      saveAPIKeys(keys);
      
      // Build success message
      const validKeys = [];
      if (results.gemini?.valid) validKeys.push('Gemini');
      if (results.openai?.valid) validKeys.push('OpenAI');
      if (results.anthropic?.valid) validKeys.push('Anthropic');

      toast({
        title: "API Keys Validated & Saved",
        description: `Successfully validated and saved: ${validKeys.join(', ')}`,
      });
    } catch (error: any) {
      console.error('API key validation error:', error);
      toast({
        title: "Validation Error",
        description: "Failed to validate API keys. Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleClear = () => {
    setKeys({
      gemini: "",
      openai: "",
      anthropic: "",
    });
    clearAPIKeys();
    
    toast({
      title: "API Keys Cleared",
      description: "All API keys have been removed from your browser.",
    });
  };

  const hasKeys = hasAnyAPIKey(keys);

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

              {/* Gemini API Key */}
              <div className="space-y-2 mb-4">
                <Label htmlFor="gemini-key" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Google Gemini API Key
                  <span className="text-xs text-muted-foreground">(Recommended)</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="gemini-key"
                    type={showKeys.gemini ? "text" : "password"}
                    value={keys.gemini}
                    onChange={(e) => setKeys({ ...keys, gemini: e.target.value })}
                    placeholder="Enter your Gemini API key"
                    data-testid="input-gemini-key"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setShowKeys({ ...showKeys, gemini: !showKeys.gemini })}
                    data-testid="button-toggle-gemini"
                  >
                    {showKeys.gemini ? "Hide" : "Show"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from{" "}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>

              {/* OpenAI API Key */}
              <div className="space-y-2 mb-4">
                <Label htmlFor="openai-key" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  OpenAI API Key
                  <span className="text-xs text-muted-foreground">(Optional)</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="openai-key"
                    type={showKeys.openai ? "text" : "password"}
                    value={keys.openai}
                    onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
                    placeholder="Enter your OpenAI API key"
                    data-testid="input-openai-key"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setShowKeys({ ...showKeys, openai: !showKeys.openai })}
                    data-testid="button-toggle-openai"
                  >
                    {showKeys.openai ? "Hide" : "Show"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    OpenAI Platform
                  </a>
                </p>
              </div>

              {/* Anthropic API Key */}
              <div className="space-y-2 mb-6">
                <Label htmlFor="anthropic-key" className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Anthropic API Key
                  <span className="text-xs text-muted-foreground">(Optional)</span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="anthropic-key"
                    type={showKeys.anthropic ? "text" : "password"}
                    value={keys.anthropic}
                    onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })}
                    placeholder="Enter your Anthropic API key"
                    data-testid="input-anthropic-key"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setShowKeys({ ...showKeys, anthropic: !showKeys.anthropic })}
                    data-testid="button-toggle-anthropic"
                  >
                    {showKeys.anthropic ? "Hide" : "Show"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your API key from{" "}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Anthropic Console
                  </a>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button 
                  onClick={handleSave} 
                  disabled={isValidating}
                  data-testid="button-save-keys"
                >
                  {isValidating ? "Validating..." : "Save API Keys"}
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
