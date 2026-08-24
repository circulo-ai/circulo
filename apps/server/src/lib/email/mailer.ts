import {
  buildUnsubscribeUrl as buildPolicyUnsubscribeUrl,
  isTransactionalEmail,
  normalizeRecipients,
  selectEmailRecipients,
  type EmailType as PolicyEmailType,
  type SuppressibleEmailType,
} from "@/lib/email/policy";
import {
  generateUnsubscribeToken,
  isUnsubscribed,
} from "@/lib/email/unsubscribe";
import { getFromEmailAddress } from "@/lib/email/utils";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logs/console/logger";
import { EmailClient, type EmailMessage } from "@azure/communication-email";
import { Resend } from "resend";

const logger = createLogger("Mailer");

export type EmailType =
  | "transactional"
  | "marketing"
  | "updates"
  | "notifications";

export { normalizeRecipients, selectEmailRecipients } from "@/lib/email/policy";

export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
  disposition?: "attachment" | "inline";
}

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  emailType?: EmailType;
  includeUnsubscribe?: boolean;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

export interface BatchEmailOptions {
  emails: EmailOptions[];
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface BatchSendEmailResult {
  success: boolean;
  message: string;
  results: SendEmailResult[];
  data?: any;
}

export function buildUnsubscribeUrl(
  email: string,
  emailType: SuppressibleEmailType,
  appUrl = env.NEXT_PUBLIC_APP_URL,
): string {
  return buildPolicyUnsubscribeUrl(
    email,
    emailType,
    generateUnsubscribeToken(email, emailType),
    appUrl,
  );
}

interface ProcessedEmailData {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  senderEmail: string;
  headers: Record<string, string>;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

const resendApiKey = env.RESEND_API_KEY;
const azureConnectionString = env.AZURE_ACS_CONNECTION_STRING;

const resend =
  resendApiKey && resendApiKey !== "placeholder" && resendApiKey.trim() !== ""
    ? new Resend(resendApiKey)
    : null;

const azureEmailClient =
  azureConnectionString && azureConnectionString.trim() !== ""
    ? new EmailClient(azureConnectionString)
    : null;

/**
 * Check if any email service is configured and available
 */
export function hasEmailService(): boolean {
  return !!(resend || azureEmailClient);
}

export async function sendEmail(
  options: EmailOptions,
): Promise<SendEmailResult> {
  try {
    const emailType = options.emailType ?? "transactional";
    const recipients = await selectEmailRecipients(
      options.to,
      emailType as PolicyEmailType,
      isUnsubscribed,
    );

    if (recipients.length === 0) {
      logger.info("Email not sent (all recipients unsubscribed):", {
        to: options.to,
        subject: options.subject,
        emailType,
      });
      return {
        success: true,
        message: "Email skipped (all recipients unsubscribed)",
        data: { id: "skipped-unsubscribed", skipped: true },
      };
    }

    const processedData = await processEmailData({
      ...options,
      to: recipients.length === 1 ? recipients[0]! : recipients,
      emailType,
    });

    let providerFailed = false;

    // Try Resend first if configured
    if (resend) {
      try {
        return await sendWithResend(processedData);
      } catch (error) {
        providerFailed = true;
        logger.warn(
          "Resend failed, attempting Azure Communication Services fallback:",
          error,
        );
      }
    }

    // Fallback to Azure Communication Services if configured
    if (azureEmailClient) {
      try {
        return await sendWithAzure(processedData);
      } catch (error) {
        logger.error("Azure Communication Services also failed:", error);
        return {
          success: false,
          message: "Both Resend and Azure Communication Services failed",
        };
      }
    }

    // Never report a delivery success in production when no provider is
    // configured or a configured provider failed. The mock result is only a
    // deliberate local-development fallback for flows that do not need mail.
    if (providerFailed || env.NODE_ENV === "production") {
      logger.error("Email delivery unavailable", {
        providerFailed,
        configured: hasEmailService(),
      });
      return {
        success: false,
        message: providerFailed
          ? "Configured email service failed"
          : "Email service is not configured",
      };
    }

    // No email service configured in local development
    logger.info("Email not sent (no email service configured):", {
      to: options.to,
      subject: options.subject,
      from: processedData.senderEmail,
    });
    return {
      success: true,
      message: "Email logging successful (no email service configured)",
      data: { id: "mock-email-id" },
    };
  } catch (error) {
    logger.error("Error sending email:", error);
    return {
      success: false,
      message: "Failed to send email",
    };
  }
}

async function processEmailData(
  options: EmailOptions,
): Promise<ProcessedEmailData> {
  const {
    to,
    subject,
    html,
    text,
    from,
    emailType = "transactional",
    attachments,
    replyTo,
  } = options;

  const senderEmail = from || getFromEmailAddress();

  const headers: Record<string, string> = {};

  const recipients = normalizeRecipients(to);
  if (
    !isTransactionalEmail(emailType) &&
    options.includeUnsubscribe !== false &&
    recipients.length === 1
  ) {
    headers["List-Unsubscribe"] = `<${buildUnsubscribeUrl(
      recipients[0]!,
      emailType as SuppressibleEmailType,
    )}>`;
  }

  return {
    to,
    subject,
    html,
    text,
    senderEmail,
    headers,
    attachments,
    replyTo,
  };
}

async function sendWithResend(
  data: ProcessedEmailData,
): Promise<SendEmailResult> {
  if (!resend) throw new Error("Resend not configured");

  const fromAddress = data.senderEmail;

  const emailData: any = {
    from: fromAddress,
    to: data.to,
    subject: data.subject,
    headers: Object.keys(data.headers).length > 0 ? data.headers : undefined,
  };

  if (data.html) emailData.html = data.html;
  if (data.text) emailData.text = data.text;
  if (data.replyTo) emailData.replyTo = data.replyTo;
  if (data.attachments) {
    emailData.attachments = data.attachments.map((att) => ({
      filename: att.filename,
      content:
        typeof att.content === "string"
          ? att.content
          : att.content.toString("base64"),
      contentType: att.contentType,
      disposition: att.disposition || "attachment",
    }));
  }

  const { data: responseData, error } = await resend.emails.send(emailData);

  if (error) {
    throw new Error(error.message || "Failed to send email via Resend");
  }

  return {
    success: true,
    message: "Email sent successfully via Resend",
    data: responseData,
  };
}

async function sendWithAzure(
  data: ProcessedEmailData,
): Promise<SendEmailResult> {
  if (!azureEmailClient)
    throw new Error("Azure Communication Services not configured");

  // Azure Communication Services requires at least one content type
  if (!data.html && !data.text) {
    throw new Error(
      "Azure Communication Services requires either HTML or text content",
    );
  }

  // For Azure, use just the email address part (no display name)
  // Azure will use the display name configured in the portal for the sender address
  const senderEmailOnly = data.senderEmail.includes("<")
    ? data.senderEmail.match(/<(.+)>/)?.[1] || data.senderEmail
    : data.senderEmail;

  const message: EmailMessage = {
    senderAddress: senderEmailOnly,
    content: data.html
      ? {
          subject: data.subject,
          html: data.html,
        }
      : {
          subject: data.subject,
          plainText: data.text!,
        },
    recipients: {
      to: Array.isArray(data.to)
        ? data.to.map((email) => ({ address: email }))
        : [{ address: data.to }],
    },
    headers: data.headers,
  };

  const poller = await azureEmailClient.beginSend(message);
  const result = await poller.pollUntilDone();

  if (result.status === "Succeeded") {
    return {
      success: true,
      message: "Email sent successfully via Azure Communication Services",
      data: { id: result.id },
    };
  }
  throw new Error(
    `Azure Communication Services failed with status: ${result.status}`,
  );
}

export async function sendBatchEmails(
  options: BatchEmailOptions,
): Promise<BatchSendEmailResult> {
  try {
    const results: SendEmailResult[] = [];

    // Try Resend first for batch emails if available
    if (resend) {
      try {
        return await sendBatchWithResend(options.emails);
      } catch (error) {
        logger.warn(
          "Resend batch failed, falling back to individual sends:",
          error,
        );
      }
    }

    // Fallback to individual sends (works with both Azure and Resend)
    logger.info("Sending batch emails individually");
    for (const email of options.emails) {
      try {
        const result = await sendEmail(email);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          message:
            error instanceof Error ? error.message : "Failed to send email",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return {
      success: successCount === results.length,
      message:
        successCount === results.length
          ? "All batch emails sent successfully"
          : `${successCount}/${results.length} emails sent successfully`,
      results,
      data: { count: successCount },
    };
  } catch (error) {
    logger.error("Error in batch email sending:", error);
    return {
      success: false,
      message: "Failed to send batch emails",
      results: [],
    };
  }
}

async function sendBatchWithResend(
  emails: EmailOptions[],
): Promise<BatchSendEmailResult> {
  if (!resend) throw new Error("Resend not configured");

  const results: SendEmailResult[] = [];
  const batchEmails = emails.map((email) => {
    const senderEmail = email.from || getFromEmailAddress();
    const emailData: any = {
      from: senderEmail,
      to: email.to,
      subject: email.subject,
    };
    if (email.html) emailData.html = email.html;
    if (email.text) emailData.text = email.text;
    return emailData;
  });

  try {
    const response = await resend.batch.send(batchEmails as any);

    if (response.error) {
      throw new Error(response.error.message || "Resend batch API error");
    }

    // Success - create results for each email
    batchEmails.forEach((_, index) => {
      results.push({
        success: true,
        message: "Email sent successfully via Resend batch",
        data: { id: `batch-${index}` },
      });
    });

    return {
      success: true,
      message: "All batch emails sent successfully via Resend",
      results,
      data: { count: results.length },
    };
  } catch (error) {
    logger.error("Resend batch send failed:", error);
    throw error; // Let the caller handle fallback
  }
}
