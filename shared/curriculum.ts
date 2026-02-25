/**
 * Curriculum/Learning System
 *
 * Lesson definitions for teaching users how to write better prompts,
 * understand model differences, tune parameters, and avoid security pitfalls.
 */

export interface Lesson {
  id: string;
  title: string;
  category: LessonCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[]; // lesson IDs
  estimatedMinutes: number;
  content: string; // Markdown
}

export type LessonCategory =
  | "prompt-basics"
  | "advanced-prompting"
  | "model-differences"
  | "parameter-tuning"
  | "security-awareness";

export const LESSON_CATEGORIES: { id: LessonCategory; label: string; description: string }[] = [
  {
    id: "prompt-basics",
    label: "Prompt Basics",
    description: "Fundamentals of writing effective prompts",
  },
  {
    id: "advanced-prompting",
    label: "Advanced Prompting",
    description: "Advanced techniques for power users",
  },
  {
    id: "model-differences",
    label: "Model Differences",
    description: "Understanding AI model strengths and trade-offs",
  },
  {
    id: "parameter-tuning",
    label: "Parameter Tuning",
    description: "Fine-tuning temperature, top_p, and other parameters",
  },
  {
    id: "security-awareness",
    label: "Security Awareness",
    description: "Recognizing and avoiding prompt injection and misuse",
  },
];

