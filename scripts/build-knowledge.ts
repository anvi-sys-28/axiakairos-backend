import fs from 'fs';
import path from 'path';

import { servicesData } from '../data/content/services';
import { caseStudies } from '../data/content/caseStudies';
import { blogs } from '../data/content/blogs';
import { jobs } from '../data/content/jobs';
import { industries } from '../data/content/industries';
import { products } from '../data/content/products';
import { approachData } from '../data/content/approach';
import { aboutData } from '../data/content/about';
import { contactData } from '../data/content/contact';
import { legalData } from '../data/content/legal';

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
}

export interface KnowledgeBase {
  generatedAt: string;
  totalChunks: number;
  chunks: Chunk[];
  structured: {
    services: Array<{
      slug: string;
      title: string;
      shortDescription: string;
      route: string;
      image: string;
    }>;
    caseStudies: Array<{
      slug: string;
      title: string;
      industry: string;
      date: string;
      summary: string;
      image: string;
      metrics: string[];
      url: string;
    }>;
    industries: Array<{
      slug: string;
      title: string;
      description: string;
      url: string;
    }>;
    blogs: Array<{
      slug: string;
      title: string;
      date: string;
      readingTime: string;
      summary: string;
      url: string;
      coverImage: string;
    }>;
    jobs: Array<{
      slug: string;
      title: string;
      department: string;
      location: string;
      employmentType: string;
      experience?: string;
      summary: string;
      url: string;
    }>;
    products: Array<{
      slug: string;
      title: string;
      description: string;
      url: string;
    }>;
    about: typeof aboutData;
    approach: typeof approachData;
    contact: typeof contactData;
    legal: typeof legalData;
  };
}

