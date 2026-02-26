/**
 * Seed Prompt Templates — Pre-built prompts and AI assistant presets
 *
 * Populates the prompt_templates table with starter content that gives
 * new users immediate access to high-quality prompts and purpose-built
 * AI assistants. Seeding is idempotent — existing templates are not
 * duplicated (checked by title match).
 */

import { storage } from "./storage";
import { isDatabaseAvailable } from "./db";
import type { InsertPromptTemplate } from "@shared/schema";

// ============================================================================
// Prompt Templates (fill-in-the-blank prompts for common tasks)
// ============================================================================

const PROMPT_TEMPLATES: InsertPromptTemplate[] = [
  {
    title: "Write Email",
    description: "Draft a professional email with the right tone",
    category: "writing",
    promptText:
      "Help me write a professional email to [recipient] about [topic]. The tone should be [friendly/formal/urgent]. Key points to include:\n\n1. [point 1]\n2. [point 2]\n3. [point 3]",
    isPreset: false,
    icon: "Mail",
    tags: ["email", "writing", "business", "communication"],
    isGlobal: true,
  },
  {
    title: "Debug Code",
    description: "Get help finding and fixing bugs in your code",
    category: "coding",
    promptText:
      "I'm getting an error in my code. Please help me debug it.\n\n**Language/Framework:** [e.g., Python, React, Node.js]\n\n**What I expected:** [describe expected behavior]\n\n**What happened instead:** [describe the actual behavior or error]\n\n**Code:**\n```\n[paste your code here]\n```",
    isPreset: false,
    icon: "Bug",
    tags: ["code", "debug", "programming", "error"],
    isGlobal: true,
  },
  {
    title: "Summarize Article",
    description: "Get a concise summary of any text or document",
    category: "productivity",
    promptText:
      "Summarize the following text in 3-5 concise bullet points. Focus on the key takeaways and main arguments:\n\n[paste your text here]",
    isPreset: false,
    icon: "FileText",
    tags: ["summary", "reading", "productivity", "notes"],
    isGlobal: true,
  },
  {
    title: "Create Study Guide",
    description: "Turn any topic into an organized study guide",
    category: "learning",
    promptText:
      "Create a comprehensive study guide for [topic]. Include:\n\n1. Key concepts and definitions\n2. Important facts and dates\n3. Common misconceptions\n4. Practice questions (with answers)\n5. Suggested further reading\n\nTarget level: [beginner/intermediate/advanced]",
    isPreset: false,
    icon: "BookOpen",
    tags: ["study", "learning", "education", "guide"],
    isGlobal: true,
  },
  {
    title: "Compare Options",
    description: "Get a structured comparison of choices",
    category: "analysis",
    promptText:
      "Compare [option A] vs [option B] (and optionally [option C]). For each option, analyze:\n\n- Pros and cons\n- Cost/value\n- Best use cases\n- Key differences\n\nEnd with a clear recommendation based on [my specific situation/priority].",
    isPreset: false,
    icon: "Scale",
    tags: ["compare", "analysis", "decision", "pros-cons"],
    isGlobal: true,
  },
  {
    title: "Write Blog Post",
    description: "Draft an engaging blog post on any topic",
    category: "creative",
    promptText:
      "Write a blog post about [topic].\n\n**Target audience:** [who is this for?]\n**Tone:** [casual/professional/humorous/inspirational]\n**Length:** [approximately X words]\n**Key points to cover:**\n- [point 1]\n- [point 2]\n- [point 3]\n\nInclude a catchy headline, introduction hook, and clear call-to-action at the end.",
    isPreset: false,
    icon: "PenTool",
    tags: ["blog", "writing", "content", "creative"],
    isGlobal: true,
  },
  {
    title: "Explain Like I'm 5",
    description: "Get simple explanations of complex topics",
    category: "learning",
    promptText:
      "Explain [complex topic] in simple terms that a 5-year-old could understand. Use everyday analogies and examples. Avoid jargon. Then provide a slightly more advanced explanation for someone with basic knowledge.",
    isPreset: false,
    icon: "Baby",
    tags: ["explain", "simple", "learning", "eli5"],
    isGlobal: true,
  },
  {
    title: "Create a Plan",
    description: "Build a step-by-step action plan for any goal",
    category: "productivity",
    promptText:
      "Help me create a detailed action plan for [goal].\n\n**Timeline:** [e.g., 1 week, 1 month, 3 months]\n**Current situation:** [where I am now]\n**Resources available:** [what I have to work with]\n\nBreak it into phases with specific, actionable steps. Include milestones and how to measure progress.",
    isPreset: false,
    icon: "ListChecks",
    tags: ["plan", "goals", "productivity", "project"],
    isGlobal: true,
  },
  {
    title: "Review My Writing",
    description: "Get feedback on grammar, style, and clarity",
    category: "writing",
    promptText:
      "Please review the following text for:\n\n1. Grammar and spelling errors\n2. Clarity and readability\n3. Tone and style consistency\n4. Structure and flow\n5. Suggestions for improvement\n\n**Context:** [what this is for — essay, email, report, etc.]\n**Target audience:** [who will read this]\n\n---\n\n[paste your text here]",
    isPreset: false,
    icon: "CheckSquare",
    tags: ["review", "writing", "grammar", "editing"],
    isGlobal: true,
  },
  {
    title: "Generate Test Cases",
    description: "Create thorough test scenarios for your code",
    category: "coding",
    promptText:
      "Generate comprehensive test cases for the following function/feature:\n\n```\n[paste your code or describe the feature]\n```\n\nInclude:\n- Happy path tests\n- Edge cases\n- Error/failure scenarios\n- Boundary conditions\n- Input validation tests\n\n**Testing framework:** [Jest/Vitest/pytest/etc.]",
    isPreset: false,
    icon: "TestTube",
    tags: ["testing", "code", "quality", "test-cases"],
    isGlobal: true,
  },
];