export const LESSONS: Lesson[] = [
  // ========================================================================
  // Prompt Basics
  // ========================================================================
  {
    id: "pb-01-clarity",
    title: "Writing Clear Prompts",
    category: "prompt-basics",
    difficulty: "beginner",
    prerequisites: [],
    estimatedMinutes: 5,
    content: `# Writing Clear Prompts

The single most important factor in getting good AI responses is **clarity**. A clear prompt tells the AI exactly what you need.

## The Problem with Vague Prompts

Consider this prompt: *"Tell me about Python."*

This could mean:
- The programming language
- The snake species
- The Monty Python comedy group

The AI has to guess what you mean, and it might guess wrong.

## How to Be Clear

### 1. State Your Goal
Start by telling the AI what you're trying to accomplish.

**Vague:** "Help me with my code"
**Clear:** "I need to fix a TypeError in my Python function that processes JSON data"

### 2. Provide Context
Give relevant background information.

**Vague:** "Write a function"
**Clear:** "Write a TypeScript function that validates email addresses using a regex pattern, returning true for valid emails and false otherwise"

### 3. Specify the Format
Tell the AI how you want the response structured.

**Vague:** "Explain databases"
**Clear:** "Explain the differences between SQL and NoSQL databases in a comparison table with columns for: data model, scalability, use cases, and examples"

## Practice

Try rewriting these vague prompts to be clearer:
1. "Help me with Excel" → ?
2. "Write something about AI" → ?
3. "Fix my code" → ?

## Key Takeaway

Before sending a prompt, ask yourself: *"Could someone else read this and know exactly what I need?"* If not, add more detail.`,
  },
  {
    id: "pb-02-specificity",
    title: "Being Specific",
    category: "prompt-basics",
    difficulty: "beginner",
    prerequisites: ["pb-01-clarity"],
    estimatedMinutes: 5,
    content: `# Being Specific

Specificity is the difference between a mediocre response and an excellent one. The more specific your prompt, the more targeted the AI's answer.

## The Specificity Spectrum

**Level 1 (Vague):** "Write a story"
**Level 2 (Better):** "Write a short story about a detective"
**Level 3 (Good):** "Write a 500-word mystery story about a detective solving a theft in a small town"
**Level 4 (Excellent):** "Write a 500-word mystery story in first person, about a retired detective who discovers their neighbor's antique clock has been stolen. Include a twist ending. Tone: noir, with dry humor."

## What to Specify

### Length and Scope
- Word/character counts
- Number of items in a list
- Depth of explanation (overview vs. deep dive)

### Audience
- "Explain like I'm 5"
- "For a senior software engineer"
- "For a non-technical stakeholder"

### Constraints
- Technologies to use or avoid
- Style guidelines
- Required sections or format

### Examples
Providing examples of what you want (or don't want) dramatically improves results.

## The "Goldilocks Zone"

Don't be too specific or too vague:
- **Too specific:** The AI has no room for creativity or useful additions
- **Too vague:** The AI makes too many assumptions
- **Just right:** Clear constraints with room for the AI to add value

## Key Takeaway

Think of prompting like ordering at a restaurant. "Give me food" won't work well. "A medium-rare ribeye with roasted vegetables and a side of garlic mashed potatoes" will get you exactly what you want.`,
  },
  {
    id: "pb-03-actionability",
    title: "Making Actionable Requests",
    category: "prompt-basics",
    difficulty: "beginner",
    prerequisites: ["pb-01-clarity"],
    estimatedMinutes: 5,
    content: `# Making Actionable Requests

An actionable prompt gives the AI a clear task with a defined deliverable. The AI should know exactly what to produce.

## Action Verbs Matter

Start your prompts with strong action verbs:

| Instead of... | Try... |
|--------------|--------|
| "I need help with..." | "Debug this..." / "Write a..." / "Explain how..." |
| "Something about..." | "Create a summary of..." / "List the top 5..." |
| "I'm wondering about..." | "Compare X and Y..." / "Analyze the pros and cons of..." |

## Define the Deliverable

Tell the AI exactly what output you expect:

**Unclear:** "Help me with my presentation"
**Actionable:** "Create an outline for a 10-minute presentation about remote work productivity. Include 5 main sections, 3 key statistics I should mention, and a compelling opening hook."

## Break Down Complex Tasks

If you need something complex, break it into steps:

**Instead of:** "Build me a website"
**Try:** "Help me plan a portfolio website. First, suggest a tech stack for a simple static site. Then outline the pages I'll need. Finally, write the HTML structure for the homepage."

## Include Success Criteria

Tell the AI how to know if the response is good:

"Write a product description that:
- Is under 150 words
- Highlights 3 key features
- Includes a call to action
- Uses a professional but friendly tone"

## Key Takeaway

Every prompt should answer: **What** do you want? **How** should it be formatted? **What makes it done?**`,
  },

  // ========================================================================
  // Advanced Prompting
  // ========================================================================
  {
    id: "ap-01-chain-of-thought",
    title: "Chain of Thought Prompting",
    category: "advanced-prompting",
    difficulty: "intermediate",
    prerequisites: ["pb-01-clarity", "pb-02-specificity"],
    estimatedMinutes: 7,
    content: `# Chain of Thought Prompting

Chain of Thought (CoT) prompting encourages the AI to reason step-by-step, dramatically improving accuracy on complex problems.

## Why It Works

When you ask "What is 27 * 34?", the AI might get it wrong. But when you say "What is 27 * 34? Show your step-by-step calculation," the AI breaks it down:
1. 27 * 30 = 810
2. 27 * 4 = 108
3. 810 + 108 = 918

The reasoning process catches errors that direct answers miss.

## How to Use CoT

### Simple Trigger Phrases
- "Think step by step"
- "Let's work through this systematically"
- "Show your reasoning"
- "Walk me through your thought process"

### Structured CoT
Give the AI a reasoning framework:

"Analyze whether we should migrate to microservices:
1. First, list our current pain points
2. Then, evaluate how microservices address each one
3. Next, identify the risks and costs
4. Finally, make a recommendation with justification"

## When to Use CoT

**Great for:**
- Math and logic problems
- Code debugging
- Decision-making analysis
- Complex reasoning tasks

**Not needed for:**
- Simple factual questions
- Creative writing
- Format conversions

## Key Takeaway

When the task requires reasoning, always ask the AI to show its work. You'll get better answers AND be able to verify the logic.`,
  },
  {
    id: "ap-02-few-shot",
    title: "Few-Shot Learning with Examples",
    category: "advanced-prompting",
    difficulty: "intermediate",
    prerequisites: ["pb-02-specificity"],
    estimatedMinutes: 7,
    content: `# Few-Shot Learning with Examples

Few-shot prompting provides examples of the input-output pattern you want. The AI learns the pattern from your examples and applies it to new inputs.

## Zero-Shot vs Few-Shot

**Zero-shot** (no examples):
"Classify this review as positive or negative: 'The food was terrible.'"

**Few-shot** (with examples):
"Classify reviews as positive or negative.

Review: 'Loved the pasta!' → positive
Review: 'Waited an hour for cold food' → negative
Review: 'Best dessert I've ever had' → positive

Review: 'The food was terrible.' → ?"

The few-shot version is more reliable because the AI understands exactly what format and criteria you expect.

## Best Practices

### 1. Use 2-5 Examples
Too few and the pattern isn't clear. Too many and you waste tokens.

### 2. Cover Edge Cases
Include examples that show how to handle tricky situations.

### 3. Be Consistent in Format
All examples should follow the exact same structure.

### 4. Include Diverse Examples
Show the range of inputs the AI might encounter.

## Real-World Example

"Convert these informal messages to professional emails:

Informal: 'hey can u send me that report asap'
Professional: 'Hi [Name], Could you please send me the quarterly report at your earliest convenience? Thank you.'

Informal: 'the server is down again!!'
Professional: 'Dear Team, I wanted to bring to your attention that we are experiencing another server outage. Could someone from the infrastructure team please investigate? Best regards.'

Informal: 'gonna be late to the meeting sry'
Professional: ?"

## Key Takeaway

When words aren't enough to explain what you want, show it. Examples are the most powerful tool for shaping AI output.`,
  },
  {
    id: "ap-03-system-prompts",
    title: "Effective System Prompts",
    category: "advanced-prompting",
    difficulty: "advanced",
    prerequisites: ["ap-01-chain-of-thought", "ap-02-few-shot"],
    estimatedMinutes: 8,
    content: `# Effective System Prompts

System prompts set the AI's persona, constraints, and behavior for an entire conversation. They're the most powerful tool for consistent, high-quality outputs.

## Anatomy of a Great System Prompt

### 1. Role Definition
"You are a senior Python developer with 15 years of experience specializing in data pipelines."

### 2. Behavioral Guidelines
"Always suggest type hints. Prefer functional programming patterns. Explain trade-offs when multiple approaches exist."

### 3. Output Format
"Respond with code blocks using Python syntax highlighting. Include docstrings. Add inline comments for complex logic."

### 4. Constraints
"Never use deprecated APIs. Always handle edge cases. Keep functions under 20 lines when possible."

### 5. Tone and Style
"Be concise and direct. Use technical terminology appropriate for experienced developers. Skip basic explanations unless asked."

## Template

A solid system prompt template:

"You are [role] with expertise in [domain].

Your responses should:
- [Key behavior 1]
- [Key behavior 2]
- [Key behavior 3]

Format: [How to structure responses]
Tone: [Communication style]
Constraints: [What to avoid or limit]"

## Common Mistakes

1. **Too long:** System prompts over 500 words often have diminishing returns
2. **Contradictory rules:** "Be concise" + "Explain everything in detail"
3. **Too generic:** "Be helpful" doesn't add value
4. **No examples:** The best system prompts include 1-2 example interactions

## Key Takeaway

A well-crafted system prompt is like hiring a specialist. Define who they are, what they do, and how they communicate.`,
  },

  // ========================================================================
  // Model Differences
  // ========================================================================
  {
    id: "md-01-providers",
    title: "Understanding AI Providers",
    category: "model-differences",
    difficulty: "beginner",
    prerequisites: [],
    estimatedMinutes: 6,
    content: `# Understanding AI Providers

AI Helm routes your prompts to three major providers. Each has distinct strengths.

## Google Gemini

**Strengths:**
- Exceptional at math and reasoning (86.7% on AIME benchmarks)
- Strong multimodal capabilities (text, images, code)
- Cost-effective for most tasks
- Large context windows

**Best for:** Mathematical problems, data analysis, research tasks, cost-sensitive workloads

## OpenAI (GPT)

**Strengths:**
- Natural, engaging conversational tone
- Strong general knowledge
- Good at following complex instructions
- Reliable output formatting

**Best for:** Conversational AI, content creation, general-purpose tasks, customer-facing applications

## Anthropic (Claude)

**Strengths:**
- Excellent coding abilities (77.2% SWE-bench)
- Strong creative writing with style preservation
- Careful, nuanced reasoning
- Good at long-form content

**Best for:** Code generation and review, creative writing, complex analysis, safety-sensitive applications

## How AI Helm Chooses

The Model Router analyzes your prompt and selects the best model based on:
1. **Task type** (coding, math, creative, etc.)
2. **Complexity** (simple, moderate, complex)
3. **Available API keys** (which providers you've configured)
4. **Router rules** (customizable in the Router page)

## Key Takeaway

No single provider is "best" at everything. AI Helm's intelligent routing ensures your prompts go to the model most likely to give the best response.`,
  },
  {
    id: "md-02-model-tiers",
    title: "Model Tiers: Cost vs. Capability",
    category: "model-differences",
    difficulty: "intermediate",
    prerequisites: ["md-01-providers"],
    estimatedMinutes: 6,
    content: `# Model Tiers: Cost vs. Capability

Each provider offers models at different price/performance points. Understanding these tiers helps you optimize cost without sacrificing quality.

## The Three Tiers

### Tier 1: Economy Models
- **Gemini 2.5 Flash-Lite** / **GPT-5 Nano** / **Claude Haiku 4.5**
- Cost: ~$0.01-0.05 per 1K tokens
- Speed: Fastest responses
- Best for: Simple questions, classification, quick lookups, high-volume tasks

### Tier 2: Balanced Models
- **Gemini 2.5 Flash** / **GPT-5 Mini**
- Cost: ~$0.05-0.15 per 1K tokens
- Speed: Fast
- Best for: Most everyday tasks, moderate complexity, good balance of quality and cost

### Tier 3: Premium Models
- **Gemini 2.5 Pro** / **GPT-5** / **Claude Sonnet 4.5** / **Claude Opus 4.1**
- Cost: ~$0.15-1.00 per 1K tokens
- Speed: Slower
- Best for: Complex reasoning, code generation, creative writing, research

## When to Use Each Tier

| Task | Recommended Tier |
|------|-----------------|
| "What's the capital of France?" | Tier 1 |
| "Summarize this article" | Tier 2 |
| "Debug this async race condition" | Tier 3 |
| "Write a 2000-word blog post" | Tier 3 |
| "Convert this CSV to JSON" | Tier 1 |
| "Analyze our Q3 financial data" | Tier 3 |

## AI Helm's Smart Routing

AI Helm automatically routes simple tasks to cheaper models and complex tasks to premium ones. You can customize this in the Router page.

## Key Takeaway

Using the right model tier for each task can reduce your AI costs by 80%+ without any loss in quality for simple tasks.`,
  },

  // ========================================================================
  // Parameter Tuning
  // ========================================================================
  {
    id: "pt-01-temperature",
    title: "Temperature: Controlling Creativity",
    category: "parameter-tuning",
    difficulty: "intermediate",
    prerequisites: ["pb-01-clarity"],
    estimatedMinutes: 5,
    content: `# Temperature: Controlling Creativity

Temperature is the most important parameter for controlling AI output. It determines how "creative" or "deterministic" the response will be.

## How Temperature Works

Temperature ranges from **0.0 to 2.0** (typically):

- **0.0 - 0.3 (Low):** Very predictable, factual, consistent
- **0.4 - 0.7 (Medium):** Balanced creativity and accuracy
- **0.8 - 1.2 (High):** Creative, varied, sometimes surprising
- **1.3+ (Very High):** Highly creative, potentially incoherent

## When to Use Each Range

### Low Temperature (0.0 - 0.3)
- Code generation
- Factual Q&A
- Data extraction
- Classification tasks
- Anything where accuracy matters more than creativity

### Medium Temperature (0.4 - 0.7)
- General conversation
- Summarization
- Explanation of concepts
- Most everyday tasks

### High Temperature (0.8 - 1.2)
- Creative writing
- Brainstorming
- Generating diverse ideas
- Poetry and artistic content

## AI Helm's Automatic Tuning

AI Helm analyzes your prompt and automatically adjusts temperature based on the detected task type. You can see the selected parameters in the Analysis Dashboard.

## Key Takeaway

Think of temperature as a "creativity dial." Turn it down for accuracy, up for creativity. Most tasks work best in the 0.3-0.7 range.`,
  },
  {
    id: "pt-02-top-p-tokens",
    title: "Top-P and Max Tokens",
    category: "parameter-tuning",
    difficulty: "advanced",
    prerequisites: ["pt-01-temperature"],
    estimatedMinutes: 6,
    content: `# Top-P and Max Tokens

Beyond temperature, two other parameters significantly affect AI output quality.

## Top-P (Nucleus Sampling)

Top-P controls the pool of words the AI considers for each token.

- **Top-P = 1.0:** Consider ALL possible words (default)
- **Top-P = 0.9:** Only consider words in the top 90% probability
- **Top-P = 0.5:** Only consider the top 50% most likely words

### When to Adjust Top-P

Usually, keep top_p at 1.0 and adjust temperature instead. But there are exceptions:

- **Technical writing:** top_p = 0.85 (avoids unusual word choices)
- **Code generation:** top_p = 0.9 (prevents syntax errors from unlikely tokens)
- **Creative writing:** top_p = 1.0 (full vocabulary available)

### Important: Don't Combine Extreme Values

If you set BOTH temperature high AND top_p low (or vice versa), the effects can cancel each other out or produce unexpected results. Adjust one at a time.

## Max Tokens

Max tokens sets the maximum length of the AI's response.

- **1 token ≈ 4 characters** (in English)
- **100 tokens ≈ 75 words**
- **1000 tokens ≈ 750 words**

### Guidelines

| Task | Suggested Max Tokens |
|------|---------------------|
| Short answer | 100-200 |
| Paragraph explanation | 300-500 |
| Code function | 500-1000 |
| Long article | 2000-4000 |
| Detailed analysis | 1000-2000 |

Setting max_tokens too low truncates the response. Setting it too high wastes money (you pay for generated tokens).

## Key Takeaway

For most users, the defaults work well. Adjust temperature for creativity, max_tokens for length. Leave top_p alone unless you have a specific reason.`,
  },

  // ========================================================================
  // Security Awareness
  // ========================================================================
  {
    id: "sa-01-prompt-injection",
    title: "Understanding Prompt Injection",
    category: "security-awareness",
    difficulty: "intermediate",
    prerequisites: [],
    estimatedMinutes: 6,
    content: `# Understanding Prompt Injection

Prompt injection is a security risk where malicious input attempts to override an AI system's instructions. As an AI Helm user, understanding this helps you write safer prompts and recognize when content may be trying to manipulate the system.

## What Is Prompt Injection?

When AI systems process user input, they can't always distinguish between legitimate instructions and malicious commands embedded in the input. Attackers exploit this to:

- Override safety guidelines
- Extract system prompts
- Generate harmful content
- Bypass content filters

## How AI Helm Protects You

AI Helm's security analysis scores every prompt on a 0-10 scale:

- **0-2:** Safe, normal query
- **3-4:** Low risk
- **5-6:** Medium risk, flagged for review
- **7-8:** High risk, may be blocked
- **9-10:** Critical threat, automatically blocked

The security threshold is configurable by your organization's admin.

## What Triggers High Security Scores

- Attempts to override system instructions ("ignore all previous instructions")
- Requests for jailbreaking techniques
- Social engineering patterns
- Encoded or obfuscated malicious content

## Best Practices

1. **Avoid copy-pasting untrusted content** directly into prompts without review
2. **Be aware of indirect injection** in documents you ask the AI to analyze
3. **Review AI responses** for unexpected behavior
4. **Report** any security concerns to your admin

## Key Takeaway

AI Helm's security scoring protects your organization automatically. Understanding prompt injection helps you write prompts that won't accidentally trigger security flags.`,
  },
  {
    id: "sa-02-data-safety",
    title: "Protecting Sensitive Data",
    category: "security-awareness",
    difficulty: "beginner",
    prerequisites: [],
    estimatedMinutes: 5,
    content: `# Protecting Sensitive Data

When using AI tools, it's crucial to be mindful of what data you include in your prompts. Your messages are sent to external AI providers (Google, OpenAI, Anthropic), so anything you type could be processed by their systems.

## What NOT to Include in Prompts

### Never Share:
- Passwords or API keys
- Credit card numbers
- Social Security numbers
- Medical records
- Internal security configurations

### Be Cautious With:
- Customer names and contact info
- Internal business metrics
- Proprietary code or algorithms
- Unreleased product details

## How AI Helm Protects You: DLP Scanning

AI Helm includes **Data Loss Prevention (DLP)** — a system that automatically scans your messages for sensitive data before they reach any AI model.

**What is DLP?** DLP (Data Loss Prevention) is a security technique used by organizations to detect and prevent sensitive information from being shared where it shouldn't be. Think of it like a spell-checker, but instead of typos, it looks for things like credit card numbers, Social Security numbers, and API keys.

**How it works in AI Helm:**
1. Before your message is processed, DLP scans it for patterns like credit card numbers, SSNs, phone numbers, email addresses, and API keys
2. If sensitive data is found, you'll see a **warning** in the process log
3. The sensitive data is **automatically redacted** (replaced with placeholders like \`[REDACTED_SSN]\`) in **all** calls to AI providers — analysis, prompt optimization, and response generation
4. No sensitive data ever leaves AI Helm — the redacted version is used for every external API call

> **Why full redaction?** Even if you intended to share sensitive data with the AI, third-party AI providers may log, store, or use your data for training. AI Helm prevents this by ensuring sensitive information never reaches external servers.

**What DLP detects:**
- Credit card numbers (Visa, Mastercard, Amex, etc.)
- Social Security numbers (US format)
- API keys and tokens (OpenAI, Google, GitHub, AWS, etc.)
- Email addresses
- Phone numbers
- IP addresses
- Bank account numbers (IBAN format)

## Safe Alternatives

Even with DLP protection, it's best practice to avoid sharing sensitive data when possible:

### 1. Anonymized Data
Replace "John Smith, SSN 123-45-6789" with "User A, SSN XXX-XX-XXXX"

### 2. Synthetic Examples
Create fake but realistic data for your prompts.

### 3. Describe the Pattern
Instead of sharing the actual data, describe what it looks like:
"I have a CSV with columns: name, email, purchase_amount, date. How do I calculate monthly totals?"

### 4. Use Placeholders
"Help me write an API call that uses \`YOUR_API_KEY\` as authentication"

## AI Helm's Key Management

AI Helm stores your API keys securely:
- Keys are encrypted with AES-256-GCM on the server
- Keys are never logged or exposed in responses
- You can manage keys in Settings

## Key Takeaway

AI Helm's DLP scanner ensures sensitive data never leaves your system — it's automatically redacted before any AI provider sees it. But the best protection is still awareness. Use anonymization, synthetic data, or placeholders when possible, and let DLP catch anything you miss.`,
  },
];

/**
 * Get lessons by category
 */
export function getLessonsByCategory(category: LessonCategory): Lesson[] {
  return LESSONS.filter(l => l.category === category);
}

/**
 * Get a specific lesson by ID
 */
export function getLesson(id: string): Lesson | undefined {
  return LESSONS.find(l => l.id === id);
}

/**
 * Check if all prerequisites for a lesson are met
 */
export function arePrerequisitesMet(
  lessonId: string,
  completedLessons: string[]
): boolean {
  const lesson = getLesson(lessonId);
  if (!lesson) return false;
  return lesson.prerequisites.every(prereq => completedLessons.includes(prereq));
}
