// Generated from axiakairos.com/careers
export interface JobSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface Job {
  slug: string;
  title: string;
  department: string;
  location: string;
  employmentType: string;
  publishedOn: string; // ISO date string
  summary: string;
  experience?: string;
  validThrough?: string;
  status: 'open' | 'closed';
  sections: JobSection[];
}

export interface JobApplicationPayload {
  jobSlug: string;
  jobTitle: string;
  fullName: string;
  email: string;
  countryCode: string;
  phone: string;
  currentLocation: string;
  yearsOfExperience: string;
  linkedInUrl?: string;
  shortNote?: string;
  resumeFile: File;
  consent: boolean;
}

export const DEPARTMENTS = [
  'All Departments',
  'SAP Consultants',
  'Sales & Marketing',
  'Finance & Operations',
  'HR',
  'Consulting & Solutions',
  'Early Talent',
] as const;

export type Department = typeof DEPARTMENTS[number];

export const careersLandingData = {
  seo: {
    title: "Careers at Axia Kairos | Join a Global Team of Innovators & Tech Leaders",
    description: "Build your future with Axia Kairos. Work with global teams across Canada, USA & India. Explore roles in SAP, Cloud, Data, AI & Digital Transformation. Apply today.",
    canonicalUrl: "https://axiakairos.com/careers",
  },
  hero: {
    badge: "CAREERS AT AXIA KAIROS",
    titleLine1: "Build Your Future",
    titleAccent: "With Us",
    description: "Join a team of innovators, problem-solvers, and tech leaders shaping the future of enterprise transformation.",
    ctaLabel: "View Current Openings",
    ctaTarget: "#open-positions",
  },
  values: {
    badge: "OUR CORE CULTURE",
    title: "Our Values",
    description: "At our core, we believe in fostering an environment where talent thrives and innovation flourishes. Our values guide everything we do.",
    cards: [
      {
        id: "excellence",
        title: "Excellence",
        description: "We strive for excellence across every engagement — from strategy to execution. At Axia Kairos, excellence isn’t a goal but a standard, driven by deep expertise, precise methodologies, and a commitment to delivering solutions that create real business value.",
      },
      {
        id: "collaboration",
        title: "Collaboration",
        description: "True transformation begins with collaboration. We align goals, share insights, and co-create solutions that deliver results—building trust, clarity, and a unified purpose to navigate complex challenges together.",
      },
      {
        id: "innovation",
        title: "Innovation",
        description: "Innovation is core to our philosophy. We leverage emerging technologies and creative thinking to deliver future-ready solutions. With curiosity and technical excellence, we help businesses adapt faster and stay ahead in a rapidly changing digital landscape.",
      },
      {
        id: "growth",
        title: "Growth",
        description: "Growth is our shared destination. We enable sustainable, technology-led growth that boosts agility and competitiveness, helping organizations unlock new opportunities and thrive in the digital age.",
      },
    ],
  },
  campusEngagement: {
    badge: "ACADEMIC PARTNERSHIPS",
    title: "Partner With Us for Campus Engagement",
    paragraphs: [
      "Axia Kairos actively collaborates with colleges and universities to identify and nurture future talent. We partner with academic institutions for campus hiring drives, internship programs, workshops, and industry-focused initiatives that bridge the gap between education and real-world business needs.",
      "Our goal is to create meaningful partnerships that empower students with the skills, exposure, and opportunities required to succeed in today’s evolving technology landscape.",
    ],
    ctaLabel: "Contact Us",
    ctaHref: "/contact",
  },
};

