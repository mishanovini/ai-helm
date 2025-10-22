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

// Complete model catalog
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
  
  // OpenAI Models
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
  {
    provider: 'openai',
    model: 'gpt-4o',
    displayName: 'GPT-4o',
    costTier: 'medium',
    speedTier: 'medium',
    contextWindow: 128000,
    strengths: ['legacy', 'stable', 'multimodal', 'audio']
  },
  
  // Anthropic Models
  {
    provider: 'anthropic',
    model: 'claude-haiku-3-5',
    displayName: 'Claude Haiku 3.5',
    costTier: 'ultra-low',
    speedTier: 'ultra-fast',
    contextWindow: 200000,
    strengths: ['speed', 'cost', 'simple-tasks']
  },
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
    model: 'claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    costTier: 'medium',
    speedTier: 'medium',
    contextWindow: 200000,
    strengths: ['balanced', 'coding', 'business', 'multi-step']
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
    model: 'claude-opus-4',
    displayName: 'Claude Opus 4',
    costTier: 'premium',
    speedTier: 'slow',
    contextWindow: 200000,
    strengths: ['deep-reasoning', 'security-audits', 'precision', 'complex']
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-1',
    displayName: 'Claude Opus 4.1',
    costTier: 'premium',
    speedTier: 'slow',
    contextWindow: 200000,
    strengths: ['creative', 'edge-cases', 'code-review', 'polish']
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
  
  // STEP 2: Simple tasks → Try lightweight models first
  if (analysis.isSimpleTask && !analysis.requiresDeepReasoning) {
    // Priority order for simple tasks
    const lightweightPriority = [
      'gemini-2.5-flash-lite',
      'gpt-5-nano',
      'claude-haiku-4-5',
      'gemini-2.5-flash',
      'gpt-5-mini',
      'claude-haiku-3-5'
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
          reasoning: `Simple task detected. Using lightweight ${model.displayName} for speed and cost efficiency`
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
  
  // STEP 4: Task-specific model selection
  switch (analysis.taskType) {
    case 'coding':
      // Claude Sonnet 4.5 > Gemini 2.5 Pro > Claude Sonnet 4 > others
      const codingPriority = [
        'claude-sonnet-4-5',
        'gemini-2.5-pro',
        'claude-sonnet-4',
        'claude-haiku-4-5',
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
            reasoning: `Coding task detected. ${model.displayName} has best coding performance (${model.model === 'claude-sonnet-4-5' ? '77.2% SWE-bench' : 'optimized for code'})`
          };
        }
      }
      break;
      
    case 'math':
      // Gemini 2.5 Pro > Claude Opus > GPT-5
      const mathPriority = ['gemini-2.5-pro', 'claude-opus-4-1', 'claude-opus-4', 'gpt-5'];
      for (const modelId of mathPriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.model !== modelId && m.strengths.includes('math')) || null,
            reasoning: `Mathematical reasoning task. ${model.displayName} excels at math (${model.model === 'gemini-2.5-pro' ? '86.7% AIME' : 'strong reasoning'})`
          };
        }
      }
      break;
      
    case 'creative':
      // Claude models > GPT-5 > Gemini
      const creativePriority = ['claude-opus-4-1', 'claude-sonnet-4-5', 'gpt-5', 'claude-sonnet-4'];
      for (const modelId of creativePriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.provider === 'anthropic' || m.provider === 'openai') || null,
            reasoning: `Creative writing task. ${model.displayName} excels at style preservation and creative content`
          };
        }
      }
      break;
      
    case 'conversation':
      // GPT-5 > Claude Sonnet > Gemini Flash
      const conversationPriority = ['gpt-5', 'claude-sonnet-4-5', 'claude-sonnet-4', 'gemini-2.5-flash'];
      for (const modelId of conversationPriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.model !== modelId) || null,
            reasoning: `Conversational task. ${model.displayName} provides most natural dialogue`
          };
        }
      }
      break;
      
    case 'analysis':
      // Gemini 2.5 Pro > Claude Opus > GPT-5
      const analysisPriority = ['gemini-2.5-pro', 'claude-opus-4-1', 'claude-opus-4', 'gpt-5', 'claude-sonnet-4-5'];
      for (const modelId of analysisPriority) {
        const model = availableModels.find(m => m.model === modelId);
        if (model) {
          return {
            primary: model,
            fallback: availableModels.find(m => m.costTier !== 'ultra-low' && m.model !== modelId) || null,
            reasoning: `Analysis task. ${model.displayName} provides deep analytical capabilities`
          };
        }
      }
      break;
  }
  
  // STEP 5: Deep reasoning tasks
  if (analysis.requiresDeepReasoning) {
    const reasoningPriority = [
      'claude-opus-4-1',
      'claude-opus-4',
      'claude-sonnet-4-5',
      'gemini-2.5-pro',
      'gpt-5'
    ];
    for (const modelId of reasoningPriority) {
      const model = availableModels.find(m => m.model === modelId);
      if (model) {
        return {
          primary: model,
          fallback: availableModels.find(m => m.costTier === 'medium' || m.costTier === 'high') || null,
          reasoning: `Complex reasoning required. ${model.displayName} provides extended thinking capabilities`
        };
      }
    }
  }
  
  // STEP 6: Multimodal requirements
  if (analysis.requiresMultimodal) {
    const multimodalPriority = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-5', 'gpt-4o'];
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
  
  // STEP 7: Default fallback - balanced general-purpose model
  const defaultPriority = [
    'gemini-2.5-flash',  // Best price/performance
    'gpt-5-mini',        // Good balance
    'claude-sonnet-4',   // Reliable workhorse
    'gpt-5',             // General purpose
    'gemini-2.5-pro'     // Powerful but pricier
  ];
  
  for (const modelId of defaultPriority) {
    const model = availableModels.find(m => m.model === modelId);
    if (model) {
      const fallback = availableModels.find(m => m.model !== modelId);
      return {
        primary: model,
        fallback: fallback || null,
        reasoning: `General-purpose task. ${model.displayName} provides balanced performance and cost`
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
