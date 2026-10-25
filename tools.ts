import { z } from 'zod';
import { getRetriever, Chunk } from './retrieval';
import { VALID_INTERNAL_ROUTES } from './guardrails';

export interface CardItem {
  type: string;
  slug: string;
  title: string;
  subtitle: string;
  image: string;
  url: string;
}

export interface ToolContext {
  usedSources: Array<{ title: string; url: string; chunkId: string }>;
  cards?: CardItem[];
  chips?: string[];
  handoffReason?: string;
  wantsHandoff?: boolean;
  handoffPrefill?: {
    name?: string;
    email?: string;
    company?: string;
    message?: string;
  };
}

export interface AgentTool<TInput = any, TOutput = any> {
  name: string;
  description: string;
  schema: z.ZodSchema<TInput>;
  anthropicDefinition: {
    name: string;
    description: string;
    input_schema: Record<string, any>;
  };
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

// -------------------------------------------------------------
// 1. Tool: search_knowledge_base
// -------------------------------------------------------------
const SearchKnowledgeBaseSchema = z.object({
  query: z.string().min(1, 'Query must be non-empty'),
  category: z
    .enum(['services', 'case_studies', 'industries', 'careers', 'about', 'faq', 'contact'])
    .optional(),
});

type SearchKnowledgeBaseInput = z.infer<typeof SearchKnowledgeBaseSchema>;

export const searchKnowledgeBaseTool: AgentTool<SearchKnowledgeBaseInput> = {
  name: 'search_knowledge_base',
  description:
    'Search the Axia Kairos knowledge base for verified company content. Returns 3 to 5 relevant chunks containing title, text, and page URL. Categories: services, case_studies, industries, careers, about, faq, contact.',
  schema: SearchKnowledgeBaseSchema,
  anthropicDefinition: {
    name: 'search_knowledge_base',
    description:
      'Search the Axia Kairos knowledge base for verified company content. Returns 3 to 5 relevant chunks containing title, text, and page URL.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query or keywords to look up.',
        },
        category: {
          type: 'string',
          enum: ['services', 'case_studies', 'industries', 'careers', 'about', 'faq', 'contact'],
          description: 'Optional category filter.',
        },
      },
      required: ['query'],
    },
  },
  execute: async (input: SearchKnowledgeBaseInput, context: ToolContext) => {
    const retriever = getRetriever();
    // Retrieve top 3 to 5 chunks with category filter and min score threshold
    const chunks = retriever.search(input.query, input.category, 5, 0.8);

    for (const chunk of chunks) {
      if (!context.usedSources.some((s) => s.url === chunk.url)) {
        context.usedSources.push({
          title: chunk.title,
          url: chunk.url,
          chunkId: chunk.id,
        });
      }
    }

    if (chunks.length === 0) {
      return {
        found: false,
        message: 'No approved knowledge base content found matching this query.',
        chunks: [],
      };
    }

    return {
      found: true,
      count: chunks.length,
      chunks: chunks.map((c) => ({
        title: c.title,
        text: c.text,
        url: c.url,
        category: c.type,
        score: c.score,
      })),
    };
  },
};

// -------------------------------------------------------------
// 2. Tool: get_page_link
// -------------------------------------------------------------
const GetPageLinkSchema = z.object({
  page: z.string().min(1, 'Page identifier must be non-empty'),
});

type GetPageLinkInput = z.infer<typeof GetPageLinkSchema>;

// Quick keyword to verified route dictionary
const ROUTE_KEYWORD_MAP: Record<string, string> = {
  home: '/',
  about: '/about',
  'our approach': '/our-approach',
  approach: '/our-approach',
  methodology: '/our-approach',
  services: '/services',
  industries: '/industries',
  careers: '/careers',
  jobs: '/careers',
  hiring: '/careers',
  'case studies': '/case-studies',
  'case study': '/case-studies',
  cases: '/case-studies',
  blogs: '/blogs',
  contact: '/contact',
  'contact us': '/contact',
  products: '/products',
  sap: '/services/sap-implementation-advisory-and-support',
  'sap s/4hana': '/services/sap-implementation-advisory-and-support',
  cloud: '/services/cloud-platform-modernization',
  data: '/services/data-engineering-and-analytics',
  analytics: '/services/data-engineering-and-analytics',
  automation: '/services/business-process-automation',
  security: '/services/cyber-security-services',
  cybersecurity: '/services/cyber-security-services',
  ai: '/services/ai-blockchain-and-io-t-integration',
  'privacy policy': '/privacy-policy',
  terms: '/terms-and-conditions',
};