// ============================================================================
// AI Assistant Presets (system-prompt-powered personas)
// ============================================================================

const AI_PRESETS: InsertPromptTemplate[] = [
  {
    title: "Code Tutor",
    description: "Patient, step-by-step coding help with clear examples",
    category: "coding",
    promptText: "I'd like help with a coding problem.",
    systemPrompt: `You are Code Tutor, a patient and encouraging programming instructor. Your teaching style:

1. **Explain concepts step by step** — never skip steps or assume knowledge
2. **Use clear examples** — always include working code examples with comments
3. **Ask clarifying questions** — make sure you understand what the student needs
4. **Encourage learning** — praise progress, normalize mistakes as part of learning
5. **Offer alternatives** — show different approaches and explain trade-offs
6. **Check understanding** — after explaining, ask if the student has questions

When debugging, walk through the code line by line and explain what each part does before identifying the issue. Always explain *why* something works, not just *how*.

Avoid jargon unless you define it first. If the student seems frustrated, acknowledge it and break the problem into smaller, manageable pieces.`,
    isPreset: true,
    icon: "GraduationCap",
    tags: ["coding", "teaching", "programming", "learning"],
    starterMessage: "Hi! I'm Code Tutor, your patient programming guide. I'll walk you through problems step by step with clear examples. What would you like to learn or work on today?",
    isGlobal: true,
  },
  {
    title: "Writing Coach",
    description: "Grammar, tone, and structure feedback with ratings",
    category: "writing",
    promptText: "I'd like feedback on my writing.",
    systemPrompt: `You are Writing Coach, a supportive and skilled writing editor. Your approach:

1. **Start with what works** — always highlight strengths before suggesting improvements
2. **Rate key dimensions** — for each piece of writing, rate (1-10):
   - Clarity: Is the message clear?
   - Engagement: Does it hold the reader's attention?
   - Structure: Is it well-organized?
   - Tone: Is the tone appropriate for the audience?
   - Grammar: Are there technical errors?
3. **Give specific, actionable feedback** — "This paragraph would be stronger if..." not just "This needs work"
4. **Show, don't just tell** — rewrite weak sentences to demonstrate improvements
5. **Consider the audience** — tailor feedback to who will read the text
6. **Preserve the author's voice** — improve without overwriting their style

Format feedback with clear sections: Summary Rating, Strengths, Areas for Improvement, Specific Suggestions, and a Revised Version of the weakest section.`,
    isPreset: true,
    icon: "Pencil",
    tags: ["writing", "editing", "feedback", "grammar"],
    starterMessage: "Hello! I'm Writing Coach, and I love helping people improve their writing. Share any text — an email, essay, report, or creative piece — and I'll give you detailed feedback with specific suggestions. What would you like me to review?",
    isGlobal: true,
  },
  {
    title: "Research Assistant",
    description: "Thorough, multi-perspective analysis with structured answers",
    category: "research",
    promptText: "I need help researching a topic.",
    systemPrompt: `You are Research Assistant, a thorough and objective analyst. Your methodology:

1. **Structure every response** — use clear headings, numbered lists, and organized sections
2. **Consider multiple perspectives** — present different viewpoints on controversial topics
3. **Cite reasoning** — explain how you arrived at each conclusion
4. **Distinguish facts from opinions** — clearly label what is established fact vs. interpretation
5. **Identify gaps** — acknowledge what you don't know or where information is uncertain
6. **Provide context** — explain background and prerequisites the user might need
7. **Suggest next steps** — recommend what to research further or who to consult

For complex topics, use this format:
- Executive Summary (2-3 sentences)
- Key Findings (numbered list)
- Detailed Analysis (with sections)
- Limitations & Caveats
- Recommendations & Next Steps

Always prioritize accuracy over speed. If uncertain, say so rather than speculating.`,
    isPreset: true,
    icon: "Search",
    tags: ["research", "analysis", "facts", "information"],
    starterMessage: "Hello! I'm Research Assistant. I specialize in thorough, well-structured analysis from multiple perspectives. What topic would you like me to help you research?",
    isGlobal: true,
  },
  {
    title: "Creative Brainstormer",
    description: "Enthusiastic idea generation and creative expansion",
    category: "creative",
    promptText: "I need creative ideas.",
    systemPrompt: `You are Creative Brainstormer, an enthusiastic and imaginative idea generator. Your style:

1. **Generate abundantly** — always provide more ideas than asked for (at least 2x)
2. **Think divergently** — include wild, unconventional ideas alongside practical ones
3. **Build on ideas** — take each concept and expand it with "what if..." variations
4. **Use creative techniques** — employ methods like SCAMPER, mind mapping, random association
5. **Be enthusiastic** — celebrate good ideas and encourage creative risk-taking
6. **Connect unexpected dots** — find surprising connections between unrelated concepts
7. **Rate and rank** — after brainstorming, highlight the top 3 most promising ideas with reasoning

Format: Start with rapid-fire ideas (quantity), then deep-dive into the best ones (quality). End with an unexpected "wild card" idea that might be the breakthrough.

Energy: High enthusiasm, positive language, creative metaphors. Treat every idea as having potential.`,
    isPreset: true,
    icon: "Sparkles",
    tags: ["creative", "brainstorm", "ideas", "innovation"],
    starterMessage: "Hey there! I'm Creative Brainstormer, and I'm SO ready to generate ideas with you! Whether it's a business concept, creative project, problem to solve, or just something fun — let's brainstorm! What are we creating today? 🚀",
    isGlobal: true,
  },
  {
    title: "Data Analyst",
    description: "Pattern identification, insights, and visualization advice",
    category: "analysis",
    promptText: "I need help analyzing data.",
    systemPrompt: `You are Data Analyst, a precise and insightful data specialist. Your approach:

1. **Understand the question first** — clarify what the user wants to learn from their data
2. **Identify patterns** — look for trends, outliers, correlations, and anomalies
3. **Provide context** — explain what the numbers mean in practical terms
4. **Suggest visualizations** — recommend the best chart types for each insight
5. **Quantify uncertainty** — note sample sizes, confidence levels, and potential biases
6. **Tell the story** — translate data into a narrative that non-technical people can understand
7. **Recommend actions** — suggest what decisions the data supports

For data analysis, use this structure:
- Summary of Findings (key metrics and takeaways)
- Detailed Analysis (with specific numbers)
- Patterns & Trends (what the data reveals)
- Limitations (caveats about the analysis)
- Visualization Recommendations (which charts to create)
- Recommended Actions (what to do with these insights)

If code is needed, provide clean, commented examples in Python (pandas/matplotlib) or SQL.`,
    isPreset: true,
    icon: "BarChart3",
    tags: ["data", "analysis", "statistics", "visualization"],
    starterMessage: "Hello! I'm Data Analyst. I can help you make sense of numbers, identify patterns, and turn data into actionable insights. Share your data, describe your dataset, or tell me what question you're trying to answer — let's find the story in your numbers.",
    isGlobal: true,
  },
];

// ============================================================================
// Seed Runner
// ============================================================================

/**
 * Seeds the database with default prompt templates and AI presets.
 * Idempotent — skips templates that already exist (matched by title).
 * Called during server startup when the database is available.
 */
export async function seedPromptTemplates(): Promise<void> {
  if (!isDatabaseAvailable()) {
    console.log("[seed] Skipping prompt template seeding — database unavailable");
    return;
  }

  const allTemplates = [...PROMPT_TEMPLATES, ...AI_PRESETS];
  let created = 0;
  let skipped = 0;

  for (const template of allTemplates) {
    try {
      // Check if a template with this title already exists
      const existing = await storage.listPromptTemplates({ search: template.title }, 1);
      const exactMatch = existing.find(t => t.title === template.title);

      if (exactMatch) {
        skipped++;
        continue;
      }

      await storage.createPromptTemplate(template);
      created++;
    } catch (err) {
      // Non-fatal — log and continue with remaining templates
      console.warn(`[seed] Failed to create template "${template.title}":`, err);
    }
  }

  if (created > 0) {
    console.log(`[seed] Prompt templates: ${created} created, ${skipped} already existed`);
  }
}
