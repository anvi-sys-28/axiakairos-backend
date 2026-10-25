// Verbatim data from axiakairos.com/industries
export interface Industry {
  id: string;
  slug: string;
  title: string;
  description: string;
  url: string;
}

export const industries: Industry[] = [
  {
    "id": "oil-and-gas",
    "slug": "oil-and-gas",
    "title": "Oil & Gas",
    "description": "Modernize operations and safety with integrated analytics, asset monitoring, and SAP-driven process automation.",
    "url": "/industries/oil-and-gas"
  },
  {
    "id": "e-commerce-and-retail",
    "slug": "e-commerce-and-retail",
    "title": "E-commerce & Retail",
    "description": "Personalize customer journeys and optimize supply chains with real-time analytics, commerce platforms, and cloud modernization.",
    "url": "/industries/e-commerce-and-retail"
  },
  {
    "id": "energy-and-utilities-1",
    "slug": "energy-and-utilities-1",
    "title": "Energy & Utilities",
    "description": "Improve grid reliability and asset utilization through S/4HANA migration, smart metering analytics, and automation.",
    "url": "/industries/energy-and-utilities-1"
  },
  {
    "id": "pharmaceuticals-and-biotechnology",
    "slug": "pharmaceuticals-and-biotechnology",
    "title": "Pharmaceuticals &  Biotechnology",
    "description": "Ensure compliance and quality with traceable data flows, automated testing, and regulated reporting.",
    "url": "/industries/pharmaceuticals-and-biotechnology"
  },
  {
    "id": "e-governance-and-public-sector",
    "slug": "e-governance-and-public-sector",
    "title": "E-Governance &  Public Sector",
    "description": "Drive citizen services and transparency with secure portals, analytics, and process automation for government programs.",
    "url": "/industries/e-governance-and-public-sector"
  },
  {
    "id": "healthcare-and-life-sciences",
    "slug": "healthcare-and-life-sciences",
    "title": "Healthcare & Life Sciences",
    "description": "Improve care delivery and outcomes via integrated clinical data, analytics, and secure cloud platforms.",
    "url": "/industries/healthcare-and-life-sciences"
  },
  {
    "id": "automotive-and-manufacturing",
    "slug": "automotive-and-manufacturing",
    "title": "Automotive & Manufacturing",
    "description": "Optimize production, supply chains, and quality control with IoT data, predictive analytics and automation.",
    "url": "/industries/automotive-and-manufacturing"
  },
  {
    "id": "aviation-and-aerospace",
    "slug": "aviation-and-aerospace",
    "title": "Aviation & Aerospace",
    "description": "Increase operational availability and safety with predictive maintenance, supply-chain resilience, and compliance analytics",
    "url": "/industries/aviation-and-aerospace"
  },
  {
    "id": "telecommunications-and-media",
    "slug": "telecommunications-and-media",
    "title": "Telecommunications  & Media",
    "description": "Scale networks and personalize experiences with cloud modernization, real-time analytics, and automation.",
    "url": "/industries/telecommunications-and-media"
  },
  {
    "id": "banking-financial-services-and-insurance",
    "slug": "banking-financial-services-and-insurance",
    "title": "Banking, Financial  Services, & Insurance",
    "description": "Strengthen finance transformation with S/4HANA migrations, regulatory reporting, and automated reconciliations.",
    "url": "/industries/banking-financial-services-and-insurance"
  },
  {
    "id": "lending-and-fin-tech",
    "slug": "lending-and-fin-tech",
    "title": "Lending & FinTech",
    "description": "Accelerate digital lending and risk decisions with analytics pipelines, automation, and secure cloud platforms.",
    "url": "/industries/lending-and-fin-tech"
  },
  {
    "id": "education-and-learning",
    "slug": "education-and-learning",
    "title": "Education & Learning",
    "description": "Modernize student and learning systems with analytics, cloud platforms, and scalable digital delivery solutions.",
    "url": "/industries/education-and-learning"
  }
];

export const industriesBySlug: Record<string, Industry> = Object.fromEntries(
  industries.map(i => [i.slug, i])
);

export function getIndustryBySlug(slug: string): Industry | undefined {
  return industriesBySlug[slug];
}