export const getPageLinkTool: AgentTool<GetPageLinkInput> = {
  name: 'get_page_link',
  description:
    'Returns a verified internal website route from the strict allowlist of real site pages. Never lets the assistant invent URLs.',
  schema: GetPageLinkSchema,
  anthropicDefinition: {
    name: 'get_page_link',
    description:
      'Returns a verified internal website URL from the approved site route allowlist. Never invent URLs.',
    input_schema: {
      type: 'object',
      properties: {
        page: {
          type: 'string',
          description:
            'Page name or topic (e.g. services, sap, cloud, data, case-studies, careers, contact, about, our-approach).',
        },
      },
      required: ['page'],
    },
  },
  execute: async (input: GetPageLinkInput, context: ToolContext) => {
    const raw = input.page.toLowerCase().trim();

    // Check if directly valid route
    if (VALID_INTERNAL_ROUTES.has(raw)) {
      return { url: raw, valid: true };
    }

    const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
    if (VALID_INTERNAL_ROUTES.has(withLeadingSlash)) {
      return { url: withLeadingSlash, valid: true };
    }

    // Check keyword map
    if (ROUTE_KEYWORD_MAP[raw]) {
      return { url: ROUTE_KEYWORD_MAP[raw], valid: true };
    }

    // Fuzzy partial match in allowed routes
    for (const validRoute of VALID_INTERNAL_ROUTES) {
      if (validRoute.includes(raw) || raw.includes(validRoute.replace('/', ''))) {
        return { url: validRoute, valid: true };
      }
    }

    // Fallback safe route
    return {
      url: '/services',
      valid: true,
      note: `Requested page "${input.page}" mapped to closest valid enterprise section /services.`,
    };
  },
};

// -------------------------------------------------------------
// 3. Tool: open_handoff_form
// -------------------------------------------------------------
const OpenHandoffFormSchema = z.object({
  prefill: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      company: z.string().optional(),
      message: z.string().optional(),
    })
    .optional()
    .default({}),
});

type OpenHandoffFormInput = z.infer<typeof OpenHandoffFormSchema>;

export const openHandoffFormTool: AgentTool<OpenHandoffFormInput> = {
  name: 'open_handoff_form',
  description:
    'Tells the frontend to open the advisor consultation form with fields prefilled from the conversation. Use when visitor requests quotes, pricing, meetings, audits, or when knowledge base cannot answer.',
  schema: OpenHandoffFormSchema,
  anthropicDefinition: {
    name: 'open_handoff_form',
    description:
      'Opens the advisor consultation form in the UI with optional prefilled fields from the conversation.',
    input_schema: {
      type: 'object',
      properties: {
        prefill: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "Visitor's full name if provided." },
            email: { type: 'string', description: "Visitor's email address if provided." },
            company: { type: 'string', description: "Visitor's company name if provided." },
            message: { type: 'string', description: 'Brief summary of what the visitor needs.' },
          },
        },
      },
    },
  },
  execute: async (input: OpenHandoffFormInput, context: ToolContext) => {
    context.wantsHandoff = true;
    context.handoffPrefill = input.prefill || {};
    context.handoffReason = input.prefill?.message || 'Consultation inquiry with principal advisor';

    return {
      success: true,
      status: 'form_opened',
      message: 'Advisor consultation form has been opened in the UI with prefilled parameters.',
      prefill: context.handoffPrefill,
    };
  },
};

// -------------------------------------------------------------
// EXTENSIBLE TOOL REGISTRY
// To add more agents/tools (e.g. meeting_booking_agent, case_study_finder),
// simply add them to this registry array without rewriting the loop.
// -------------------------------------------------------------
export const TOOL_REGISTRY: AgentTool[] = [
  searchKnowledgeBaseTool,
  getPageLinkTool,
  openHandoffFormTool,
];

export const TOOL_DEFINITIONS = TOOL_REGISTRY.map((t) => t.anthropicDefinition);

export const OPENAI_TOOL_DEFINITIONS = TOOL_REGISTRY.map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.anthropicDefinition.input_schema,
  },
}));

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  context: ToolContext
): Promise<any> {
  const tool = TOOL_REGISTRY.find((t) => t.name === toolName);
  if (!tool) {
    throw new Error(`Tool "${toolName}" not found in registered agent tools.`);
  }

  // Zod validation
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = (parsed.error as any).issues || (parsed.error as any).errors || [];
    return {
      error: 'Invalid tool arguments',
      validationErrors: issues.map((e: any) => `${(e.path || []).join('.')}: ${e.message}`),
    };
  }

  return await tool.execute(parsed.data, context);
}
