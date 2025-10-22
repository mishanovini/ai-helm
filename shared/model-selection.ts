/**
 * Intelligent Model Selection Decision Tree
 * 
 * Selects the optimal AI model based on:
 * - Task complexity and type
 * - Context size requirements
 * - Speed vs quality trade-offs
 * - Available API providers
 * - Cost optimization
 */

export type Provider = 'gemini' | 'openai' | 'anthropic';

export interface ModelOption {
  provider: Provider;
  model: string;
  displayName: string;
  costTier: 'ultra-low' | 'low' | 'medium' | 'high' | 'premium';
  speedTier: 'ultra-fast' | 'fast' | 'medium' | 'slow';
  contextWindow: number; // in tokens
  strengths: string[];
}

export interface AvailableProviders {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
}

export interface PromptAnalysis {
  estimatedTokens: number;
  isSimpleTask: boolean;
  isSpeedCritical: boolean;
  taskType: 'coding' | 'math' | 'creative' | 'conversation' | 'analysis' | 'general';
  requiresMultimodal: boolean;
  requiresDeepReasoning: boolean;
}

// Pricing info per 1M tokens (input/output)
export interface ModelPricing {
  input: number;
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00 }, // Base tier <200K tokens
  'gpt-5-nano': { input: 0.15, output: 1.50 },
  'gpt-5-mini': { input: 0.50, output: 5.00 },
  'gpt-5': { input: 2.00, output: 8.00 }, // Estimated standard pricing
  'claude-haiku-4-5': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-5': { input: 3.00, output: 15.00 },
  'claude-opus-4-1': { input: 15.00, output: 75.00 },
};

// Complete model catalog (ONLY latest versions)
export const MODEL_CATALOG: ModelOption[] = [
  // Gemini Models
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    costTier: 'ultra-low',
    speedTier: 'ultra-fast',
    contextWindow: 1000000,
    strengths: ['speed', 'cost', 'high-volume', 'simple-tasks']
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    costTier: 'low',
    speedTier: 'fast',
    contextWindow: 1000000,
    strengths: ['balanced', 'multimodal', 'production', 'agents']
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    costTier: 'medium',
    speedTier: 'medium',
    contextWindow: 1000000,
    strengths: ['math', 'science', 'long-context', 'coding', 'web-dev']
  },
  
  // OpenAI Models (latest generation only)
  {
    provider: 'openai',
    model: 'gpt-5-nano',
    displayName: 'GPT-5 Nano',
    costTier: 'ultra-low',
    speedTier: 'ultra-fast',
    contextWindow: 256000,
    strengths: ['speed', 'mobile', 'edge', 'high-volume']
  },
  {
    provider: 'openai',
    model: 'gpt-5-mini',
    displayName: 'GPT-5 Mini',
    costTier: 'low',
    speedTier: 'fast',
    contextWindow: 256000,
    strengths: ['balanced', 'cost-efficient', 'general-purpose']
  },
  {
    provider: 'openai',
    model: 'gpt-5',
    displayName: 'GPT-5',
    costTier: 'medium',
    speedTier: 'medium',
    contextWindow: 256000,
    strengths: ['conversation', 'multimodal', 'reasoning', 'general']
  },
  
  // Anthropic Models (latest generation only)
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    costTier: 'low',
    speedTier: 'ultra-fast',
    contextWindow: 200000,
    strengths: ['speed', 'coding', 'extended-thinking', 'ui-scaffolding']
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    costTier: 'medium',
    speedTier: 'medium',
    contextWindow: 200000,
    strengths: ['best-coding', 'complex-agents', 'system-design', 'production']
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-1',
    displayName: 'Claude Opus 4.1',
    costTier: 'premium',
    speedTier: 'slow',
    contextWindow: 200000,
    strengths: ['creative', 'edge-cases', 'code-review', 'polish', 'deep-reasoning']
  },
];

/**
 * Analyzes the user prompt to determine task characteristics
 */
