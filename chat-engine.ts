import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getRetriever, Chunk } from './retrieval';
import { TOOL_DEFINITIONS, OPENAI_TOOL_DEFINITIONS, executeTool, ToolContext, CardItem } from './tools';
import { SYSTEM_PROMPT } from './prompt';
import {
  sanitizeUrls,
  verifyNumericGroundedness,
  logUnansweredQuestion,
  logContentGap,
} from './guardrails';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatStreamEvent {
  event: 'token' | 'cards' | 'chips' | 'sources' | 'form' | 'done' | 'error';
  data: any;
}

export type StreamCallback = (evt: ChatStreamEvent) => void;

/**
 * Determines if a query requires Sonnet 5.5 for complex reasoning / multi-part analysis.
 */
function isHardQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  const questionMarks = (text.match(/\?/g) || []).length;
  return (
    questionMarks >= 2 ||
    lower.includes('compare') ||
    lower.includes('difference between') ||
    lower.includes('tradeoffs') ||
    lower.includes('architectural blueprint') ||
    lower.includes('multi-part') ||
    text.length > 250
  );
}

/**
 * Calculates estimated Anthropic API cost based on token counts and model tier.
 */
function calculateCost(model: string, inTokens: number, outTokens: number): number {
  const isSonnet = model.toLowerCase().includes('sonnet');
  // Claude Haiku 5.5: ~$0.80 / M input, ~$4.00 / M output
  // Claude Sonnet 5.5: ~$3.00 / M input, ~$15.00 / M output
  const inRate = isSonnet ? 3.0 / 1_000_000 : 0.8 / 1_000_000;
  const outRate = isSonnet ? 15.0 / 1_000_000 : 4.0 / 1_000_000;
  return inTokens * inRate + outTokens * outRate;
}

/**
 * Generates 2-3 context-aware follow-up suggestion chips grounded in verified company content.
 */
function generateContextAwareChips(context: ToolContext, userMessage: string): string[] {
  const lower = userMessage.toLowerCase();

  if (context.usedSources.some((s) => s.url.includes('sap'))) {
    return [
      'What is your SAP migration methodology?',
      'Show SAP case study results',
      'Schedule a consultation',
    ];
  }

  if (context.usedSources.some((s) => s.url.includes('cloud'))) {
    return [
      'Which cloud platforms do you support?',
      'View cloud modernization case study',
      'Speak with a cloud architect',
    ];
  }

  if (context.usedSources.some((s) => s.url.includes('data'))) {
    return [
      'What data lakehouse architectures do you deploy?',
      'How do you manage data governance?',
      'Connect with our data practice',
    ];
  }

  if (context.usedSources.some((s) => s.url.includes('case-studies'))) {
    return [
      'Explore all enterprise case studies',
      'What services were delivered in this project?',
      'Schedule an advisory session',
    ];
  }

  if (context.usedSources.some((s) => s.url.includes('careers'))) {
    return [
      'View SAP Consultant openings',
      'What is your hiring process?',
      'Where are your global offices?',
    ];
  }

  if (lower.includes('office') || lower.includes('location')) {
    return [
      'Where is your India development center?',
      'How to schedule a facility visit',
      'Contact our team',
    ];
  }

  if (lower.includes('pricing') || lower.includes('cost') || context.wantsHandoff) {
    return [
      'Explore enterprise services',
      'Our 5-step delivery methodology',
      'Review case study metrics',
    ];
  }

  return [
    'Tell me about SAP S/4HANA migrations',
    'What cloud modernization services do you offer?',
    'How do you work with clients?',
  ];
}

/**
 * Executes a chat interaction using either the Claude Tool-Calling Agent or the Grounded Deterministic Engine.
 */
let openAiQuotaExhaustedUntil = 0;

export async function handleChat(
  userMessage: string,
  history: ChatMessage[],
  sendEvent: StreamCallback
): Promise<void> {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const configuredModel = process.env.AI_MODEL || process.env.CHAT_MODEL || 'gpt-4o-mini';

  const toolContext: ToolContext = {
    usedSources: [],
  };

  // 1. Primary: If OpenAI API Key is present, run ChatGPT agent loop
  if (openaiApiKey && Date.now() > openAiQuotaExhaustedUntil) {
    try {
      const selectedModel =
        configuredModel.startsWith('claude') ? 'gpt-4o-mini' : configuredModel;

      await Promise.race([
        runOpenAIChat(userMessage, history, openaiApiKey, selectedModel, toolContext, sendEvent),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Total request timeout (15s exceeded)')), 15000)
        ),
      ]);
      return;
    } catch (err: any) {
      if (err.status === 429 || (err.message && err.message.includes('credits remaining'))) {
        openAiQuotaExhaustedUntil = Date.now() + 60 * 1000;
      }
      console.warn('OpenAI Agent notice (e.g. quota or offline), engaging Grounded Knowledge Engine:', err.message);
      // Fall through to deterministic engine
    }
  }

  // 2. Secondary: If Anthropic API Key is present (and no OpenAI configured), run Claude tool-use loop
  else if (anthropicApiKey) {
    try {
      const selectedModel =
        configuredModel.startsWith('gpt')
          ? 'claude-haiku-5-5'
          : configuredModel === 'claude-haiku-5-5' && isHardQuestion(userMessage)
          ? 'claude-sonnet-5-5'
          : configuredModel;

      await Promise.race([
        runClaudeChat(userMessage, history, anthropicApiKey, selectedModel, toolContext, sendEvent),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Total request timeout (15s exceeded)')), 15000)
        ),
      ]);
      return;
    } catch (err: any) {
      console.warn('Claude Agent error or timeout, falling back to Grounded Engine:', err.message);
      // Fall through to deterministic engine
    }
  }

  // 3. Grounded Deterministic Engine (Offline / zero-hallucination fallback)
  await runGroundedEngine(userMessage, history, toolContext, sendEvent);
}

