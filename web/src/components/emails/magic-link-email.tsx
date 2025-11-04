import { getBrandConfig } from "@/lib/branding/branding";
import { getEnv } from "@/lib/env";
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { baseStyles } from "./base-styles";
import EmailFooter from "./footer";

interface MagicLinkEmailProps {
  magicLink: string;
  email?: string;
  type?: "sign-in" | "email-verification";
}

const baseUrl = getEnv("NEXT_PUBLIC_APP_URL") || "https://circulo.ir";

const getSubjectByType = (type: string, brandName: string) => {
  switch (type) {
    case "sign-in":
      return `Sign in to ${brandName}`;
    case "email-verification":
      return `Verify your email for ${brandName}`;
    default:
      return `Your magic link for ${brandName}`;
  }
};

export const MagicLinkEmail = ({
  magicLink,
  email = "",
  type = "sign-in",
}: MagicLinkEmailProps) => {
  const brand = getBrandConfig();

  const getMessage = () => {
    switch (type) {
      case "sign-in":
        return `Click the button below to sign in to your ${brand.name} account.`;
      case "email-verification":
        return `Click the button below to verify your email and complete your ${brand.name} registration.`;
      default:
        return `Click the button below to continue to ${brand.name}.`;
    }
  };

  const getButtonText = () => {
    switch (type) {
      case "sign-in":
        return "Sign in to your account";
      case "email-verification":
        return "Verify email address";
      default:
        return "Continue to Circulo";
    }
  };

  return (
    <Html>
      <Head />
      <Body style={baseStyles.main}>
        <Preview>{getSubjectByType(type, brand.name)}</Preview>
        <Container style={baseStyles.container}>
          <Section style={{ padding: "30px 0", textAlign: "center" }}>
            <Row>
              <Column style={{ textAlign: "center" }}>
                <Img
                  src={
                    brand.logoUrl || `${baseUrl}/logo/reverse/text/medium.png`
                  }
                  width="114"
                  alt={brand.name}
                  style={{
                    margin: "0 auto",
                  }}
                />
              </Column>
            </Row>
          </Section>
          <Section style={baseStyles.sectionsBorders}>
            <Row>
              <Column style={baseStyles.sectionBorder} />
              <Column style={baseStyles.sectionCenter} />
              <Column style={baseStyles.sectionBorder} />
            </Row>
          </Section>
          <Section style={baseStyles.content}>
            <Text style={baseStyles.paragraph}>
              {type === "email-verification"
                ? "Welcome to " + brand.name + "!"
                : "Hello,"}
            </Text>
            <Text style={baseStyles.paragraph}>{getMessage()}</Text>
            <Link href={magicLink} style={{ textDecoration: "none" }}>
              <Text style={baseStyles.button}>{getButtonText()}</Text>
            </Link>
            <Text style={baseStyles.paragraph}>
              This link will expire in 15 minutes and can only be used once.
            </Text>
            <Text style={baseStyles.paragraph}>
              If you didn't request this link, you can safely ignore this email.
            </Text>
            <Text style={baseStyles.paragraph}>
              Best regards,
              <br />
              The Circulo Team
            </Text>
          </Section>
        </Container>

        <EmailFooter baseUrl={baseUrl} />
      </Body>
    </Html>
  );
};

export default MagicLinkEmail;
