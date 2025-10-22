import {
  MagicLinkEmail,
  OTPVerificationEmail,
  PlanWelcomeEmail,
  ResetPasswordEmail,
} from "@/components/emails";
import { getBrandConfig } from "@/lib/branding/branding";
import { render } from "@react-email/components";

export async function renderOTPEmail(
  otp: string,
  email: string,
  type:
    | "sign-in"
    | "email-verification"
    | "forget-password" = "email-verification",
  chatTitle?: string,
): Promise<string> {
  return await render(OTPVerificationEmail({ otp, email, type, chatTitle }));
}

export async function renderPasswordResetEmail(
  username: string,
  resetLink: string,
): Promise<string> {
  return await render(
    ResetPasswordEmail({
      username,
      resetLink: resetLink,
      updatedDate: new Date(),
    }),
  );
}

export async function renderMagicLinkEmail(
  magicLink: string,
  email: string,
  type: "sign-in" | "email-verification" = "sign-in",
): Promise<string> {
  return await render(MagicLinkEmail({ magicLink, email, type }));
}

interface WorkspaceInvitation {
  workspaceId: string;
  workspaceName: string;
  permission: "admin" | "write" | "read";
}

export function getEmailSubject(
  type:
    | "sign-in"
    | "email-verification"
    | "forget-password"
    | "reset-password"
    | "invitation"
    | "batch-invitation"
    | "help-confirmation"
    | "enterprise-subscription"
    | "usage-threshold"
    | "plan-welcome-pro"
    | "plan-welcome-team",
): string {
  const brandName = getBrandConfig().name;

  switch (type) {
    case "sign-in":
      return `Sign in to ${brandName}`;
    case "email-verification":
      return `Verify your email for ${brandName}`;
    case "forget-password":
      return `Reset your ${brandName} password`;
    case "reset-password":
      return `Reset your ${brandName} password`;
    case "invitation":
      return `You've been invited to join a team on ${brandName}`;
    case "batch-invitation":
      return `You've been invited to join a team and workspaces on ${brandName}`;
    case "help-confirmation":
      return "Your request has been received";
    case "enterprise-subscription":
      return `Your Enterprise Plan is now active on ${brandName}`;
    case "usage-threshold":
      return `You're nearing your monthly budget on ${brandName}`;
    case "plan-welcome-pro":
      return `Your Pro plan is now active on ${brandName}`;
    case "plan-welcome-team":
      return `Your Team plan is now active on ${brandName}`;
    default:
      return brandName;
  }
}

export async function renderPlanWelcomeEmail(params: {
  planName: "Pro" | "Team";
  userName?: string;
  loginLink?: string;
}): Promise<string> {
  return await render(
    PlanWelcomeEmail({
      planName: params.planName,
      userName: params.userName,
      loginLink: params.loginLink,
      createdDate: new Date(),
    }),
  );
}