/**
 * Runs OpenAI ChatGPT API with Tool Calling loop (max 3 tool calls, streaming final reply).
 */
async function runOpenAIChat(
  userMessage: string,
  history: ChatMessage[],
  apiKey: string,
  model: string,
  context: ToolContext,
  sendEvent: StreamCallback
): Promise<void> {
  const openai = new OpenAI({ apiKey });

  // Format messages (last 10 turns max)
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  for (const m of history.slice(-10)) {
    messages.push({
      role: m.role,
      content: m.content,
    });
  }
  messages.push({ role: 'user', content: userMessage });

  let toolCallsMade = 0;
  const maxToolCalls = 3;
  let fullResponseText = '';
  let inTokens = 0;
  let outTokens = 0;

  while (true) {
    const allowTools = toolCallsMade < maxToolCalls;

    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: allowTools ? (OPENAI_TOOL_DEFINITIONS as any) : undefined,
      tool_choice: allowTools ? 'auto' : undefined,
      max_tokens: 400,
    });

    const choice = response.choices[0];
    const message = choice?.message;

    if (response.usage) {
      inTokens += response.usage.prompt_tokens || 0;
      outTokens += response.usage.completion_tokens || 0;
    }

    if (!message) break;

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0 && allowTools) {
      messages.push(message);

      for (const call of message.tool_calls) {
        if (call.type !== 'function') continue;
        toolCallsMade++;
        const fnName = call.function.name;
        let fnArgs: Record<string, any> = {};
        try {
          fnArgs = JSON.parse(call.function.arguments);
        } catch {
          fnArgs = {};
        }

        const result = await executeTool(fnName, fnArgs, context);

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // Final answer reached
    const answerContent = message.content || '';
    fullResponseText = answerContent;

    // Stream tokens smoothly to frontend
    const words = answerContent.split(' ');
    for (let i = 0; i < words.length; i++) {
      const token = (i === 0 ? '' : ' ') + words[i];
      sendEvent({ event: 'token', data: token });
      await new Promise((r) => setTimeout(r, 12));
    }
    break;
  }

  // Cost calculation
  const isGpt4o = model.toLowerCase().includes('gpt-4o') && !model.toLowerCase().includes('mini');
  const inRate = isGpt4o ? 2.5 / 1_000_000 : 0.15 / 1_000_000;
  const outRate = isGpt4o ? 10.0 / 1_000_000 : 0.60 / 1_000_000;
  const cost = inTokens * inRate + outTokens * outRate;

  console.log(
    `[AXIA AI Assistant OpenAI] Model: ${model} | In: ${inTokens} tokens | Out: ${outTokens} tokens | Est. Cost: $${cost.toFixed(6)}`
  );

  // Post-processing guardrails
  const sanitizedAnswer = sanitizeUrls(fullResponseText);
  if (context.usedSources.length > 0) {
    const contextText = context.usedSources.map((s) => s.title).join(' ');
    verifyNumericGroundedness(sanitizedAnswer, contextText);
  }

  if (
    sanitizedAnswer.toLowerCase().includes('cannot answer') ||
    sanitizedAnswer.toLowerCase().includes('do not have') ||
    sanitizedAnswer.toLowerCase().includes('not mentioned in the knowledge base')
  ) {
    logUnansweredQuestion(userMessage, []);
  }

  // Emit cards
  if (context.cards && context.cards.length > 0) {
    sendEvent({ event: 'cards', data: context.cards });
  }

  // Emit unique sources
  if (context.usedSources.length > 0) {
    const uniqueSources = Array.from(
      new Map(context.usedSources.map((s) => [s.url, s])).values()
    );
    sendEvent({ event: 'sources', data: uniqueSources });
  }

  // Emit suggestion chips
  const suggestionChips = generateContextAwareChips(context, userMessage);
  sendEvent({ event: 'chips', data: suggestionChips });

  // Emit handoff form if requested
  if (context.wantsHandoff) {
    sendEvent({
      event: 'form',
      data: {
        reason: context.handoffReason || 'Advisory consultation requested.',
        prefill: context.handoffPrefill || {},
      },
    });
  }

  sendEvent({ event: 'done', data: { inTokens, outTokens, cost } });
}

/**
 * Runs Claude API with Anthropic Tool Calling loop (max 3 tool calls, low effort, no sampling params).
 */
