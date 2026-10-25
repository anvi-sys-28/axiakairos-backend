import { servicesData } from './services';
import { caseStudies } from './caseStudies';
import { blogs } from './blogs';
// Build static search items from source of truth
const sitePages = [
    {
        id: 'page-services',
        title: 'All Services Overview',
        subtitle: 'Explore our 12 enterprise consulting and technology practices',
        url: '/services',
        category: 'page',
        keywords: ['services', 'solutions', 'offerings', 'capabilities', 'practices', 'overview'],
    },
    {
        id: 'page-case-studies',
        title: 'Case Studies & Client Results',
        subtitle: 'Verified outcomes and digital transformations across global enterprises',
        url: '/case-studies',
        category: 'page',
        keywords: ['case studies', 'results', 'clients', 'success stories', 'projects', 'portfolio'],
    },
    {
        id: 'page-about',
        title: 'About Axia Kairos',
        subtitle: 'Our leadership, mission, global presence and consulting approach',
        url: '/about',
        category: 'page',
        keywords: ['about', 'company', 'leadership', 'team', 'mission', 'vision', 'who we are'],
    },
    {
        id: 'page-careers',
        title: 'Careers at Axia Kairos',
        subtitle: 'Current openings across SAP, consulting, engineering and sales',
        url: '/careers',
        category: 'page',
        keywords: ['careers', 'jobs', 'openings', 'hiring', 'work with us', 'opportunities'],
    },
    {
        id: 'page-contact',
        title: 'Contact & Global Offices',
        subtitle: 'Connect with our advisory team across our locations in India, Canada & worldwide',
        url: '/contact',
        category: 'page',
        keywords: ['contact', 'email', 'phone', 'offices', 'locations', 'talk to us', 'inquiry'],
    },
    {
        id: 'page-assistant',
        title: 'AXIA AI Assistant',
        subtitle: 'Ask questions and get grounded answers about our capabilities',
        url: '/assistant',
        category: 'page',
        keywords: ['assistant', 'ai', 'chat', 'ask axia', 'chatbot'],
    },
];
const serviceSearchItems = servicesData.map((s) => ({
    id: `service-${s.slug}`,
    title: s.title,
    subtitle: s.shortDescription,
    url: `/services/${s.slug}`,
    category: 'service',
    keywords: [
        s.title.toLowerCase(),
        s.slug.replace(/-/g, ' '),
        ...s.shortDescription.toLowerCase().split(/\s+/),
        ...(s.slug.includes('sap') ? ['s4hana', 'erp', 'btp', 'fiori', 'migration', 'hana'] : []),
        ...(s.slug.includes('cloud') ? ['aws', 'azure', 'gcp', 'devops', 'kubernetes', 'modernization'] : []),
        ...(s.slug.includes('data') ? ['analytics', 'bi', 'datasphere', 'warehouse', 'pipeline', 'engineering'] : []),
        ...(s.slug.includes('security') ? ['cybersecurity', 'soc', 'compliance', 'infosec', 'zero trust'] : []),
        ...(s.slug.includes('ai') ? ['artificial intelligence', 'machine learning', 'blockchain', 'iot', 'smart'] : []),
        ...(s.slug.includes('automation') ? ['rpa', 'workflow', 'orchestration', 'efficiency'] : []),
    ],
}));
const caseStudySearchItems = caseStudies.map((cs) => ({
    id: `cs-${cs.slug}`,
    title: cs.title,
    subtitle: `${cs.industry} • ${cs.summary}`,
    url: `/case-studies/${cs.slug}`,
    category: 'case_study',
    keywords: [
        cs.title.toLowerCase(),
        cs.industry.toLowerCase(),
        ...cs.technologies.map((t) => t.toLowerCase()),
        ...cs.summary.toLowerCase().split(/\s+/),
    ],
}));
const blogSearchItems = blogs.map((b) => ({
    id: `blog-${b.slug}`,
    title: b.title,
    subtitle: `${b.formattedDate || b.date.slice(0, 10)} • ${b.readingTimeMinutes} min read`,
    url: `/blogs/${b.slug}`,
    category: 'blog',
    keywords: [
        b.title.toLowerCase(),
        ...(b.excerpt ? b.excerpt.toLowerCase().split(/\s+/) : []),
    ],
}));
export const allSearchItems = [
    ...serviceSearchItems,
    ...sitePages,
    ...caseStudySearchItems,
    ...blogSearchItems,
];
// Popular recommended items shown when search input is empty
export const popularSearchItems = [
    serviceSearchItems.find((s) => s.id === 'service-sap-implementation-advisory-and-support'),
    serviceSearchItems.find((s) => s.id === 'service-cloud-platform-modernization'),
    serviceSearchItems.find((s) => s.id === 'service-data-engineering-and-analytics'),
    serviceSearchItems.find((s) => s.id === 'service-cyber-security-services'),
    serviceSearchItems.find((s) => s.id === 'service-business-process-automation'),
    serviceSearchItems.find((s) => s.id === 'service-digital-transformation-1'),
].filter(Boolean);
/**
 * Fast client-side search ranking algorithm
 */
export function searchSite(query, maxResults = 7) {
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ)
        return [];
    const tokens = cleanQ.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const item of allSearchItems) {
        const titleLower = item.title.toLowerCase();
        const subLower = item.subtitle.toLowerCase();
        let score = 0;
        // Exact title match = highest priority
        if (titleLower === cleanQ) {
            score += 100;
        }
        else if (titleLower.startsWith(cleanQ)) {
            score += 60;
        }
        else if (titleLower.includes(cleanQ)) {
            score += 40;
        }
        // Token matching
        let allTokensMatched = true;
        for (const token of tokens) {
            if (titleLower.includes(token)) {
                score += 20;
            }
            else if (subLower.includes(token)) {
                score += 10;
            }
            else if (item.keywords.some((k) => k.includes(token))) {
                score += 8;
            }
            else {
                allTokensMatched = false;
            }
        }
        if (allTokensMatched) {
            score += 15;
        }
        // Services get a small boost since users primarily search for services from Hero
        if (item.category === 'service') {
            score += 10;
        }
        if (score > 0) {
            scored.push({ item, score });
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((s) => s.item);
}
