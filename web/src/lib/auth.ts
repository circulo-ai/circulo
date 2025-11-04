import { renderInvitationEmail, renderMagicLinkEmail } from "@/components/emails";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseURL } from "@/lib/auth-client";
import { sendEmail } from "@/lib/email/mailer";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { customSession, magicLink, oneTimeToken, organization } from "better-auth/plugins";
import { headers } from "next/headers";
import { env } from "./env";
import { createLogger } from "@/lib/logs/console/logger";
import Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { getFromEmailAddress } from "@/lib/email/utils";
import { handleNewUser, sendPlanWelcomeEmail } from "@/lib/billing";
import { isBillingEnabled } from "@/lib/environment";
import { stripe } from "@better-auth/stripe";
import { getPlans } from "@/lib/billing/plans";
import { authorizeSubscriptionReference } from "@/lib/billing/authorization";
import { syncSubscriptionUsageLimits } from "@/lib/billing/organization";
import { handleSubscriptionCreated, handleSubscriptionDeleted } from "@/lib/billing/webhooks/subscription";
import {
  handleInvoiceFinalized,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded
} from "@/lib/billing/webhooks/invoices";
import { handleManualEnterpriseSubscription } from "@/lib/billing/webhooks/enterprise";
import { getBaseUrl } from "@/lib/urls/utils";

const logger = createLogger("Auth");

// Only initialize Stripe if the key is provided
// This allows local development without a Stripe account
const validStripeKey = env.STRIPE_SECRET_KEY;

let stripeClient = null;
if (validStripeKey) {
  stripeClient = new Stripe(env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2025-10-29.clover"
  });
}

