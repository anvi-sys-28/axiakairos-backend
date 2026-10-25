// Verbatim data from axiakairos.com/our-approach
export interface FrameworkPillar {
  title: string;
  description: string;
}

export interface MethodologyStep {
  stepNumber: number;
  title: string;
  description: string;
  points: string[];
}

export interface DeliveryModel {
  title: string;
  description: string;
}

export const approachData = {
  title: "Our Approach",
  subtitle: "Consulting-led, outcome-driven transformation for modern enterprises.",
  frameworkPillars: [
    {
      title: "Strategy Alignment",
      description: "Aligning digital initiatives with core business objectives, growth priorities, and shareholder value.",
    },
    {
      title: "People Enablement",
      description: "Empowering talent through change leadership, upskilling, and collaborative agile working models.",
    },
    {
      title: "Process Optimization",
      description: "Re-engineering workflows with lean principles, end-to-end automation, and data governance.",
    },
    {
      title: "Technology Enablement",
      description: "Modernizing IT architectures with scalable cloud platforms, SAP S/4HANA, and intelligent data systems.",
    },
  ] as FrameworkPillar[],
  methodologySteps: [
    {
      stepNumber: 1,
      title: "Discover & Assess",
      description: "Understand client challenges, goals, and digital maturity.",
      points: [
        "Understand client challenges, goals, and pain points.",
        "Conduct industry benchmarking and digital maturity assessments.",
        "Identify gaps between current capabilities and future aspirations.",
      ],
    },
    {
      stepNumber: 2,
      title: "Design & Strategize",
      description: "Develop transformation roadmaps tailored to business vision.",
      points: [
        "Develop transformation roadmaps tailored to business vision.",
        "Build operating models, governance structures, and KPIs.",
        "Architect target state technology and data blueprints.",
      ],
    },
    {
      stepNumber: 3,
      title: "Implement & Integrate",
      description: "Configure and implement enterprise solutions across platforms.",
      points: [
        "Configure and implement enterprise solutions (SAP, Cloud, Data).",
        "Ensure seamless integration across legacy and new platforms.",
        "Manage rigorous testing, data migration, and technical readiness.",
      ],
    },
    {
      stepNumber: 4,
      title: "Adopt & Enable",
      description: "Facilitate organizational change management and user adoption.",
      points: [
        "Facilitate organizational change management and user training.",
        "Drive user adoption with clear documentation and hands-on coaching.",
        "Align leadership and operational teams around new operating procedures.",
      ],
    },
    {
      stepNumber: 5,
      title: "Measure & Optimize",
      description: "Track performance against KPIs and business value realization.",
      points: [
        "Track performance against KPIs and value realization metrics.",
        "Provide continuous monitoring, governance, and enhancement support.",
        "Refine processes and scale solutions across business units.",
      ],
    },
  ] as MethodologyStep[],
  deliveryModels: [
    {
      title: "Onsite Consulting",
      description: "Embedded senior advisors working shoulder-to-shoulder with executive leadership and operational teams.",
    },
    {
      title: "Nearshore & Offshore Delivery",
      description: "High-velocity delivery centers providing cost-effective engineering, 24/7 support, and rapid execution.",
    },
    {
      title: "Hybrid Engagements",
      description: "Blended onsite strategic governance paired with scalable global delivery teams.",
    },
    {
      title: "Co-Managed Teams",
      description: "Joint client-Axia Kairos squads co-creating solutions and ensuring long-term internal knowledge transfer.",
    },
  ] as DeliveryModel[],
};