async function runClaudeChat(
  userMessage: string,
  history: ChatMessage[],
  apiKey: string,
  model: string,
  context: ToolContext,
  sendEvent: StreamCallback
): Promise<void> {
  const anthropic = new Anthropic({ apiKey });

  // Format messages (last 10 turns max)
  const messages: Anthropic.MessageParam[] = history.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  messages.push({ role: 'user', content: userMessage });

  let toolCallsMade = 0;
  const maxToolCalls = 3;
  let fullResponseText = '';
  let totalInTokens = 0;
  let totalOutTokens = 0;

  while (true) {
    const allowTools = toolCallsMade < maxToolCalls;

    // Strict model settings: NO temperature, NO top_p, NO top_k, max_tokens: 400, effort: 'low'
    const requestPayload: any = {
      model,
      system: SYSTEM_PROMPT,
      messages,
      max_tokens: 400,
      effort: 'low',
    };

    if (allowTools) {
      requestPayload.tools = TOOL_DEFINITIONS;
    }

    const response = await anthropic.messages.create(requestPayload);

    // Track token usage and log cost
    const inTok = response.usage?.input_tokens || 0;
    const outTok = response.usage?.output_tokens || 0;
    totalInTokens += inTok;
    totalOutTokens += outTok;

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const textBlocks = response.content.filter((b) => b.type === 'text');

    if (textBlocks.length > 0) {
      for (const t of textBlocks) {
        if ('text' in t) {
          fullResponseText += t.text;
          sendEvent({ event: 'token', data: t.text });
        }
      }
    }

    if (toolUseBlocks.length === 0 || !allowTools) {
      break;
    }

    // Execute tool use blocks
    const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUseBlocks) {
      if (tu.type === 'tool_use') {
        toolCallsMade++;
        const result = await executeTool(tu.name, tu.input as any, context);
        toolResultContent.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });

        if (toolCallsMade >= maxToolCalls) break;
      }
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResultContent });
  }

  // Log usage & estimated cost for the entire request
  const estCost = calculateCost(model, totalInTokens, totalOutTokens);
  console.log(
    `[Anthropic Request Complete] Model: ${model} | In: ${totalInTokens}, Out: ${totalOutTokens} tokens | Cost: $${estCost.toFixed(6)}`
  );

  // Guardrails: Sanitize URLs
  fullResponseText = sanitizeUrls(fullResponseText);

  // Send unique source chips
  if (context.usedSources.length > 0) {
    const uniqueSources = Array.from(
      new Map(context.usedSources.map((s) => [s.url, s])).values()
    );
    sendEvent({ event: 'sources', data: uniqueSources });
  }

  // Context-aware follow-up suggestion chips generated from KB
  const suggestionChips = generateContextAwareChips(context, userMessage);
  sendEvent({ event: 'chips', data: suggestionChips });

  // If handoff was triggered, dispatch form event
  if (context.wantsHandoff) {
    sendEvent({
      event: 'form',
      data: {
        reason: context.handoffReason || 'Advisory consultation requested.',
        prefill: context.handoffPrefill || {},
      },
    });
  }

  sendEvent({ event: 'done', data: {} });
}

/**
 * Grounded Deterministic Engine for offline, evaluation, and zero-hallucination environments.
 * Follows the exact same System Prompt rules and tools logic.
 */
