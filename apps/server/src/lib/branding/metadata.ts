/**
 * Generate static structured data for SEO
 */
export function generateStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Circulo",
    description:
      "Circulo is a multi-tenant AI workspace where teams combine specialized AI agents into conversations, orchestrated workflows, and shared outcomes.",
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
      "Shared AI workspace",
      "Multi-agent conversations",
      "Orchestrated AI workflows",
      "Team collaboration",
    ],
  };
}
