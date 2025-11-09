import React from "react";
import { baseStyles } from "./base-styles";
import EmailFooter from "./footer";

interface SizpayRenewalEmailProps {
  planName: "Pro" | "Team";
  userName?: string | null;
  periodEnd: Date;
  renewLink: string;
}

export function SizpayRenewalEmail({ planName, userName, periodEnd, renewLink }: SizpayRenewalEmailProps) {
  const formattedDate = new Date(periodEnd).toLocaleDateString();
  const greetingName = userName ? ` ${userName}` : "";

  return (
    <div style={baseStyles.container}>
      <div style={baseStyles.container}>
        <h1 style={baseStyles.header}>Subscription Renewal Reminder</h1>
        <p style={baseStyles.paragraph}>
          Hi{greetingName},
        </p>
        <p style={baseStyles.paragraph}>
          Your <strong>{planName}</strong> plan paid via <strong>Sizpay</strong> is due for renewal on
          <strong> {formattedDate}</strong>.
        </p>
        <p style={baseStyles.paragraph}>
          To avoid any interruption, please renew before your billing period ends.
        </p>

        <div style={{ textAlign: "center", marginTop: 16, marginBottom: 16 }}>
          <a
            href={renewLink}
            style={baseStyles.button}
            target="_blank"
            rel="noreferrer"
          >
            Renew Now
          </a>
        </div>

        <p style={baseStyles.paragraph}>
          If you have questions or need help, just reply to this email and we’ll assist.
        </p>

        <EmailFooter />
      </div>
    </div>
  );
}