async function main() {
  console.log('⚡ Building Knowledge Base from single-source-of-truth data files...');
  const chunks: Chunk[] = [];

  // 1. SERVICES CHUNKS (12 Services)
  for (const s of servicesData) {
    const slug = s.slug;
    const url = `/services/${slug}`;

    // Chunk 1: Overview & Intro
    const introParagraphs = s.intro?.paragraphs?.join('\n') || '';
    chunks.push({
      id: `service-${slug}-overview`,
      type: 'service',
      title: s.title,
      section: 'Overview & Strategic Value',
      url,
      slug,
      text: `<service>: ${s.title} > Overview & Strategic Value\n${s.shortDescription}\nTagline: ${s.hero?.tagline || ''}\n${introParagraphs}`,
    });

    // Chunk 2: Why It Matters
    if (s.whyItMatters && s.whyItMatters.items && s.whyItMatters.items.length > 0) {
      const whyText = s.whyItMatters.items
        .map((it) => `• ${it.title}: ${it.text}`)
        .join('\n');
      chunks.push({
        id: `service-${slug}-why`,
        type: 'service',
        title: s.title,
        section: 'Strategic Value & Why It Matters',
        url,
        slug,
        text: `<service>: ${s.title} > Strategic Value & Why It Matters\nLead: ${s.whyItMatters.lead}\n${whyText}`,
      });
    }

    // Chunk 3: Portfolio & Capabilities
    if (s.portfolio && s.portfolio.items && s.portfolio.items.length > 0) {
      const portText = s.portfolio.items
        .map((p) => {
          const bullets = p.bullets && p.bullets.length > 0 ? '\n  ' + p.bullets.join('\n  ') : '';
          return `• ${p.title}: ${p.text}${bullets}`;
        })
        .join('\n');
      chunks.push({
        id: `service-${slug}-portfolio`,
        type: 'service',
        title: s.title,
        section: 'Offerings & Capabilities',
        url,
        slug,
        text: `<service>: ${s.title} > Offerings & Capabilities\nLead: ${s.portfolio.lead}\n${portText}`,
      });
    }

    // Chunk 4: Methodology & Delivery
    if (s.methodology && s.methodology.steps && s.methodology.steps.length > 0) {
      const stepsText = s.methodology.steps
        .map((step, idx) => `Step ${idx + 1} (${step.title}): ${step.text}`)
        .join('\n');
      chunks.push({
        id: `service-${slug}-methodology`,
        type: 'service',
        title: s.title,
        section: 'Delivery Methodology & Steps',
        url,
        slug,
        text: `<service>: ${s.title} > Delivery Methodology & Steps\n${stepsText}`,
      });
    }
  }

  // 2. CASE STUDIES CHUNKS (6 Case Studies)
  for (const cs of caseStudies) {
    const slug = cs.slug;
    const url = `/case-studies/${slug}`;

    // Chunk 1: Challenge & Solution
    const challengePoints = cs.businessChallenge?.points?.map((p) => `• ${p}`).join('\n') || '';
    const solutionItems = cs.solution?.items?.map((it) => `• ${it.title}: ${it.text}`).join('\n') || '';
    chunks.push({
      id: `case-study-${slug}-solution`,
      type: 'case_study',
      title: cs.title,
      section: 'Challenge & Technical Solution',
      url,
      slug,
      text: `<case_study>: ${cs.title} > Challenge & Technical Solution\nIndustry: ${cs.industry}\nClient Background: Anonymized enterprise client.\nSummary: ${cs.summary}\nChallenge: ${cs.businessChallenge?.lead || ''}\n${challengePoints}\nSolution: ${cs.solution?.lead || ''}\n${solutionItems}\nTechnologies: ${cs.technologies?.join(', ') || ''}`,
    });

    // Chunk 2: Results & Verified Exact Metrics
    const metricsItems = cs.results?.items
      ?.map((it) => `• ${it.metric ? `[${it.metric}] ` : ''}${it.title}: ${it.text}`)
      .join('\n') || '';
    chunks.push({
      id: `case-study-${slug}-results`,
      type: 'case_study',
      title: cs.title,
      section: 'Results & Verified Metrics',
      url,
      slug,
      text: `<case_study>: ${cs.title} > Results & Verified Metrics\nOutcome Lead: ${cs.results?.lead || ''}\nKey Results & Metrics:\n${metricsItems}`,
    });
  }

  // 3. BLOG POSTS CHUNKS (10 Blogs)
  for (const b of blogs) {
    const slug = b.slug;
    const url = `/blogs/${slug}`;

    const bodyText = (b.body || [])
      .map((blk) => {
        if (blk.type === 'p' || blk.type === 'quote') return blk.text;
        if (blk.type === 'h2' || blk.type === 'h3') return `\n### ${blk.text}`;
        if (blk.type === 'ul' || blk.type === 'ol') {
          return blk.items?.map((it) => `• ${it}`).join('\n') || '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');

    chunks.push({
      id: `blog-${slug}`,
      type: 'blog',
      title: b.title,
      section: 'Article Insights & Summary',
      url,
      slug,
      text: `<blog>: ${b.title} > Article Insights & Summary\nPublished: ${b.formattedDate || b.date} | Reading Time: ${b.readingTimeMinutes} min\nSummary: ${b.excerpt}\n\n${bodyText}`,
    });
  }

  // 4. OPEN CAREER JOBS (5 Open Jobs)
  for (const j of jobs) {
    const slug = j.slug;
    const url = `/careers/${slug}`;

    const sectionsText = j.sections
      .map((sec) => {
        let secContent = `\n${sec.heading}:`;
        if (sec.paragraphs) secContent += '\n' + sec.paragraphs.join('\n');
        if (sec.bullets) secContent += '\n' + sec.bullets.map((b) => `• ${b}`).join('\n');
        return secContent;
      })
      .join('\n');

    chunks.push({
      id: `job-${slug}`,
      type: 'job',
      title: j.title,
      section: 'Role Details & Requirements',
      url,
      slug,
      text: `<job>: ${j.title} > Role Details & Requirements\nDepartment: ${j.department}\nLocation: ${j.location}\nEmployment Type: ${j.employmentType}\nExperience: ${j.experience || 'Not specified'}\nPublished: ${j.publishedOn}\nSummary: ${j.summary}${sectionsText}\nApply Link: /careers/${j.slug}`,
    });
  }

  // 5. INDUSTRIES (12 Industries)
  for (const ind of industries) {
    const slug = ind.slug;
    const url = ind.url;

    chunks.push({
      id: `industry-${slug}`,
      type: 'industry',
      title: ind.title,
      section: 'Industry Transformation Solutions',
      url,
      slug,
      text: `<industry>: ${ind.title} > Industry Transformation Solutions\nOverview: ${ind.description}\nAxia Kairos delivers sector-specific enterprise modernization, SAP integration, data analytics, and digital solutions tailored to ${ind.title}.`,
    });
  }

  // 6. PRODUCTS (5 Products)
  for (const prod of products) {
    const slug = prod.slug;
    const url = prod.url;

    chunks.push({
      id: `product-${slug}`,
      type: 'product',
      title: prod.title,
      section: 'Enterprise Digital Product Suite',
      url,
      slug,
      text: `<product>: ${prod.title} > Enterprise Digital Product Suite\nDescription: ${prod.description}\nPart of Axia Kairos proprietary enterprise product suite powered by SAP, cloud modernization, and automation.`,
    });
  }

  // 7. APPROACH CHUNKS
  chunks.push({
    id: 'approach-framework',
    type: 'approach',
    title: 'Our Consulting Framework',
    section: 'Framework Pillars',
    url: '/our-approach',
    slug: 'our-approach',
    text: `<approach>: Our Approach > Consulting Framework Pillars\n${approachData.frameworkPillars
      .map((p) => `• ${p.title}: ${p.description}`)
      .join('\n')}`,
  });

  chunks.push({
    id: 'approach-methodology',
    type: 'approach',
    title: 'The Axia Kairos Way Methodology',
    section: '5-Step Delivery Methodology',
    url: '/our-approach',
    slug: 'our-approach',
    text: `<approach>: Our Approach > 5-Step Delivery Methodology\n${approachData.methodologySteps
      .map((m) => `Step ${m.stepNumber} - ${m.title}: ${m.description}\n  ${m.points.join('\n  ')}`)
      .join('\n')}`,
  });

  chunks.push({
    id: 'approach-delivery-models',
    type: 'approach',
    title: 'Delivery Models',
    section: 'Onsite, Offshore, Hybrid & Co-Managed Engagements',
    url: '/our-approach',
    slug: 'our-approach',
    text: `<approach>: Our Approach > Delivery Models\n${approachData.deliveryModels
      .map((d) => `• ${d.title}: ${d.description}`)
      .join('\n')}`,
  });

  // 8. ABOUT US CHUNKS
  chunks.push({
    id: 'about-overview',
    type: 'about',
    title: 'About Axia Kairos',
    section: 'Company Overview & Global Footprint',
    url: '/about',
    slug: 'about',
    text: `<about>: About Axia Kairos > Company Overview & Global Footprint\n${aboutData.overview}\nLocations: ${aboutData.locations.join(
      ', '
    )}\nHeadquarters: ${aboutData.headquarters}\nFocus Areas:\n${aboutData.focusAreas
      .map((f) => `• ${f}`)
      .join('\n')}`,
  });

  chunks.push({
    id: 'about-mission-vision-values',
    type: 'about',
    title: 'Mission, Vision & Core Values',
    section: 'Core Purpose & Principles',
    url: '/about',
    slug: 'about',
    text: `<about>: About Axia Kairos > Mission, Vision & Core Values\nMission: ${aboutData.mission}\nVision: ${aboutData.vision}\nValues:\n${aboutData.values
      .map((v) => `• ${v.name}: ${v.description}`)
      .join('\n')}`,
  });

  // 9. CONTACT & OFFICES CHUNK
  chunks.push({
    id: 'contact-offices-emails',
    type: 'contact',
    title: 'Offices & Contact Information',
    section: 'Global Locations, Inquiries & Support',
    url: '/contact',
    slug: 'contact',
    text: `<contact>: Contact Axia Kairos > Global Locations, Inquiries & Support\nOfficial Emails:\n• General: ${contactData.emails.general}\n• Sales & Engagements: ${contactData.emails.sales}\n• Client Support: ${contactData.emails.support}\n• Careers: ${contactData.emails.careers}\nGeneral Phone: ${contactData.phones.general}\nGlobal Offices: ${contactData.offices
      .map((o) => `${o.country} (${o.region}) - ${o.note}`)
      .join('\n')}\nNote on Street Addresses: ${contactData.noteOnStreetAddresses}`,
  });

  // 10. LEGAL CHUNKS
  chunks.push({
    id: 'legal-privacy-policy',
    type: 'legal',
    title: 'Privacy Policy',
    section: 'Data Protection & Privacy Notice',
    url: '/privacy-policy',
    slug: 'privacy-policy',
    text: `<legal>: Privacy Policy > Data Protection & Privacy Notice\n${legalData.privacyPolicy.summary}`,
  });

  chunks.push({
    id: 'legal-terms-conditions',
    type: 'legal',
    title: 'Terms and Conditions',
    section: 'Website Terms of Use & IP Notice',
    url: '/terms-and-conditions',
    slug: 'terms-and-conditions',
    text: `<legal>: Terms and Conditions > Website Terms of Use & IP Notice\n${legalData.termsAndConditions.summary}`,
  });

  // 11. CURATED FAQ CHUNKS
  const faqCandidates = [
    path.resolve(process.cwd(), 'knowledge', 'faq.json'),
    path.resolve(process.cwd(), 'backend', 'knowledge', 'faq.json'),
    path.resolve(process.cwd(), 'server', 'knowledge', 'faq.json'),
  ];
  const faqFilePath = faqCandidates.find((c) => fs.existsSync(c)) || faqCandidates[0];

  if (fs.existsSync(faqFilePath)) {
    try {
      const rawFaqs = JSON.parse(fs.readFileSync(faqFilePath, 'utf8'));
      if (Array.isArray(rawFaqs)) {
        for (const item of rawFaqs) {
          chunks.push({
            id: item.id || `faq-${chunks.length}`,
            type: 'faq',
            title: item.question,
            section: item.title || 'Curated Corporate FAQ',
            url: item.url || '/about',
            slug: item.category || 'faq',
            text: `<faq>: Question: ${item.question}\nApproved Answer: ${item.answer}\nContext: Axia Kairos verified executive knowledge.`,
          });
        }
        console.log(`📑 Loaded ${rawFaqs.length} curated FAQ chunks.`);
      }
    } catch (faqErr) {
      console.warn('Warning reading FAQ file:', faqErr);
    }
  }

  // Build Structured Registry
  const structured = {
    services: servicesData.map((s) => ({
      slug: s.slug,
      title: s.title,
      shortDescription: s.shortDescription,
      route: `/services/${s.slug}`,
      image: `/assets/services/${s.slug}.png`,
    })),
    caseStudies: caseStudies.map((cs) => ({
      slug: cs.slug,
      title: cs.title,
      industry: cs.industry,
      date: cs.publishedOn,
      summary: cs.summary,
      image: cs.image,
      metrics: cs.results?.items?.filter((it) => it.metric).map((it) => `${it.metric} ${it.title}`) || [],
      url: `/case-studies/${cs.slug}`,
    })),
    industries: industries.map((i) => ({
      slug: i.slug,
      title: i.title,
      description: i.description,
      url: i.url,
    })),
    blogs: blogs.map((b) => ({
      slug: b.slug,
      title: b.title,
      date: b.formattedDate || b.date,
      readingTime: `${b.readingTimeMinutes} min read`,
      summary: b.excerpt,
      url: `/blogs/${b.slug}`,
      coverImage: b.coverImage,
    })),
    jobs: jobs.map((j) => ({
      slug: j.slug,
      title: j.title,
      department: j.department,
      location: j.location,
      employmentType: j.employmentType,
      experience: j.experience,
      summary: j.summary,
      url: `/careers/${j.slug}`,
    })),
    products: products.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      url: p.url,
    })),
    about: aboutData,
    approach: approachData,
    contact: contactData,
    legal: legalData,
  };

  const kb: KnowledgeBase = {
    generatedAt: new Date().toISOString(),
    totalChunks: chunks.length,
    chunks,
    structured,
  };

  const outCandidates = [
    path.resolve(process.cwd(), 'knowledge.json'),
    path.resolve(process.cwd(), 'backend', 'knowledge.json'),
  ];
  const outputPath = fs.existsSync(path.resolve(process.cwd(), 'chat-engine.ts'))
    ? path.resolve(process.cwd(), 'knowledge.json')
    : (outCandidates.find((c) => fs.existsSync(c)) || outCandidates[0]);

  fs.writeFileSync(outputPath, JSON.stringify(kb, null, 2), 'utf8');

  console.log(`✅ Knowledge Base built successfully!`);
  console.log(`📦 Total structured chunks indexed: ${chunks.length}`);
  console.log(`💾 Saved to: ${outputPath}`);
}

main().catch((err) => {
  console.error('❌ Failed to build knowledge base:', err);
  process.exit(1);
});