export function analyzePrompt(prompt: string): PromptAnalysis {
  const lowerPrompt = prompt.toLowerCase();
  const estimatedTokens = Math.ceil(prompt.length / 4); // rough estimate: 1 token ≈ 4 chars
  
  // Simple task detection
  const simpleKeywords = ['translate', 'summarize', 'what is', 'define', 'explain simply', 'format', 'list'];
  const isSimpleTask = simpleKeywords.some(kw => lowerPrompt.includes(kw)) || prompt.length < 200;
  
  // Speed critical detection
  const speedKeywords = ['quick', 'fast', 'urgent', 'real-time', 'immediately'];
  const isSpeedCritical = speedKeywords.some(kw => lowerPrompt.includes(kw));
  
  // Task type detection
  let taskType: PromptAnalysis['taskType'] = 'general';
  if (lowerPrompt.match(/\b(code|coding|program|debug|refactor|function|api|bug)\b/)) {
    taskType = 'coding';
  } else if (lowerPrompt.match(/\b(math|calculate|equation|solve|theorem|proof)\b/)) {
    taskType = 'math';
  } else if (lowerPrompt.match(/\b(write|story|creative|blog|article|poem)\b/)) {
    taskType = 'creative';
  } else if (lowerPrompt.match(/\b(chat|talk|discuss|conversation)\b/)) {
    taskType = 'conversation';
  } else if (lowerPrompt.match(/\b(analyze|research|study|investigate|examine)\b/)) {
    taskType = 'analysis';
  }
  
  // Multimodal detection
  const requiresMultimodal = lowerPrompt.match(/\b(image|video|audio|picture|photo|diagram)\b/) !== null;
  
  // Deep reasoning detection
  const reasoningKeywords = ['complex', 'difficult', 'deep', 'thorough', 'comprehensive', 'detailed analysis'];
  const requiresDeepReasoning = reasoningKeywords.some(kw => lowerPrompt.includes(kw)) || prompt.length > 1000;
  
  return {
    estimatedTokens,
    isSimpleTask,
    isSpeedCritical,
    taskType,
    requiresMultimodal,
    requiresDeepReasoning
  };
}

/**
 * Main decision tree for model selection
 */