export const jobs: Job[] = [
  {
    "slug": "sap-consultants",
    "title": "SAP Consultants",
    "department": "SAP Consultants",
    "location": "India",
    "employmentType": "Full Time",
    "publishedOn": "2025-12-01T07:15:00.000Z",
    "summary": "We are hiring SAP Consultants across multiple modules to support project implementations, enhancements, and ongoing support activities. The role requires strong functional knowledge, hands-on configuration, and the ability to work closely with cross-functional teams.",
    "experience": "3–6 Years",
    "validThrough": "2025-12-31",
    "status": "open",
    "sections": [
      {
        "heading": "Job Description",
        "paragraphs": [
          "We are hiring SAP Consultants across multiple modules to support project implementations, enhancements, and ongoing support activities. The role requires strong functional knowledge, hands-on configuration, and the ability to work closely with cross-functional teams."
        ]
      },
      {
        "heading": "Responsibilities",
        "bullets": [
          "Configure, test, and deploy SAP module functionalities as per project needs",
          "Collaborate with business users to gather and refine requirements",
          "Work on integrations, data migration, and system enhancements",
          "Provide L2/L3 functional support for SAP environments",
          "Prepare documentation, test scripts, and end-user training materials"
        ]
      },
      {
        "heading": "Role Details & Requirements",
        "bullets": [
          "Relevant Experience: 3–6 Years",
          "Employment Type: Full Time",
          "Primary Location: India"
        ]
      },
      {
        "heading": "Notice Period",
        "bullets": [
          "15 to 30 Days preferred"
        ]
      }
    ]
  },
  {
    "slug": "business-development-manager-sap-india-and-canada",
    "title": "Business Development Manager",
    "department": "Sales & Marketing",
    "location": "India / Canada",
    "employmentType": "Full Time",
    "publishedOn": "2025-12-01T07:00:00.000Z",
    "summary": "We are looking for an experienced SAP Business Development Manager to drive enterprise sales, build strategic customer relationships, and expand our footprint across India and Canada. The role involves opportunity identification, proposal development, and supporting end-to-end deal closures in the SAP services landscape.",
    "experience": "5+ Years",
    "validThrough": "2025-12-31",
    "status": "open",
    "sections": [
      {
        "heading": "Job Description",
        "paragraphs": [
          "We are looking for an experienced SAP Business Development Manager to drive enterprise sales, build strategic customer relationships, and expand our footprint across India and Canada. The role involves opportunity identification, proposal development, and supporting end-to-end deal closures in the SAP services landscape."
        ]
      },
      {
        "heading": "Responsibilities",
        "bullets": [
          "Identify, qualify, and pursue SAP project opportunities across target markets",
          "Build and maintain strong client relationships with CXOs & decision makers",
          "Develop proposals, pitch decks, and SOWs in collaboration with delivery teams",
          "Drive revenue targets through effective pipeline management",
          "Support regional expansion initiatives for SAP consulting services"
        ]
      },
      {
        "heading": "Role Details & Requirements",
        "bullets": [
          "Relevant Experience: 5+ Years",
          "Employment Type: Full Time",
          "Primary Location: India / Canada"
        ]
      },
      {
        "heading": "Notice Period",
        "bullets": [
          "15 to 30 Days preferred"
        ]
      }
    ]
  },
  {
    "slug": "finance-controller-india",
    "title": "Finance Controller (India)",
    "department": "Finance & Operations",
    "location": "India",
    "employmentType": "Full Time",
    "publishedOn": "2025-12-01T07:30:00.000Z",
    "summary": "Seeking a Finance Controller to lead financial planning, compliance, budgeting, and reporting. The role involves owning all finance operations, ensuring statutory adherence, and supporting leadership with accurate financial insights.",
    "experience": "7+ Years",
    "validThrough": "2025-12-31",
    "status": "open",
    "sections": [
      {
        "heading": "Job Description",
        "paragraphs": [
          "Seeking a Finance Controller to lead financial planning, compliance, budgeting, and reporting. The role involves owning all finance operations, ensuring statutory adherence, and supporting leadership with accurate financial insights."
        ]
      },
      {
        "heading": "Responsibilities",
        "bullets": [
          "Oversee accounting, budgeting, and monthly financial reporting",
          "Ensure compliance with Indian statutory and tax regulations",
          "Manage audits, payroll, and financial controls",
          "Monitor cash flow, forecasts, and operational expenses",
          "Support management with financial analysis for decision-making"
        ]
      },
      {
        "heading": "Role Details & Requirements",
        "bullets": [
          "Relevant Experience: 7+ Years",
          "Employment Type: Full Time",
          "Primary Location: India"
        ]
      },
      {
        "heading": "Notice Period",
        "bullets": [
          "15 to 30 Days preferred"
        ]
      }
    ]
  },
  {
    "slug": "hr-operations-executive",
    "title": "HR Operations Executive",
    "department": "HR",
    "location": "India",
    "employmentType": "Full Time",
    "publishedOn": "2025-12-01T08:30:00.000Z",
    "summary": "We are looking for an HR Operations Executive to manage onboarding, documentation, HR systems, and daily employee support activities. The role requires strong coordination skills and attention to detail.",
    "experience": "1–3 Years",
    "validThrough": "2025-12-31",
    "status": "open",
    "sections": [
      {
        "heading": "Job Description",
        "paragraphs": [
          "We are looking for an HR Operations Executive to manage onboarding, documentation, HR systems, and daily employee support activities. The role requires strong coordination skills and attention to detail."
        ]
      },
      {
        "heading": "Responsibilities",
        "bullets": [
          "Handle onboarding, documentation, and employee lifecycle activities",
          "Maintain HRMS records and track attendance, leaves, and compliance",
          "Support recruitment coordination and interview scheduling",
          "Assist in payroll inputs and policy administration",
          "Provide day-to-day HR support to employees and teams"
        ]
      },
      {
        "heading": "Role Details & Requirements",
        "bullets": [
          "Relevant Experience: 1–3 Years",
          "Employment Type: Full Time",
          "Primary Location: India"
        ]
      },
      {
        "heading": "Notice Period",
        "bullets": [
          "15 to 30 Days preferred"
        ]
      }
    ]
  },
  {
    "slug": "senior-sap-consultants",
    "title": "SAP BW/4HANA & SAC Consultant / Senior Consultant",
    "department": "SAP Consultants",
    "location": "India",
    "employmentType": "Full Time",
    "publishedOn": "2026-02-19T09:30:00.000Z",
    "summary": "We are hiring experienced SAP BW/4HANA Consultants with SAP Analytics Cloud (SAC) expertise to support data platform development, analytics reporting, and enterprise SAP implementations.",
    "experience": "3-8 Years",
    "validThrough": "2026-12-31",
    "status": "open",
    "sections": [
      {
        "heading": "Job Description",
        "paragraphs": [
          "We are hiring experienced SAP BW/4HANA Consultants with SAP Analytics Cloud (SAC) expertise to support data platform development, analytics reporting, and enterprise SAP implementations."
        ]
      },
      {
        "heading": "Responsibilities",
        "bullets": [
          "Design and develop BW/4HANA data models including ADSOs, Composite Providers, Open ODS Views, and InfoObjects",
          "Build and maintain Transformations and DTPs for efficient data processing",
          "Implement data extraction from SAP S/4HANA, ECC, and non-SAP sources such as flat files",
          "Perform data modeling using LSA++ architecture standards",
          "Optimize data loads, system performance, and BW queries",
          "Develop BW Queries for consumption in SAP Analytics Cloud (SAC)",
          "Create SAC dashboards and reports based on BW/4HANA or Datasphere models",
          "Collaborate with business users and stakeholders to understand reporting requirements",
          "Support system enhancements, troubleshooting, and analytics improvements",
          "Prepare technical documentation and support knowledge transfer when required"
        ]
      },
      {
        "heading": "Role Details & Requirements",
        "bullets": [
          "Relevant Experience: 3-8 Years",
          "Employment Type: Full Time",
          "Primary Location: India"
        ]
      },
      {
        "heading": "Notice Period",
        "bullets": [
          "Immediate to 30 Days preferred"
        ]
      }
    ]
  }
];

