export const products = [
    {
        "slug": "intelligent-e-invoicing-compliance-module",
        "title": "Intelligent e-Invoicing Compliance Module",
        "description": "A secure, automated e-invoicing solution integrated with SAP for GST e-invoice generation, IRP validation, and error-free statutory reporting.",
        "url": "/products/intelligent-e-invoicing-compliance-module"
    },
    {
        "slug": "sap-process-automation-change-management-suite",
        "title": "SAP Process Automation & Change Management Suite",
        "description": "A comprehensive automation suite for SAP workflow orchestration, approvals, configuration tracking, and transport governance.",
        "url": "/products/sap-process-automation-change-management-suite"
    },
    {
        "slug": "diagnostics-erp-laboratory-management-platform",
        "title": "Diagnostics ERP & Laboratory Management Platform",
        "description": "A complete ERP for diagnostic and pathology labs covering test catalogs, billing, doctors, results, patient reports, and lab workflows.",
        "url": "/products/diagnostics-erp-laboratory-management-platform"
    },
    {
        "slug": "enterprise-hrms-talent-lifecycle-platform",
        "title": "Enterprise HRMS & Talent Lifecycle Platform",
        "description": "A modern HR suite managing recruitment, onboarding, attendance, payroll, evaluations, and employee lifecycle processes in one portal.",
        "url": "/products/enterprise-hrms-talent-lifecycle-platform"
    },
    {
        "slug": "audiology-business-management-platform",
        "title": "Audiology Business Management Platform",
        "description": "An Odoo-based platform combining CRM, HR appraisal, workflows, offboarding, document management, and advanced reporting for enterprise operations.",
        "url": "/products/audiology-business-management-platform"
    }
];
export const productsBySlug = Object.fromEntries(products.map(p => [p.slug, p]));
export function getProductBySlug(slug) {
    return productsBySlug[slug];
}