export const auth = betterAuth({
  appName: "circulo",
  baseURL: getBaseURL(),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          logger.info(
            "[databaseHooks.user.create.after] User created, initializing stats",
            {
              userId: user.id
            }
          );

          try {
            await handleNewUser(user.id);
          } catch (error) {
            logger.error(
              "[databaseHooks.user.create.after] Failed to initialize user stats",
              {
                userId: user.id,
                error
              }
            );
          }
        }
      }
    },
    session: {
      create: {
        before: async (session) => {
          try {
            // Find the first organization this user is a member of
            const members = await db
              .select()
              .from(schema.member)
              .where(eq(schema.member.userId, session.userId))
              .limit(1);

            if (members.length > 0) {
              logger.info("Found organization for user", {
                userId: session.userId,
                organizationId: members[0].organizationId
              });

              return {
                data: {
                  ...session,
                  activeOrganizationId: members[0].organizationId
                }
              };
            }
            logger.info("No organizations found for user", {
              userId: session.userId
            });
            return { data: session };
          } catch (error) {
            logger.error("Error setting active organization", {
              error,
              userId: session.userId
            });
            return { data: session };
          }
        }
      }
    }
  },
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL as string].filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
      updateUserInfoOnLink: true,
      trustedProviders: ["google", "github", "email-password", "telegram"]
    }
  },
  emailAndPassword: {
    enabled: false,
    requireEmailVerification: true
    // async sendResetPassword({ user, url }) {
    //     await sendEmail({
    //         from,
    //         to: [user.email],
    //         subject: "Reset your password",
    //         react: reactResetPasswordEmail({
    //             username: user.email,
    //             resetLink: url,
    //         }),
    //     });
    // },
  },
  emailVerification: {
    // async sendVerificationEmail({ user, url }) {
    //     const res = await sendEmailHtml([
    //         {
    //             from: from,
    //             to: user.email,
    //             subject: "Verify your email address",
    //             html: `<a href="${url}">Verify your email address</a>`,
    //         },
    //     ]);
    // },
  },
  socialProviders: {
    google: {
      prompt: "select_account",
      clientId: env.GOOGLE_CLIENT_ID as string,
      clientSecret: env.GOOGLE_CLIENT_SECRET as string
    }
    // github: {
    //     enabled: false,
    //     clientId: env.GITHUB_CLIENT_ID as string,
    //     clientSecret: env.GITHUB_CLIENT_SECRET as string,
    //     scope: ['user:email', 'repo'],
    // },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 24 * 60 * 60 // 24 hours in seconds
    },
    expiresIn: 30 * 24 * 60 * 60, // 30 days (how long a session can last overall)
    updateAge: 24 * 60 * 60, // 24 hours (how often to refresh the expiry)
    freshAge: 60 * 60 // 1 hour (or set to 0 to disable completely)
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, token, url }, request) => {
        await sendEmail({
          from: "onboarding@resend.dev",
          to: email,
          subject: "Sign in",
          html: await renderMagicLinkEmail(url, email, "sign-in"),
          emailType: "transactional"
        });
      }
    }),
    oneTimeToken({
      expiresIn: 24 * 60 * 60 // 24 hours - Socket.IO handles connection persistence with heartbeats
    }),
    customSession(async ({ user, session }) => ({
      user,
      session
    })),
    nextCookies(),
    // Only include the Stripe plugin when billing is enabled
    ...(isBillingEnabled && stripeClient
      ? [
        stripe({
          stripeClient,
          stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
          createCustomerOnSignUp: true,
          onCustomerCreate: async ({ stripeCustomer, user }) => {
            logger.info("[onCustomerCreate] Stripe customer created", {
              stripeCustomerId: stripeCustomer.id,
              userId: user.id
            });
          },
          subscription: {
            enabled: true,
            plans: getPlans(),
            authorizeReference: async ({ user, referenceId }) => {
              return await authorizeSubscriptionReference(user.id, referenceId);
            },
            getCheckoutSessionParams: async ({ plan, subscription }) => {
              if (plan.name === "team") {
                return {
                  params: {
                    allow_promotion_codes: true,
                    line_items: [
                      {
                        price: plan.priceId,
                        quantity: subscription?.seats || 1,
                        adjustable_quantity: {
                          enabled: true,
                          minimum: 1,
                          maximum: 50
                        }
                      }
                    ]
                  }
                };
              }

              return {
                params: {
                  allow_promotion_codes: true
                }
              };
            },
            onSubscriptionComplete: async ({
                                             subscription
                                           }: {
              event: Stripe.Event
              stripeSubscription: Stripe.Subscription
              subscription: any
            }) => {
              logger.info("[onSubscriptionComplete] Subscription created", {
                subscriptionId: subscription.id,
                referenceId: subscription.referenceId,
                plan: subscription.plan,
                status: subscription.status
              });

              await handleSubscriptionCreated(subscription);

              await syncSubscriptionUsageLimits(subscription);

              await sendPlanWelcomeEmail(subscription);
            },
            onSubscriptionUpdate: async ({
                                           subscription
                                         }: {
              event: Stripe.Event
              subscription: any
            }) => {
              logger.info("[onSubscriptionUpdate] Subscription updated", {
                subscriptionId: subscription.id,
                status: subscription.status,
                plan: subscription.plan
              });

              try {
                await syncSubscriptionUsageLimits(subscription);
              } catch (error) {
                logger.error("[onSubscriptionUpdate] Failed to sync usage limits", {
                  subscriptionId: subscription.id,
                  referenceId: subscription.referenceId,
                  error
                });
              }
            },
            onSubscriptionDeleted: async ({
                                            subscription
                                          }: {
              event: Stripe.Event
              stripeSubscription: Stripe.Subscription
              subscription: any
            }) => {
              logger.info("[onSubscriptionDeleted] Subscription deleted", {
                subscriptionId: subscription.id,
                referenceId: subscription.referenceId
              });

              try {
                await handleSubscriptionDeleted(subscription);

                // Reset usage limits to free tier
                await syncSubscriptionUsageLimits(subscription);

                logger.info("[onSubscriptionDeleted] Reset usage limits to free tier", {
                  subscriptionId: subscription.id,
                  referenceId: subscription.referenceId
                });
              } catch (error) {
                logger.error("[onSubscriptionDeleted] Failed to handle subscription deletion", {
                  subscriptionId: subscription.id,
                  referenceId: subscription.referenceId,
                  error
                });
              }
            }
          },
          onEvent: async (event: Stripe.Event) => {
            logger.info("[onEvent] Received Stripe webhook", {
              eventId: event.id,
              eventType: event.type
            });

            try {
              switch (event.type) {
                case "invoice.payment_succeeded": {
                  await handleInvoicePaymentSucceeded(event);
                  break;
                }
                case "invoice.payment_failed": {
                  await handleInvoicePaymentFailed(event);
                  break;
                }
                case "invoice.finalized": {
                  await handleInvoiceFinalized(event);
                  break;
                }
                case "customer.subscription.created": {
                  await handleManualEnterpriseSubscription(event);
                  break;
                }
                // Note: customer.subscription.deleted is handled by better-auth's onSubscriptionDeleted callback above
                default:
                  logger.info("[onEvent] Ignoring unsupported webhook event", {
                    eventId: event.id,
                    eventType: event.type
                  });
                  break;
              }

              logger.info("[onEvent] Successfully processed webhook", {
                eventId: event.id,
                eventType: event.type
              });
            } catch (error) {
              logger.error("[onEvent] Failed to process webhook", {
                eventId: event.id,
                eventType: event.type,
                error
              });
              throw error;
            }
          }
        }),
        organization({
          allowUserToCreateOrganization: async (user) => {
            const dbSubscriptions = await db
              .select()
              .from(schema.subscription)
              .where(eq(schema.subscription.referenceId, user.id));

            const hasTeamPlan = dbSubscriptions.some(
              (sub) =>
                sub.status === "active" && (sub.plan === "team" || sub.plan === "enterprise")
            );

            return hasTeamPlan;
          },
          // Set a fixed membership limit of 50, but the actual limit will be enforced in the invitation flow
          membershipLimit: 50,
          // Validate seat limits before sending invitations
          beforeInvite: async ({ organization }: { organization: { id: string } }) => {
            const subscriptions = await db
              .select()
              .from(schema.subscription)
              .where(
                and(
                  eq(schema.subscription.referenceId, organization.id),
                  eq(schema.subscription.status, "active")
                )
              );

            const teamOrEnterpriseSubscription = subscriptions.find(
              (sub) => sub.plan === "team" || sub.plan === "enterprise"
            );

            if (!teamOrEnterpriseSubscription) {
              throw new Error("No active team or enterprise subscription for this organization");
            }

            const members = await db
              .select()
              .from(schema.member)
              .where(eq(schema.member.organizationId, organization.id));

            const pendingInvites = await db
              .select()
              .from(schema.invitation)
              .where(
                and(
                  eq(schema.invitation.organizationId, organization.id),
                  eq(schema.invitation.status, "pending")
                )
              );

            const totalCount = members.length + pendingInvites.length;
            const seatLimit = teamOrEnterpriseSubscription.seats || 1;

            if (totalCount >= seatLimit) {
              throw new Error(`Organization has reached its seat limit of ${seatLimit}`);
            }
          },
          sendInvitationEmail: async (data: any) => {
            try {
              const { invitation, organization, inviter } = data;

              const inviteUrl = `${getBaseUrl()}/invite/${invitation.id}`;
              const inviterName = inviter.user?.name || "A team member";

              const html = await renderInvitationEmail(
                inviterName,
                organization.name,
                inviteUrl,
                invitation.email
              );

              const result = await sendEmail({
                to: invitation.email,
                subject: `${inviterName} has invited you to join ${organization.name} on Sim`,
                html,
                from: getFromEmailAddress(),
                emailType: "transactional"
              });

              if (!result.success) {
                logger.error("Failed to send organization invitation email:", result.message);
              }
            } catch (error) {
              logger.error("Error sending invitation email", { error });
            }
          },
          organizationHooks: {
            afterCreateOrganization: async ({ organization, user }) => {
              logger.info("[organizationCreation.afterCreate] Organization created", {
                organizationId: organization.id,
                creatorId: user.id
              });
            }
          }
        })
      ]
      : [])
  ]
});

type SessionResponse = Awaited<ReturnType<typeof auth.api.getSession>>;
export type Session = NonNullable<SessionResponse>;

// Server-side auth helpers
export async function getSession(): Promise<SessionResponse> {
  return await auth.api.getSession({ headers: await headers() });
}
