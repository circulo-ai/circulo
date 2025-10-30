import { Icon } from "@/types/icon";
import {
  Code,
  Cpu,
  DollarSign,
  Globe,
  Layers,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

const tags = ["General", "Pricing", "Dashboard", "API"] as const;

interface Faq {
  question: string;
  answer: string;
  index: number;
  icon: Icon;
  tags: (typeof tags)[number][];
}

export const faqs: Faq[] = [
  {
    question: "What is Circulo?",
    answer:
      "Circulo is a conversational platform where multiple AI personalities sit around a virtual round table and take turns responding to your prompts.",
    index: 1,
    icon: Users,
    tags: ["General"],
  },
  {
    question: "How does Circulo differ from a normal chatbot?",
    answer:
      "Unlike a single-response AI, Circulo simulates group discussion. Each AI has a unique voice and reasoning style, creating multi-angle insights for every topic.",
    index: 2,
    icon: MessageSquare,
    tags: ["General"],
  },
  {
    question: "Can I customize the AIs that join my table?",
    answer:
      "Yes. You can select, rename, and fine-tune each AI’s tone, domain expertise, and visual identity within your dashboard.",
    index: 3,
    icon: Settings,
    tags: ["Dashboard"],
  },
  {
    question: "How do pricing plans work?",
    answer:
      "Circulo offers usage-based tiers. You pay only for active AI sessions or token usage. Team and enterprise plans include additional API access and analytics.",
    index: 4,
    icon: DollarSign,
    tags: ["Pricing"],
  },
  {
    question: "Does Circulo provide an API?",
    answer:
      "Yes. Developers can use the Circulo API to embed multi-agent conversations in their own products or automate decision-making workflows.",
    index: 5,
    icon: Code,
    tags: ["API"],
  },
  {
    question: "Can Circulo run offline or locally?",
    answer:
      "Not yet. Circulo currently runs in the cloud to support real-time AI orchestration and streaming dialogue. Local execution is planned for future versions.",
    index: 6,
    icon: Cpu,
    tags: ["General", "API"],
  },
  {
    question: "Is my data private and secure?",
    answer:
      "All session data is encrypted in transit and at rest. Circulo never shares user prompts or responses without explicit consent.",
    index: 7,
    icon: Shield,
    tags: ["General"],
  },
  {
    question: "Can I invite other users to join a conversation?",
    answer:
      "Yes. Multi-user mode lets several participants join the same round table, enabling collaborative brainstorming or design critiques.",
    index: 8,
    icon: Globe,
    tags: ["Dashboard"],
  },
  {
    question: "How do AI personalities interact with each other?",
    answer:
      "Each AI listens to prior turns, critiques or builds upon others’ points, and generates structured dialogue for coherent group reasoning.",
    index: 9,
    icon: Layers,
    tags: ["General"],
  },
  {
    question: "What future features are planned?",
    answer:
      "Upcoming releases include visual avatars, voice output, real-time translation, and adaptive learning so AIs evolve with your usage.",
    index: 10,
    icon: Sparkles,
    tags: ["General", "Dashboard"],
  },
];
