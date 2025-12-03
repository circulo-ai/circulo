/**
 * Generate static structured data for SEO
 */
export function generateStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Circulo",
    description:
      "Circulo is an open-source AI agent workflow builder. Developers at trail-blazing startups to Fortune 500 companies deploy agentic workflows on the Sim platform.  30,000+ developers are already using Sim to build and deploy AI agent workflows. Sim lets developers integrate with 100+ apps to streamline workflows with AI agents. Sim is SOC2 and HIPAA compliant, ensuring enterprise-level security.",
    url: "https://circulo-ai.com",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      category: "SaaS",
    },
    creator: {
      "@type": "Organization",
      name: "Circulo",
      url: "https://circulo-ai.com",
    },
    featureList: [
      "Visual AI Agent Builder",
      "Workflow Canvas Interface",
      "AI Agent Automation",
      "Custom AI Workflows",
    ],
  };
}
