import fs from 'fs';
import path from 'path';
import MiniSearch from 'minisearch';

export interface Chunk {
  id: string;
  type:
    | 'service'
    | 'case_study'
    | 'blog'
    | 'industry'
    | 'job'
    | 'about'
    | 'approach'
    | 'product'
    | 'contact'
    | 'legal'
    | 'faq';
  title: string;
  section: string;
  url: string;
  slug: string;
  text: string;
  score?: number;
}

export interface StructuredRegistry {
  services: Array<{ slug: string; title: string; shortDescription: string; route: string; image: string }>;
  caseStudies: Array<{ slug: string; title: string; industry: string; date: string; summary: string; image: string; metrics: string[]; url: string }>;
  industries: Array<{ slug: string; title: string; description: string; url: string }>;
  blogs: Array<{ slug: string; title: string; date: string; readingTime: string; summary: string; url: string; coverImage: string }>;
  jobs: Array<{ slug: string; title: string; department: string; location: string; employmentType: string; experience?: string; summary: string; url: string }>;
  products: Array<{ slug: string; title: string; description: string; url: string }>;
  about: {
    title: string;
    tagline: string;
    overview: string;
    headquarters: string;
    locations: string[];
    focusAreas: string[];
    mission: string;
    vision: string;
    values: Array<{ name: string; description: string }>;
  };
  approach: {
    title: string;
    subtitle: string;
    frameworkPillars: Array<{ title: string; description: string }>;
    methodologySteps: Array<{ stepNumber: number; title: string; description: string; points: string[] }>;
    deliveryModels: Array<{ title: string; description: string }>;
  };
  contact: {
    title: string;
    subtitle: string;
    emails: Record<string, string>;
    phones: Record<string, string>;
    offices: Array<{ country: string; flag: string; region: string; status: string; note: string }>;
    noteOnStreetAddresses: string;
  };
  legal: {
    privacyPolicy: { title: string; lastUpdated: string; summary: string; url: string };
    termsAndConditions: { title: string; lastUpdated: string; summary: string; url: string };
  };
}

export interface KnowledgeBaseData {
  generatedAt: string;
  totalChunks: number;
  chunks: Chunk[];
  structured: StructuredRegistry;
}

// Synonyms dictionary for normalized query expansion
const SYNONYMS_MAP: Record<string, string[]> = {
  sap: ['s/4hana', 's4hana', 's4', 'btp', 'abap', 'sac', 'bw/4hana', 'datasphere', 'ecc', 'erp'],
  erp: ['sap', 's/4hana', 'enterprise resource planning', 'ecc'],
  cloud: ['aws', 'azure', 'gcp', 'kubernetes', 'k8s', 'devops', 'infrastructure', 'modernization'],
  data: ['analytics', 'bi', 'etl', 'lakehouse', 'snowflake', 'databricks', 'pipeline', 'engineering', 'datasphere'],
  automation: ['rpa', 'bot', 'workflow', 'camunda', 'uipath', 'orchestration', 'bpa', 'agents', 'ai automation'],
  agents: ['ai', 'automation', 'llm', 'bots', 'agentic', 'intelligent'],
  ai: ['agents', 'machine learning', 'ml', 'genai', 'generative ai', 'automation', 'iot', 'blockchain'],
  security: ['cyber', 'cybersecurity', 'soc2', 'iso', 'zero-trust', 'compliance', 'iam', 'cspm'],
  career: ['job', 'jobs', 'hiring', 'openings', 'vacancies', 'roles', 'apply', 'careers', 'interview', 'work at axia'],
  office: ['offices', 'locations', 'headquarters', 'canada', 'india', 'usa', 'uae', 'address', 'visit'],
  contact: ['email', 'phone', 'reach', 'call', 'inquiry', 'sales', 'advisor', 'consultation'],
  pricing: ['cost', 'quote', 'fee', 'rate', 'budget', 'price', 'estimate'],
  about: ['who', 'company', 'mission', 'vision', 'values', 'leaders', 'team', 'axia kairos'],
  approach: ['methodology', 'framework', 'steps', 'process', 'delivery', 'onsite', 'offshore', 'hybrid'],
  case: ['case study', 'case studies', 'client story', 'success story', 'results', 'metrics', 'outcomes'],
  industries: ['sectors', 'domains', 'verticals', 'telecom', 'healthcare', 'manufacturing', 'retail', 'bfsi', 'banking', 'energy'],
};

// Map tool category names to underlying chunk types
export const CATEGORY_TYPE_MAP: Record<string, string[]> = {
  services: ['service'],
  case_studies: ['case_study'],
  industries: ['industry'],
  careers: ['job'],
  about: ['about', 'approach', 'product'],
  faq: ['faq'],
  contact: ['contact'],
  service: ['service'],
  case_study: ['case_study'],
  industry: ['industry'],
  job: ['job'],
};

function resolveKbPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'knowledge.json'),
    path.resolve(process.cwd(), 'backend', 'knowledge.json'),
    path.resolve(process.cwd(), 'server', 'knowledge.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export class KnowledgeRetriever {
  private kb: KnowledgeBaseData;
  private miniSearch: MiniSearch<Chunk>;

  constructor() {
    const kbPath = resolveKbPath();
    if (!fs.existsSync(kbPath)) {
      throw new Error(`Knowledge base file not found at ${kbPath}. Run 'npm run kb:build' first.`);
    }

    const raw = fs.readFileSync(kbPath, 'utf8');
    this.kb = JSON.parse(raw);

    // Initialize BM25 search engine with field boosts
    this.miniSearch = new MiniSearch<Chunk>({
      fields: ['title', 'section', 'text', 'slug'],
      storeFields: ['id', 'type', 'title', 'section', 'url', 'slug', 'text'],
      searchOptions: {
        boost: {
          title: 4.0,
          slug: 3.5,
          section: 2.5,
          text: 1.0,
        },
        fuzzy: 0.2,
        prefix: true,
      },
    });

    this.miniSearch.addAll(this.kb.chunks);
  }

  public getStructured(): StructuredRegistry {
    return this.kb.structured;
  }

  public getAllChunks(): Chunk[] {
    return this.kb.chunks;
  }

  public normalizeQuery(query: string): string {
    let normalized = query.toLowerCase().trim();

    // Expand known acronyms and terminology
    for (const [key, synonyms] of Object.entries(SYNONYMS_MAP)) {
      for (const syn of synonyms) {
        if (normalized.includes(syn) && !normalized.includes(key)) {
          normalized += ` ${key}`;
          break;
        }
      }
    }

    return normalized;
  }

  /**
   * Search knowledge base with category filter, BM25 scoring, and score threshold.
   */
  public search(
    query: string,
    categoryOrType?: string,
    limit: number = 5,
    minScoreThreshold: number = 1.0
  ): Chunk[] {
    const normalized = this.normalizeQuery(query);
    const queryLower = query.toLowerCase().trim();

    // Determine target chunk types from category
    let allowedTypes: string[] | undefined;
    if (categoryOrType) {
      const mapped = CATEGORY_TYPE_MAP[categoryOrType.toLowerCase()];
      allowedTypes = mapped || [categoryOrType];
    }

    const filter = allowedTypes
      ? (result: any) => allowedTypes!.includes(result.type)
      : undefined;

    const rawResults = this.miniSearch.search(normalized, {
      filter,
    });

    const candidateMap = new Map<string, { chunk: Chunk; score: number }>();

    // 1. Exact & partial title / slug boosts
    for (const chunk of this.kb.chunks) {
      if (allowedTypes && !allowedTypes.includes(chunk.type)) continue;

      const titleLower = chunk.title.toLowerCase();
      const slugLower = chunk.slug.toLowerCase();

      let boostScore = 0;
      if (titleLower === queryLower) {
        boostScore = 25000 + titleLower.length * 10;
      } else if (slugLower === queryLower) {
        boostScore = 20000 + slugLower.length * 10;
      } else if (titleLower.length > 3 && queryLower.includes(titleLower)) {
        boostScore = 15000 + titleLower.length * 10;
      } else if (slugLower !== 'about' && queryLower.includes(slugLower)) {
        boostScore = 10000 + slugLower.length * 10;
      } else if (
        slugLower === 'about' &&
        (queryLower.includes('about axia') || queryLower.includes('about us') || queryLower === 'about')
      ) {
        boostScore = 10000;
      } else if (titleLower.includes(queryLower)) {
        boostScore = 5000 + queryLower.length * 10;
      }

      // Curated FAQ strong match boost
      if (chunk.type === 'faq') {
        const questionLower = chunk.title.toLowerCase();
        if (questionLower.includes(queryLower) || queryLower.includes(questionLower)) {
          boostScore += 12000;
        } else {
          // Check word overlap
          const qWords = queryLower.split(/\s+/).filter((w) => w.length > 3);
          const matchCount = qWords.filter((w) => questionLower.includes(w)).length;
          if (matchCount >= 2) {
            boostScore += matchCount * 1500;
          }
        }
      }

      if (boostScore > 0) {
        candidateMap.set(chunk.id, { chunk, score: boostScore });
      }
    }

    // 2. Add BM25 search results with normalized scores
    for (const res of rawResults) {
      const fullChunk = this.kb.chunks.find((c) => c.id === res.id);
      if (!fullChunk) continue;

      const bm25Score = res.score;
      if (bm25Score < minScoreThreshold) continue;

      const existing = candidateMap.get(res.id);
      if (existing) {
        existing.score += bm25Score * 10;
      } else {
        candidateMap.set(res.id, { chunk: fullChunk, score: bm25Score });
      }
    }

    // Sort candidates descending by score
    const sorted = Array.from(candidateMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => ({
        ...entry.chunk,
        score: Math.round(entry.score * 100) / 100,
      }));

    return sorted;
  }

  public getChunkById(id: string): Chunk | undefined {
    return this.kb.chunks.find((c) => c.id === id);
  }

  public getChunksBySlug(slug: string): Chunk[] {
    return this.kb.chunks.filter((c) => c.slug.toLowerCase() === slug.toLowerCase());
  }

  public getChunksByType(type: Chunk['type']): Chunk[] {
    return this.kb.chunks.filter((c) => c.type === type);
  }
}

let instance: KnowledgeRetriever | null = null;
export function getRetriever(): KnowledgeRetriever {
  if (!instance) {
    instance = new KnowledgeRetriever();
  }
  return instance;
}
