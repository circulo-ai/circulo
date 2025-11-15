import { renderMagicLinkEmail } from "@/components/emails";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getBaseURL } from "@/lib/auth-client";
import { sendEmail } from "@/lib/email/mailer";
import { createLogger } from "@/lib/logs/console/logger";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { customSession, magicLink, oneTimeToken } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { env } from "./env";

const logger = createLogger("Auth");

const handleNewUser = async (userId: string) => {
  try {
    // Get the free tier plan (you'll need to ensure this exists in your database)
    const freePlan = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.slug, "free"))
      .limit(1);

    if (!freePlan[0]) {
      logger.error("Free tier plan not found in database");
      throw new Error("Free tier plan not configured");
    }

    // Create subscription for new user
    await db.insert(schema.subscriptions).values({
      userId: userId,
      planId: freePlan[0].id,
      status: "active",
      startDate: new Date(),
      endDate: null, // Free tier never expires
      autoRenew: true, // Should be handled explicitly to renew free tiers every month
    });

    logger.info("Free tier subscription created for new user", {
      userId,
      planId: freePlan[0].id,
    });
  } catch (error) {
    logger.error("Failed to create subscription for new user", {
      userId,
      error,
    });
    throw error;
  }
};

export const auth = betterAuth({
  appName: "circulo",
  baseURL: getBaseURL(),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await handleNewUser(user.id);
          } catch (error) {
            logger.error(
              "[databaseHooks.user.create.after] Failed to initialize user stats",
              {
                userId: user.id,
                error,
              },
            );
          }
        },
      },
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
                organizationId: members[0]?.organizationId,
              });

              return {
                data: {
                  ...session,
                  activeOrganizationId: members[0]?.organizationId,
                },
              };
            }
            logger.info("No organizations found for user", {
              userId: session.userId,
            });
            return { data: session };
          } catch (error) {
            logger.error("Error setting active organization", {
              error,
              userId: session.userId,
            });
            return { data: session };
          }
        },
      },
    },
  },
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL as string].filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
      updateUserInfoOnLink: true,
      trustedProviders: ["google", "github", "email-password", "telegram"],
    },
  },
  emailAndPassword: {
    enabled: false,
    requireEmailVerification: true,
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
      clientSecret: env.GOOGLE_CLIENT_SECRET as string,
    },
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
      maxAge: 24 * 60 * 60, // 24 hours in seconds
    },
    expiresIn: 30 * 24 * 60 * 60, // 30 days (how long a session can last overall)
    updateAge: 24 * 60 * 60, // 24 hours (how often to refresh the expiry)
    freshAge: 60 * 60, // 1 hour (or set to 0 to disable completely)
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, token, url }, request) => {
        await sendEmail({
          from: "onboarding@resend.dev",
          to: email,
          subject: "Sign in",
          html: await renderMagicLinkEmail(url, email, "sign-in"),
          emailType: "transactional",
        });
      },
    }),
    oneTimeToken({
      expiresIn: 24 * 60 * 60, // 24 hours - Socket.IO handles connection persistence with heartbeats
    }),
    customSession(async ({ user, session }) => ({
      user,
      session,
    })),
    nextCookies(),
  ],
});

type SessionResponse = Awaited<ReturnType<typeof auth.api.getSession>>;
export type Session = NonNullable<SessionResponse>;

// Server-side auth helpers
export async function getSession(): Promise<SessionResponse> {
  return await auth.api.getSession({ headers: await headers() });
}