export function selectOptimalModel(
  prompt: string,
  availableProviders: AvailableProviders
): { primary: ModelOption; fallback: ModelOption | null; reasoning: string } {
  
  const lowerPrompt = prompt.toLowerCase();
  const analysis = analyzePrompt(prompt);
  const availableModels = MODEL_CATALOG.filter(m => availableProviders[m.provider]);
  
  if (availableModels.length === 0) {
    throw new Error('No API providers available. Please configure at least one API key in Settings.');
  }
  
  // STEP 1: Check if context size requires specific models
  if (analysis.estimatedTokens > 200000) {
    // Only Gemini 2.5 Pro can handle this
    const geminiPro = availableModels.find(m => m.model === 'gemini-2.5-pro');
    if (geminiPro) {
      return {
        primary: geminiPro,
        fallback: null,
        reasoning: `Large context (${analysis.estimatedTokens.toLocaleString()} tokens) requires Gemini 2.5 Pro's 1M token window`
      };
    }
    throw new Error(`Prompt too large (${analysis.estimatedTokens.toLocaleString()} tokens). Please add Gemini API key to handle large contexts.`);
  }
  
  // STEP 2: Default to lightweight models unless there's a clear reason not to
  // Most prompts can be handled by lightweight models efficiently
  
  // Detect substantive creative writing (articles, essays) vs micro-copy (tweets)
  const isSubstantiveCreative = analysis.taskType === 'creative' && (
    // Substantive deliverables
    lowerPrompt.match(/\b(article|essay|blog post|screenplay|story|novel|chapter)\b/) ||
    // Quality adjectives indicating depth
    lowerPrompt.match(/\b(thoughtful|detailed|comprehensive|in-depth|nuanced|elaborate|polished)\b/) ||
    // Length indicates substantive content
    (lowerPrompt.includes('write') && prompt.length > 300)
  );
  
  const needsPremiumModel = 
    analysis.requiresDeepReasoning || 
    isSubstantiveCreative ||
    (analysis.taskType === 'coding' && (
      prompt.toLowerCase().includes('refactor') ||
      prompt.toLowerCase().includes('architect') ||
      prompt.toLowerCase().includes('complex') ||
      prompt.toLowerCase().includes('debug') && prompt.length > 500
    )) ||
    (analysis.taskType === 'math' && prompt.toLowerCase().includes('prove')) ||
    prompt.length > 2000;
  
  if (!needsPremiumModel) {
    // Priority: cheapest and fastest models
    const lightweightPriority = [
      'gemini-2.5-flash-lite',  // $0.10 input
      'gpt-5-nano',             // $0.15 input
      'gemini-2.5-flash',       // $0.30 input
      'gpt-5-mini',             // $0.50 input
      'claude-haiku-4-5'        // $1.00 input
    ];
    
    for (const modelId of lightweightPriority) {
      const model = availableModels.find(m => m.model === modelId);
      if (model) {
        const fallback = availableModels.find(m => 
          m.model !== modelId && (m.costTier === 'low' || m.costTier === 'ultra-low')
        );
        return {
          primary: model,
          fallback: fallback || null,
          reasoning: `Standard task. Using cost-efficient ${model.displayName} (${MODEL_PRICING[model.model].input}¢ per 1K input tokens)`
        };
      }
    }
  }
  
  // STEP 3: Speed-critical tasks
  if (analysis.isSpeedCritical) {
    const fastModels = availableModels
      .filter(m => m.speedTier === 'ultra-fast' || m.speedTier === 'fast')
      .sort((a, b) => {
        const speedOrder = { 'ultra-fast': 0, 'fast': 1, 'medium': 2, 'slow': 3 };
        return speedOrder[a.speedTier] - speedOrder[b.speedTier];
      });
    
    if (fastModels.length > 0) {
      return {
        primary: fastModels[0],
        fallback: fastModels[1] || null,
        reasoning: `Speed-critical task. Using fastest available model: ${fastModels[0].displayName}`
      };
    }
  }
  
  // STEP 4: Task-specific model selection (for premium tasks only)
  switch (analysis.taskType) {
    case 'coding':
      // Complex coding: Claude Sonnet 4.5 > Gemini 2.5 Pro
      // Simple coding: already handled by lightweight models above
      const codingPriority = [
        'claude-sonnet-4-5',  // Best coding (77.2% SWE-bench)
        'gemini-2.5-pro',     // Good coding + cheaper
        'claude-haiku-4-5',   // Fast coding
        'gpt-5',
        'gemini-2.5-flash'
      ];
      for (const modelId of codingPriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          const fallback = availableModels.find(m => 
            m.model !== modelId && m.strengths.includes('coding')
          );
          return {
            primary: model,
            fallback: fallback || null,
            reasoning: `Complex coding task. ${model.displayName} has superior coding capabilities (${model.model === 'claude-sonnet-4-5' ? '77.2% SWE-bench' : 'optimized for complex code'})`
          };
        }
      }
      break;
      
    case 'math':
      // Gemini 2.5 Pro (86.7% AIME) > Claude Opus > GPT-5
      const mathPriority = ['gemini-2.5-pro', 'claude-opus-4-1', 'gpt-5'];
      for (const modelId of mathPriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.model !== modelId && m.strengths.includes('math')) || null,
            reasoning: `Advanced mathematical reasoning. ${model.displayName} excels at complex math (${model.model === 'gemini-2.5-pro' ? '86.7% AIME' : 'strong reasoning'})`
          };
        }
      }
      break;
      
    case 'creative':
      // Claude models excel at creative writing, Gemini Pro as fallback
      const creativePriority = ['claude-opus-4-1', 'claude-sonnet-4-5', 'gpt-5', 'gemini-2.5-pro'];
      for (const modelId of creativePriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.model !== modelId && (m.provider === 'anthropic' || m.provider === 'openai' || m.model === 'gemini-2.5-pro')) || null,
            reasoning: `Creative writing task. ${model.displayName} excels at ${model.provider === 'anthropic' ? 'style preservation and creative content' : 'creative content generation'}`
          };
        }
      }
      break;
      
    case 'conversation':
      // GPT-5 for natural conversation
      const conversationPriority = ['gpt-5', 'claude-sonnet-4-5', 'gemini-2.5-flash'];
      for (const modelId of conversationPriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.model !== modelId) || null,
            reasoning: `Conversational task. ${model.displayName} provides natural, engaging dialogue`
          };
        }
      }
      break;
      
    case 'analysis':
      // Deep analysis tasks
      const analysisPriority = ['gemini-2.5-pro', 'claude-opus-4-1', 'gpt-5', 'claude-sonnet-4-5'];
      for (const modelId of analysisPriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.costTier !== 'ultra-low' && m.model !== modelId) || null,
            reasoning: `Complex analysis task. ${model.displayName} provides deep analytical capabilities`
          };
        }
      }
      break;
  }
  
  // STEP 5: Deep reasoning tasks
  if (analysis.requiresDeepReasoning) {
    const reasoningPriority = [
      'claude-opus-4-1',
      'claude-sonnet-4-5',
      'gemini-2.5-pro',
      'gpt-5'
    ];
    for (const modelId of reasoningPriority) {
      const model = availableModels.find(m => m.model === modelId);
      if (model) {
        return {
          primary: model,
          fallback: availableModels.find(m => m.costTier === 'medium' || m.costTier === 'premium') || null,
          reasoning: `Deep reasoning required. ${model.displayName} provides extended thinking capabilities`
        };
      }
    }
  }
  
  // STEP 6: Multimodal requirements
  if (analysis.requiresMultimodal) {
    const multimodalPriority = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-5'];
    for (const modelId of multimodalPriority) {
      const model = availableModels.find(m => m.model === modelId);
      if (model) {
        return {
          primary: model,
          fallback: availableModels.find(m => m.strengths.includes('multimodal')) || null,
          reasoning: `Multimodal task (image/video/audio). ${model.displayName} has native multimodal support`
        };
      }
    }
  }
  
  // STEP 7: Default fallback - prioritize lightweight models
  const defaultPriority = [
    'gemini-2.5-flash',      // Best price/performance ($0.30)
    'gpt-5-mini',            // Good balance ($0.50)
    'gemini-2.5-flash-lite', // Ultra cheap ($0.10)
    'gpt-5-nano',            // Fast ($0.15)
    'claude-haiku-4-5',      // Fast Claude ($1.00)
    'gpt-5',                 // General purpose ($2.00)
    'gemini-2.5-pro'         // Powerful ($1.25)
  ];
  
  for (const modelId of defaultPriority) {
    const model = availableModels.find(m => m.model === modelId);
    if (model) {
      const fallback = availableModels.find(m => m.model !== modelId);
      return {
        primary: model,
        fallback: fallback || null,
        reasoning: `General task. ${model.displayName} provides best value (${MODEL_PRICING[model.model].input}¢ per 1K tokens)`
      };
    }
  }
  
  // Final fallback: use whatever is available
  return {
    primary: availableModels[0],
    fallback: availableModels[1] || null,
    reasoning: `Using available model: ${availableModels[0].displayName}`
  };
}