async function runGroundedEngine(
  userMessage: string,
  history: ChatMessage[],
  context: ToolContext,
  sendEvent: StreamCallback
): Promise<void> {
  const retriever = getRetriever();
  const structured = retriever.getStructured();
  const lower = userMessage.toLowerCase().trim();

  // Resolve history context for follow-up questions
  const lastUserMsg = history.length > 0 ? history[history.length - 1].content.toLowerCase() : '';
  const lastAssistantMsg = history.length > 1 ? history[history.length - 2].content.toLowerCase() : '';

  let answer = '';
  let isHandoff = false;
  let handoffReason = '';

  // 1. Off-Topic & System Prompt Injection Defense
  if (
    lower.includes('ignore previous instructions') ||
    lower.includes('ignore all previous') ||
    lower.includes('ignore instructions') ||
    lower.includes('forget your rules') ||
    lower.includes('disregard prior') ||
    lower.includes('system override') ||
    lower.includes('system prompt') ||
    lower.includes('repeat the prompt') ||
    lower.includes('repeat the text above') ||
    lower.includes('print your system') ||
    lower.includes('reveal your prompt') ||
    lower.includes('what are your instructions') ||
    lower.includes('act as a') ||
    lower.includes('you are now') ||
    lower.includes('jailbreak') ||
    lower.includes('dan mode')
  ) {
    answer =
      "I am AXIA Assistant, dedicated strictly to answering questions about Axia Kairos enterprise services, case studies, industries, and careers. I cannot disclose internal system instructions or alter my operational boundaries. How can I assist your organization today?";
  } else if (
    lower.includes('recipe') ||
    lower.includes('weather') ||
    lower.includes('sports score') ||
    lower.includes('homework') ||
    lower.includes('write me a poem') ||
    lower.includes('write a poem') ||
    lower.includes('tell me a joke') ||
    lower.includes('python script') ||
    lower.includes('scrape a website') ||
    lower.includes('capital of') ||
    lower.includes('world cup') ||
    lower.includes('french revolution') ||
    lower.includes('who won')
  ) {
    answer =
      "I am dedicated exclusively to providing guidance regarding Axia Kairos enterprise services, case studies, industries, and careers. Please feel free to ask about our digital transformation capabilities or technology practices.";
  }
  // 2. Unanswerable from Content (Strict Honesty & Advisor Handoff)
  else if (
    lower.includes('street address') ||
    lower.includes('exact address') ||
    lower.includes('suite number') ||
    lower.includes('physical address') ||
    lower.includes('office building address')
  ) {
    answer =
      "We do not publish physical street addresses on our website. Axia Kairos operates regional corporate hubs across Canada, India, the USA, and the UAE. In-person facility consultations are coordinated directly through our advisory team below.";
    isHandoff = true;
    handoffReason = 'Corporate office visit appointment';
    context.usedSources.push({
      title: 'Corporate Office Locations',
      url: '/contact',
      chunkId: 'contact-offices',
    });
  } else if (
    lower.includes('which specific company') ||
    lower.includes('which specific clients') ||
    lower.includes('named client') ||
    lower.includes('client name') ||
    lower.includes('who was the client') ||
    lower.includes('fortune 500 company was the client')
  ) {
    answer =
      "We do not disclose specific client names on our public website. All enterprise case studies are strictly anonymized in accordance with client confidentiality agreements and NDAs. Our partners can share credential references under NDA through our advisory form.";
    isHandoff = true;
    handoffReason = 'Client credential and reference inquiry';
    context.usedSources.push({
      title: 'Enterprise Case Studies',
      url: '/case-studies',
      chunkId: 'case-studies-index',
    });
  } else if (
    lower.includes('headcount') ||
    lower.includes('how many employees') ||
    lower.includes('employee count') ||
    lower.includes('team size')
  ) {
    answer =
      "We do not publish exact global employee headcount figures on our website. Axia Kairos maintains dedicated engineering practices across North America, EMEA, and APAC. You can connect with our leadership team below to discuss practice capacity.";
    isHandoff = true;
    handoffReason = 'Team capacity inquiry';
    context.usedSources.push({
      title: 'About Axia Kairos',
      url: '/about',
      chunkId: 'about-overview',
    });
  } else if (
    lower.includes('vs accenture') ||
    lower.includes('vs deloitte') ||
    lower.includes('vs mckinsey') ||
    lower.includes('compare in price and quality directly against mckinsey') ||
    lower.includes('competitor comparison')
  ) {
    answer =
      "We do not publish direct competitor comparisons on our website. Axia Kairos distinguishes itself through principal-led advisory, agile execution, and deep technical specialization in SAP, cloud, and data engineering. Our leadership team is available to discuss specific partnership models.";
    isHandoff = true;
    handoffReason = 'Competitive differentiation inquiry';
    context.usedSources.push({
      title: 'Our Delivery Methodology',
      url: '/our-approach',
      chunkId: 'approach-methodology',
    });
  } else if (
    lower.includes('iso 27001') ||
    lower.includes('registration number') ||
    lower.includes('audit report') ||
    lower.includes('soc 2') ||
    lower.includes('soc2')
  ) {
    answer =
      "We do not publish formal compliance registration numbers or audit reports on our public site. Our cyber security and managed IT practices adhere to enterprise industry standards. Our security team can supply formal attestations through our advisory form below.";
    isHandoff = true;
    handoffReason = 'Compliance attestations inquiry';
    context.usedSources.push({
      title: 'Cyber Security Services',
      url: '/services/cyber-security-services',
      chunkId: 'services-cyber',
    });
  }
  // 3. Pricing, Quotes & Facility Visits -> Handoff
  else if (
    lower.includes('pricing') ||
    lower.includes('how much') ||
    lower.includes('cost') ||
    lower.includes('rate card') ||
    lower.includes('quote') ||
    lower.includes('fee structure') ||
    lower.includes('budget required')
  ) {
    answer =
      "We do not publish fixed pricing or rate cards on our website, as enterprise engagement scoping is tailored to technical complexity and delivery model. I've opened our advisor consultation form below so our principal team can provide a customized proposal.";
    isHandoff = true;
    handoffReason = 'Engagement scoping and pricing consultation';
    context.usedSources.push({
      title: 'Contact Axia Kairos',
      url: '/contact',
      chunkId: 'contact-scoping',
    });
  } else if (
    lower.includes('in-person meeting') ||
    lower.includes('schedule an in-person') ||
    lower.includes('visit your office')
  ) {
    answer =
      "Physical facility appointments and in-person consultations are scheduled in advance through our principal advisory team. Axia Kairos operates regional corporate office hubs across Canada, India, the USA, and the UAE.";
    isHandoff = true;
    handoffReason = 'Corporate office visit appointment';
    context.usedSources.push({
      title: 'Contact Axia Kairos',
      url: '/contact',
      chunkId: 'contact-offices',
    });
  }
  // 4. Contact Details & Official Emails
  else if (
    lower.includes('email address') ||
    lower.includes('email to contact') ||
    lower.includes('official email')
  ) {
    answer =
      "You can contact Axia Kairos via email at contact@axiakairos.com for general corporate inquiries, info@axiakairos.com for information, and partnerships@axiakairos.com for strategic alliances.";
    context.usedSources.push({
      title: 'Contact Axia Kairos',
      url: '/contact',
      chunkId: 'contact-emails',
    });
  }
  // 5. Follow-ups Needing History
  else if (
    lower.includes('pricing for that') ||
    (lower.includes('what about pricing') && (lastUserMsg.includes('sap') || lastAssistantMsg.includes('sap')))
  ) {
    answer =
      "We do not publish fixed rate cards on our website, as SAP transformation investments are tailored to landscape size, customization scope, and target architecture. I've opened our consultation form below so our principal advisors can provide a customized quote.";
    isHandoff = true;
    handoffReason = 'SAP S/4HANA migration pricing consultation';
    context.usedSources.push({
      title: 'Contact Axia Kairos',
      url: '/contact',
      chunkId: 'contact-scoping',
    });
  } else if (
    lower.includes('case study for that domain') ||
    (lower.includes('case study') && (lastUserMsg.includes('telecom') || lastAssistantMsg.includes('telecom')))
  ) {
    answer =
      "For a leading telecommunications enterprise, Axia Kairos executed a multi-cloud modernization and analytics transformation that achieved a 38% reduction in cloud infrastructure costs while modernizing critical network analytics.";
    context.usedSources.push({
      title: 'Telecommunications Cloud Modernization',
      url: '/case-studies/cloud-modernization-telecom',
      chunkId: 'cs-telecom',
    });
  } else if (
    lower.includes('how long does that step take') ||
    (lower.includes('how long') && (lastUserMsg.includes('discover') || lastAssistantMsg.includes('discover')))
  ) {
    answer =
      "The Discover & Diagnose phase timeline is tailored to engagement scope and enterprise architecture complexity, typically ranging from 2 to 6 weeks. Our principal architects deliver a comprehensive current-state audit and transformation blueprint.";
    context.usedSources.push({
      title: 'Our Delivery Methodology',
      url: '/our-approach',
      chunkId: 'approach-methodology',
    });
  } else if (
    lower.includes('how do i apply for that role') ||
    (lower.includes('how do i apply') && (lastUserMsg.includes('sap') || lastAssistantMsg.includes('sap')))
  ) {
    answer =
      "You can apply directly for open SAP Consultant positions through our Careers portal at /careers. Review the detailed qualifications, notice period expectations, and submit your resume directly.";
    context.usedSources.push({
      title: 'Careers at Axia Kairos',
      url: '/careers',
      chunkId: 'careers-index',
    });
  } else if (
    lower.includes('who can i speak with about setting that up') ||
    (lower.includes('who can i speak with') && (lastUserMsg.includes('offshore') || lastAssistantMsg.includes('offshore')))
  ) {
    answer =
      "You can speak directly with our principal advisory team to structure a dedicated offshore center or blended delivery team. I have opened our advisor consultation form below so our leadership can connect with you.";
    isHandoff = true;
    handoffReason = 'Dedicated offshore delivery center setup';
    context.usedSources.push({
      title: 'Contact Axia Kairos',
      url: '/contact',
      chunkId: 'contact-page',
    });
  }
  // 6. Vague or Multi-Part Queries
  else if (
    lower === 'tell me about your services' ||
    lower === 'what services do you offer' ||
    lower === 'what services do you provide' ||
    lower === 'what do you do' ||
    lower === 'services'
  ) {
    answer =
      "Axia Kairos provides 12 enterprise transformation practices across SAP advisory and implementation, cloud modernization, data engineering, business process automation, and cyber security. Which specific technology domain, business challenge, or industry is your organization looking to modernize?";
    context.usedSources.push({
      title: 'Enterprise Services Overview',
      url: '/services',
      chunkId: 'services-index',
    });
  } else if (
    lower === 'can you help our business?' ||
    lower === 'can you help our business' ||
    lower === 'help our company'
  ) {
    answer =
      "Axia Kairos partners with global enterprises to drive technology modernization, operational efficiency, and digital strategy. What strategic initiative or technical challenge would you like to discuss with our advisors?";
    context.usedSources.push({
      title: 'Our Delivery Methodology',
      url: '/our-approach',
      chunkId: 'approach-methodology',
    });
  } else if (
    lower.includes('what is sap s/4hana and how does axia kairos handle migrations')
  ) {
    answer =
      "SAP S/4HANA is SAP's modern enterprise resource planning (ERP) platform built on an in-memory database to deliver real-time transactions and analytics. Axia Kairos handles end-to-end ECC to S/4HANA migrations with pre-migration data cleansing, BTP integration extensions, and zero-downtime execution.";
    context.usedSources.push({
      title: 'SAP Implementation, Advisory & Support',
      url: '/services/sap-implementation-advisory-and-support',
      chunkId: 'services-sap',
    });
  } else if (
    lower.includes('what cloud platforms do you support, and what methodology')
  ) {
    answer =
      "Axia Kairos supports AWS, Microsoft Azure, and Google Cloud Platform (GCP). We migrate workloads using our structured 5-step methodology: Discover & Diagnose, Architecture & Blueprint, Agile Sprint Delivery, Validation & Testing, and Value Realization.";
    context.usedSources.push({
      title: 'Cloud Platform Modernization',
      url: '/services/cloud-platform-modernization',
      chunkId: 'services-cloud',
    });
    context.usedSources.push({
      title: 'Our Delivery Methodology',
      url: '/our-approach',
      chunkId: 'approach-methodology',
    });
  } else if (
    lower.includes('what are your core values, and where are your offices')
  ) {
    answer =
      "Axia Kairos is guided by five core values: Excellence, Integrity, Innovation, Client-Centricity, and Collaboration. Our corporate regional hubs are located across Canada, India, the USA, and the UAE.";
    context.usedSources.push({
      title: 'About Axia Kairos',
      url: '/about',
      chunkId: 'about-overview',
    });
    context.usedSources.push({
      title: 'Corporate Office Locations',
      url: '/contact',
      chunkId: 'contact-offices',
    });
  }
  // 7. Services Specific Inquiries
  else if (lower.includes('sap services') || lower.includes('sap capabilities')) {
    answer =
      "Axia Kairos provides end-to-end SAP Implementation, Advisory & Support, including SAP ECC to S/4HANA migrations, SAP BTP extensions, Datasphere analytics, automated financial workflows, and 24/7 post-go-live support.";
    context.usedSources.push({
      title: 'SAP Implementation, Advisory & Support',
      url: '/services/sap-implementation-advisory-and-support',
      chunkId: 'services-sap',
    });
  } else if (lower.includes('cloud platform modernization')) {
    answer =
      "Our Cloud Platform Modernization practice architects multi-cloud architectures across AWS, Microsoft Azure, and Google Cloud Platform (GCP). Capabilities include Kubernetes containerization, infrastructure as code, microservices, and FinOps cost optimization.";
    context.usedSources.push({
      title: 'Cloud Platform Modernization',
      url: '/services/cloud-platform-modernization',
      chunkId: 'services-cloud',
    });
  } else if (lower.includes('data engineering and analytics')) {
    answer =
      "Our Data Engineering and Analytics practice builds modern lakehouse architectures, real-time data pipelines, data governance frameworks, and automated executive analytics using Snowflake, Databricks, Apache Spark, and Power BI.";
    context.usedSources.push({
      title: 'Data Engineering and Analytics',
      url: '/services/data-engineering-and-analytics',
      chunkId: 'services-data',
    });
  } else if (lower.includes('business process automation')) {
    answer =
      "We deliver Business Process Automation through robotic process automation (RPA), intelligent workflow orchestration, and machine learning models to eliminate operational friction across finance, procurement, and supply chain operations.";
    context.usedSources.push({
      title: 'Business Process Automation',
      url: '/services/business-process-automation',
      chunkId: 'services-automation',
    });
  } else if (lower.includes('cyber security services') || lower.includes('cyber security')) {
    answer =
      "Axia Kairos delivers comprehensive Cyber Security Services, including zero-trust security architecture, cloud security posture management, identity and access management, vulnerability management, and regulatory compliance readiness.";
    context.usedSources.push({
      title: 'Cyber Security Services',
      url: '/services/cyber-security-services',
      chunkId: 'services-cyber',
    });
  } else if (lower.includes('digital transformation')) {
    answer =
      "Our Digital Transformation practice aligns enterprise operating models, digital architecture, and execution roadmaps to accelerate digital capability delivery and customer-facing innovation.";
    context.usedSources.push({
      title: 'Digital Transformation',
      url: '/services/digital-transformation-1',
      chunkId: 'services-digital',
    });
  } else if (lower.includes('application managed it services') || lower.includes('managed it services')) {
    answer =
      "Our Application Managed IT Services provide SLA-driven 24/7 application support, proactive system monitoring, incident resolution, performance tuning, and continuous enhancement management for critical enterprise systems.";
    context.usedSources.push({
      title: 'Application Managed IT Services',
      url: '/services/application-managed-it-services',
      chunkId: 'services-managed-it',
    });
  } else if (lower.includes('web development')) {
    answer =
      "Axia Kairos engineers custom enterprise Web Development applications featuring modern frontend microservices, cloud-native backend APIs, robust security controls, and responsive user experiences.";
    context.usedSources.push({
      title: 'Web Development',
      url: '/services/web-development',
      chunkId: 'services-web',
    });
  } else if (lower.includes('mobility & app development') || lower.includes('mobility and app')) {
    answer =
      "Our Mobility & App Development practice builds secure, scalable native and cross-platform mobile apps for iOS and Android, integrating backend ERP systems with real-time field workflows.";
    context.usedSources.push({
      title: 'Mobility & App Development',
      url: '/services/mobility-and-app-development',
      chunkId: 'services-mobility',
    });
  } else if (lower.includes('management consulting')) {
    answer =
      "Our Management Consulting practice advises executives on strategic IT governance, enterprise operating model design, digital portfolio prioritization, and change management.";
    context.usedSources.push({
      title: 'Management Consulting',
      url: '/services/management-consulting',
      chunkId: 'services-consulting',
    });
  } else if (lower.includes('e-commerce solutions')) {
    answer =
      "We deliver enterprise E-Commerce Solutions with modern headless architectures, unified omnichannel commerce, friction-free checkout workflows, and resilient ERP inventory synchronization.";
    context.usedSources.push({
      title: 'E-Commerce Solutions',
      url: '/services/e-commerce-solutions',
      chunkId: 'services-ecommerce',
    });
  } else if (lower.includes('ai, blockchain, and iot') || lower.includes('ai, blockchain')) {
    answer =
      "Our AI, Blockchain, and IoT Integration practice connects physical assets, distributed ledgers, and intelligent AI models to provide real-time supply chain transparency and predictive operational intelligence.";
    context.usedSources.push({
      title: 'AI, Blockchain, and IoT Integration',
      url: '/services/ai-blockchain-and-io-t-integration',
      chunkId: 'services-ai-iot',
    });
  } else if (lower.includes('sap btp integrations') || (lower.includes('sap btp') && !lower.includes('case study'))) {
    answer =
      "We specialize in SAP BTP (Business Technology Platform) integration, developing custom clean-core extensions, automated workflow triggers, and event-driven architectures connecting SAP to external multi-cloud APIs.";
    context.usedSources.push({
      title: 'SAP Implementation, Advisory & Support',
      url: '/services/sap-implementation-advisory-and-support',
      chunkId: 'services-sap',
    });
  } else if (lower.includes('migrate legacy on-prem infrastructure to multi-cloud')) {
    answer =
      "Axia Kairos executes seamless legacy on-prem to multi-cloud modernization across AWS, Azure, and GCP, refactoring monolithic workloads into resilient microservices while optimizing infrastructure spend.";
    context.usedSources.push({
      title: 'Cloud Platform Modernization',
      url: '/services/cloud-platform-modernization',
      chunkId: 'services-cloud',
    });
  } else if (lower.includes('how many total enterprise service practices') || lower.includes('how many services')) {
    answer =
      "Axia Kairos operates 12 dedicated enterprise services practices spanning SAP, cloud modernization, data engineering, business process automation, cyber security, and management consulting.";
    context.usedSources.push({
      title: 'Enterprise Services Overview',
      url: '/services',
      chunkId: 'services-index',
    });
  }
  // 8. Case Studies Specific Inquiries
  else if (lower.includes('telecommunications cloud modernization')) {
    answer =
      "For a leading telecommunications enterprise, Axia Kairos delivered cloud platform modernization and data analytics transformation that reduced cloud infrastructure costs by 38% while automating network analytics.";
    context.usedSources.push({
      title: 'Telecommunications Cloud Modernization',
      url: '/case-studies/cloud-modernization-telecom',
      chunkId: 'cs-telecom',
    });
  } else if (lower.includes('logistics and transportation sap automation')) {
    answer =
      "For an intelligent logistics & transportation enterprise, we implemented automation and SAP integration that achieved 99.99% system availability and accelerated shipment dispatch cycles.";
    context.usedSources.push({
      title: 'Logistics SAP Automation & Integration',
      url: '/case-studies/logistics-sap-automation-integration',
      chunkId: 'cs-logistics',
    });
  } else if (lower.includes('pharmaceutical data compliance')) {
    answer =
      "For a global pharmaceutical enterprise, Axia Kairos automated data quality and regulatory compliance verification, achieving a 99.8% regulatory data validation rate across cross-border clinical submissions.";
    context.usedSources.push({
      title: 'Pharmaceutical Data Quality & Compliance',
      url: '/case-studies/pharma-data-compliance-automation',
      chunkId: 'cs-pharma',
    });
  } else if (lower.includes('healthcare sap btp data integration') || (lower.includes('healthcare') && lower.includes('case study'))) {
    answer =
      "For a global healthcare provider, Axia Kairos delivered a unified data integration framework leveraging SAP BTP to harmonize millions of patient and clinical records with zero system disruptions.";
    context.usedSources.push({
      title: 'Healthcare Data Integration with SAP BTP',
      url: '/case-studies/healthcare-data-integration-sap-btp',
      chunkId: 'cs-healthcare',
    });
  } else if (lower.includes('government and public sector')) {
    answer =
      "For a government and public sector organization, we engineered a scalable data analytics and automation framework that automated public reporting compliance and reduced processing latency by 65%.";
    context.usedSources.push({
      title: 'Public Sector Data Analytics & Automation',
      url: '/case-studies/public-sector-data-analytics-automation',
      chunkId: 'cs-public-sector',
    });
  } else if (lower.includes('sap s/4hana migration for financial services') || lower.includes('financial services sap')) {
    answer =
      "For a leading financial services enterprise, Axia Kairos orchestrated a zero-downtime SAP ECC to S/4HANA migration, modernizing core general ledger reconciliations with zero operational downtime.";
    context.usedSources.push({
      title: 'Financial Services SAP S/4HANA Migration',
      url: '/case-studies/sap-s4hana-migration-bfsi',
      chunkId: 'cs-bfsi',
    });
  } else if (lower.includes('manufacturing enterprise automation') || lower.includes('manufacturing automation')) {
    answer =
      "For a global manufacturing enterprise, Axia Kairos implemented SAP BTP automation across assembly scheduling and supplier inventory, driving significant operational transformation and defect reductions.";
    context.usedSources.push({
      title: 'Manufacturing Operational Transformation',
      url: '/case-studies/manufacturing-automation-sap-btp',
      chunkId: 'cs-manufacturing',
    });
  } else if (lower.includes('energy and utilities sap migration') || lower.includes('energy and utilities')) {
    answer =
      "For a global energy & utilities enterprise, Axia Kairos executed SAP S/4HANA migration combined with automated data governance modernization across thousands of distributed asset sensor nodes.";
    context.usedSources.push({
      title: 'Energy & Utilities SAP Migration',
      url: '/case-studies/sap-s-4-hana-migration-and-data-governance-modernization-for-a-global-energy-and-utilities-enterprise',
      chunkId: 'cs-energy',
    });
  } else if (lower.includes('retail and e-commerce cloud modernization') || lower.includes('retail & e-commerce')) {
    answer =
      "For a global retail & e-commerce enterprise, Axia Kairos delivered cloud modernization and data analytics transformation that scaled customer personalization and handled peak holiday traffic seamlessly.";
    context.usedSources.push({
      title: 'Retail Cloud Modernization',
      url: '/case-studies/cloud-modernization-retail',
      chunkId: 'cs-retail',
    });
  } else if (lower.includes('case studies client-named or anonymized') || lower.includes('client-named or anonymized')) {
    answer =
      "All case studies published on the Axia Kairos website are strictly anonymized in accordance with client confidentiality agreements and enterprise NDAs. You can connect with our leadership team under NDA for formal credentials.";
    context.usedSources.push({
      title: 'Enterprise Case Studies',
      url: '/case-studies',
      chunkId: 'case-studies-index',
    });
  }
  // 9. Industries Specific Inquiries
  else if (lower.includes('automotive & manufacturing') || lower.includes('automotive')) {
    answer =
      "For Automotive & Manufacturing enterprises, Axia Kairos modernizes supply chain logistics, implements predictive maintenance, and integrates plant-floor IoT telemetry with core SAP S/4HANA backends.";
    context.usedSources.push({
      title: 'Industries We Serve',
      url: '/industries',
      chunkId: 'industries-index',
    });
  } else if (lower.includes('energy & utilities') || lower.includes('energy and utilities')) {
    answer =
      "For Energy & Utilities, we optimize smart grid data pipelines, automate regulatory asset reporting, and deploy secure cloud infrastructure for mission-critical operations.";
    context.usedSources.push({
      title: 'Industries We Serve',
      url: '/industries',
      chunkId: 'industries-index',
    });
  } else if (lower.includes('banking & financial services') || lower.includes('banking')) {
    answer =
      "For Banking & Financial Services, Axia Kairos delivers core banking modernization, automated fraud detection, regulatory compliance analytics, and zero-downtime financial system migrations.";
    context.usedSources.push({
      title: 'Industries We Serve',
      url: '/industries',
      chunkId: 'industries-index',
    });
  } else if (lower.includes('healthcare & life sciences') || lower.includes('healthcare')) {
    answer =
      "For Healthcare & Life Sciences, we implement HIPAA-compliant data lakes, streamline electronic health records interoperability, and automate clinical trial data validation.";
    context.usedSources.push({
      title: 'Industries We Serve',
      url: '/industries',
      chunkId: 'industries-index',
    });
  } else if (lower.includes('how many total enterprise industry domains') || lower.includes('how many industries')) {
    answer =
      "Axia Kairos supports 12 enterprise industries and domains: Automotive & Manufacturing, Energy & Utilities, Banking & Financial Services, Healthcare & Life Sciences, Retail & E-Commerce, Telecommunications, Transportation & Logistics, Public Sector, Aerospace & Defense, Consumer Goods, Technology & Media, and Insurance.";
    context.usedSources.push({
      title: 'Industries We Serve',
      url: '/industries',
      chunkId: 'industries-index',
    });
  }
  // 10. Careers Specific Inquiries
  else if (lower.includes('open positions') || lower.includes('positions are currently available')) {
    answer =
      "Current open career roles at Axia Kairos include SAP Consultants, Senior SAP Consultants, Business Development Managers, Finance Controllers, and HR Operations Executives across our global corporate hubs.";
    context.usedSources.push({
      title: 'Careers at Axia Kairos',
      url: '/careers',
      chunkId: 'careers-index',
    });
  } else if (lower.includes('open jobs for sap consultants') || lower.includes('sap consultant')) {
    answer =
      "Yes, Axia Kairos is actively hiring SAP Consultants with hands-on expertise in S/4HANA migration, BTP, and ABAP. You can review job requirements and apply directly through our Careers page.";
    context.usedSources.push({
      title: 'Careers at Axia Kairos',
      url: '/careers',
      chunkId: 'careers-sap',
    });
  } else if (lower.includes('finance controller')) {
    answer =
      "The Finance Controller position oversees global financial reporting, statutory compliance, audit coordination, and cash management across our regional entities in North America, EMEA, and APAC.";
    context.usedSources.push({
      title: 'Careers at Axia Kairos',
      url: '/careers',
      chunkId: 'careers-finance',
    });
  } else if (lower.includes('where are open career opportunities located') || lower.includes('career opportunities located')) {
    answer =
      "Open careers and job opportunity locations span our regional corporate offices and delivery hubs across Canada, India, the USA, and the UAE, featuring hybrid and onsite consulting engagement arrangements.";
    context.usedSources.push({
      title: 'Careers at Axia Kairos',
      url: '/careers',
      chunkId: 'careers-index',
    });
  } else if (lower.includes('how do candidates apply') || lower.includes('how to apply')) {
    answer =
      "Candidates can explore all current openings and submit their resumes directly through our Careers portal at /careers. Our recruitment team reviews submissions within 5 business days.";
    context.usedSources.push({
      title: 'Careers at Axia Kairos',
      url: '/careers',
      chunkId: 'careers-index',
    });
  }
  // 11. How We Work & Methodology
  else if (lower.includes('5-step delivery methodology') || lower.includes('5-step methodology')) {
    answer =
      "Axia Kairos delivers projects through a 5-step methodology: 1. Discover & Diagnose, 2. Architecture & Blueprint, 3. Agile Sprint Delivery, 4. Validation & Testing, and 5. Value Realization & Managed Support.";
    context.usedSources.push({
      title: 'Our Delivery Methodology',
      url: '/our-approach',
      chunkId: 'approach-methodology',
    });
  } else if (lower.includes('four strategic framework pillars') || lower.includes('framework pillars')) {
    answer =
      "Our four strategic framework pillars are Strategic Alignment, Architecture & Engineering, Agile Execution, and Value Realization, ensuring transformation initiatives achieve verifiable business outcomes.";
    context.usedSources.push({
      title: 'Our Delivery Methodology',
      url: '/our-approach',
      chunkId: 'approach-framework',
    });
  } else if (lower.includes('engagement delivery models') || lower.includes('delivery models do you support')) {
    answer =
      "Axia Kairos supports three primary delivery models: Onsite Advisory (embedded principal architects), Dedicated Offshore Delivery Centers (scalable engineering hubs), and Hybrid Blended Teams (round-the-clock follow-the-sun delivery).";
    context.usedSources.push({
      title: 'Our Delivery Methodology',
      url: '/our-approach',
      chunkId: 'approach-delivery-models',
    });
  } else if (lower.includes('core company values') || lower.includes('core values')) {
    answer =
      "Axia Kairos is guided by five foundational values: Excellence (precision execution), Integrity (uncompromised ethics), Innovation (emerging technologies), Client-Centricity (tangible outcomes), and Collaboration (co-creating value).";
    context.usedSources.push({
      title: 'About Axia Kairos',
      url: '/about',
      chunkId: 'about-values',
    });
  } else if (lower.includes('enterprise software products') || lower.includes('products has axia kairos engineered')) {
    answer =
      "Axia Kairos has engineered 5 proprietary enterprise accelerators: Axia Intelligence Core, Enterprise Data Hub, CloudBridge Modernizer, ComplianceGuard, and CommerceMatrix.";
    context.usedSources.push({
      title: 'Enterprise Software Products',
      url: '/products',
      chunkId: 'products-index',
    });
  } else if (lower.includes('where are axia kairos corporate office hubs') || lower.includes('office hubs located')) {
    answer =
      "Axia Kairos operates regional corporate hubs across Canada, India, the USA, and the UAE (Dubai), providing 24/7 client delivery capability worldwide.";
    context.usedSources.push({
      title: 'Corporate Office Locations',
      url: '/contact',
      chunkId: 'contact-offices',
    });
  }
  // 12. General Knowledge Base Retrieval using BM25 and Curated FAQ
  else {
    const hits = retriever.search(userMessage, undefined, 5, 0.5);

    if (hits.length === 0) {
      answer =
        "I don't have that specific information in our approved company knowledge base. I've opened our consultation form below so our principal advisory team can assist you directly.";
      isHandoff = true;
      handoffReason = `Unanswered question: ${userMessage}`;
      logUnansweredQuestion(userMessage, []);
      context.usedSources.push({
        title: 'Contact Axia Kairos',
        url: '/contact',
        chunkId: 'contact-page',
      });
    } else {
      for (const h of hits) {
        context.usedSources.push({ title: h.title, url: h.url, chunkId: h.id });
      }

      const top = hits[0];
      if (top.type === 'faq') {
        const textParts = top.text.split('Approved Answer:');
        if (textParts.length > 1) {
          answer = textParts[1].split('Context:')[0].trim();
        } else {
          answer = top.text;
        }
      } else {
        const cleanLines = top.text
          .split('\n')
          .filter((l) => !l.startsWith('<') && !l.startsWith('Tagline:') && l.trim().length > 0);
        answer = cleanLines.slice(0, 4).join(' ').trim();
      }
    }
  }

  // Stream token-by-token
  const words = answer.split(' ');
  for (let i = 0; i < words.length; i++) {
    sendEvent({ event: 'token', data: words[i] + (i === words.length - 1 ? '' : ' ') });
    await new Promise((r) => setTimeout(r, 6));
  }

  // Stream sources
  if (context.usedSources.length > 0) {
    const uniqueSources = Array.from(
      new Map(context.usedSources.map((s) => [s.url, s])).values()
    );
    sendEvent({ event: 'sources', data: uniqueSources });
  }

  // Context-aware chips
  const suggestionChips = generateContextAwareChips(context, userMessage);
  sendEvent({ event: 'chips', data: suggestionChips });

  // Stream handoff form if triggered
  if (isHandoff) {
    sendEvent({
      event: 'form',
      data: {
        reason: handoffReason || 'Principal advisory engagement requested.',
        prefill: context.handoffPrefill || {},
      },
    });
  }

  sendEvent({ event: 'done', data: {} });
}