export const jobsBySlug: Record<string, Job> = Object.fromEntries(
  jobs.map((j) => [j.slug, j])
);

export function getJobBySlug(slug: string): Job | undefined {
  return jobsBySlug[slug];
}

export function getJobsByDepartment(dept: string): Job[] {
  if (!dept || dept === 'All Departments') {
    return jobs.filter((j) => j.status === 'open');
  }
  return jobs.filter((j) => j.status === 'open' && j.department.toLowerCase() === dept.toLowerCase());
}

export function getSimilarJobs(currentSlug: string, count: number = 3): Job[] {
  return jobs
    .filter((j) => j.slug !== currentSlug && j.status === 'open')
    .slice(0, count);
}

// Client application submission helper
// TODO: Connect production application endpoint via VITE_APPLY_ENDPOINT in .env
export async function submitApplication(payload: JobApplicationPayload): Promise<{ success: boolean; message: string }> {
  const endpoint = (import.meta as any)?.env?.VITE_APPLY_ENDPOINT || process.env.VITE_APPLY_ENDPOINT;

  const formData = new FormData();
  formData.append('jobSlug', payload.jobSlug);
  formData.append('jobTitle', payload.jobTitle);
  formData.append('fullName', payload.fullName);
  formData.append('email', payload.email);
  formData.append('countryCode', payload.countryCode);
  formData.append('phone', payload.phone);
  formData.append('currentLocation', payload.currentLocation);
  formData.append('yearsOfExperience', payload.yearsOfExperience);
  if (payload.linkedInUrl) {
    formData.append('linkedInUrl', payload.linkedInUrl);
  }
  if (payload.shortNote) {
    formData.append('shortNote', payload.shortNote);
  }
  formData.append('consent', String(payload.consent));
  formData.append('resume', payload.resumeFile, payload.resumeFile.name);

  if (endpoint) {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(errorText || `Server returned error status ${res.status}`);
    }
    return {
      success: true,
      message: 'Application submitted successfully! Our talent acquisition team will review your qualifications.',
    };
  }

  // Demo fallback when VITE_APPLY_ENDPOINT is not yet set
  await new Promise((resolve) => setTimeout(resolve, 950));
  console.log('[Axia Kairos Job Application Submitted (multipart/form-data)]:', {
    jobSlug: payload.jobSlug,
    jobTitle: payload.jobTitle,
    fullName: payload.fullName,
    email: payload.email,
    phone: `${payload.countryCode} ${payload.phone}`,
    currentLocation: payload.currentLocation,
    yearsOfExperience: payload.yearsOfExperience,
    linkedInUrl: payload.linkedInUrl,
    resumeName: payload.resumeFile.name,
    resumeSize: payload.resumeFile.size,
  });

  return {
    success: true,
    message: 'Application received! Our recruiting team will review your profile and follow up via email. (Demo mode: set VITE_APPLY_ENDPOINT in .env to connect live backend)',
  };
}