/**
 * Get display info about available providers
 */
export function getProviderStatus(availableProviders: AvailableProviders): string {
  const available = [];
  if (availableProviders.gemini) available.push('Gemini');
  if (availableProviders.openai) available.push('OpenAI');
  if (availableProviders.anthropic) available.push('Anthropic');
  
  if (available.length === 0) return 'No providers configured';
  if (available.length === 3) return 'All providers available';
  return `Available: ${available.join(', ')}`;
}

/**
 * Select the cheapest available model for lightweight analysis tasks
 * Priority: Gemini Flash-Lite > GPT-5 Nano > Gemini Flash > Claude Haiku
 */
export function selectCheapestModel(providers: AvailableProviders): ModelOption | null {
  const available = MODEL_CATALOG.filter(m => providers[m.provider]);
  
  if (available.length === 0) {
    return null;
  }
  
  // Sort by input pricing (cheapest first)
  available.sort((a, b) => {
    const priceA = MODEL_PRICING[a.model]?.input || Infinity;
    const priceB = MODEL_PRICING[b.model]?.input || Infinity;
    return priceA - priceB;
  });
  
  return available[0];
}

/**
 * Estimate the cost for a prompt based on token counts
 */
export function estimateCost(
  model: ModelOption,
  inputTokens: number,
  estimatedOutputTokens: number = 500
): { inputCost: number; outputCost: number; totalCost: number; displayText: string } {
  const pricing = MODEL_PRICING[model.model];
  
  if (!pricing) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      displayText: 'Cost estimate unavailable'
    };
  }
  
  // Calculate costs (pricing is per 1M tokens, so divide by 1,000,000)
  const inputCost = (inputTokens / 1000000) * pricing.input;
  const outputCost = (estimatedOutputTokens / 1000000) * pricing.output;
  const totalCost = inputCost + outputCost;
  
  // Format for display
  let displayText: string;
  if (totalCost < 0.001) {
    displayText = `< $0.001`;
  } else if (totalCost < 0.01) {
    displayText = `~$${totalCost.toFixed(4)}`;
  } else if (totalCost < 1) {
    displayText = `~$${totalCost.toFixed(3)}`;
  } else {
    displayText = `~$${totalCost.toFixed(2)}`;
  }
  
  return {
    inputCost,
    outputCost,
    totalCost,
    displayText
  };
}
