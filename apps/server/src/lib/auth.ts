// @ts-nocheck
import { renderMagicLinkEmail } from "@/components/emails";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { canCreateTeamOrg } from "@/lib/billing/autumn";
import { sendEmail } from "@/lib/email/mailer";
import { createLogger } from "@/lib/logs/console/logger";
import { autumn } from "autumn-js/better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import {
  customSession,
  genericOAuth,
  magicLink,
  oneTimeToken,
  openAPI,
  organization,
} from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { env } from "./env";

const logger = createLogger("Auth");

export const statement = {
  ...defaultStatements,
  chat: ["create", "share", "update", "delete"],
} as const;

const ac = createAccessControl(statement);

const ownerRole = ac.newRole({
  ...ownerAc.statements,
  chat: ["create", "update", "delete"],
});

const adminRole = ac.newRole({
  ...adminAc.statements,
  chat: ["create", "update"],
});

const memberRole = ac.newRole({
  ...memberAc.statements,
  chat: ["create"],
});

const createPersonalOrganization = async (user: User) => {
  try {
    const firstName = user.name?.trim()?.split(" ")[0] ?? null;

    const workspaceName = firstName
      ? `${firstName}'s Workspace`
      : "Personal Workspace";

    const orgId = nanoid(); // you are using text pk, so nanoid is perfect
    const slug = `personal-${orgId}`; // guaranteed unique

    await db.transaction(async (tx) => {
      // 1. Create organization
      await tx.insert(schema.organization).values({
        id: orgId,
        name: workspaceName,
        slug,
        metadata: JSON.stringify({ type: "personal", userId: user.id }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Create membership
      await tx.insert(schema.member).values({
        id: nanoid(), // if your member table uses text PK
        userId: user.id,
        organizationId: orgId,
        role: "owner",
        createdAt: new Date(),
      });
    });

    logger.info("Created personal workspace for new user", {
      userId: user.id,
      organizationId: orgId,
    });

    return orgId;
  } catch (error) {
    logger.error("Failed to create personal organization", {
      userId: user.id,
      error,
    });
    throw error;
  }
};

export const auth = betterAuth({
  appName: "circulo",
  baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3002",
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await createPersonalOrganization(user);
          } catch (error) {
            logger.error(
              "[databaseHooks.user.create.after] Failed to create personal organization",
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
  trustedOrigins: [
    env.NEXT_PUBLIC_APP_URL as string,
    env.BETTER_AUTH_URL as string,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ].filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
      updateUserInfoOnLink: true,
      trustedProviders: [
        // Standard OAuth providers
        "google",
        "github",
        "email-password",
        "confluence",
        "supabase",
        "x",
        "notion",
        "microsoft",
        "slack",
        "reddit",
      ],
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
    openAPI(),
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
    genericOAuth({
      config: [
        {
          providerId: "github-repo",
          clientId: env.GITHUB_REPO_CLIENT_ID as string,
          clientSecret: env.GITHUB_REPO_CLIENT_SECRET as string,
          authorizationUrl: "https://github.com/login/oauth/authorize",
          accessType: "offline",
          prompt: "consent",
          tokenUrl: "https://github.com/login/oauth/access_token",
          userInfoUrl: "https://api.github.com/user",
          scopes: ["user:email", "repo", "read:user", "workflow"],
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/github-repo`,
          getUserInfo: async (tokens) => {
            try {
              const profileResponse = await fetch(
                "https://api.github.com/user",
                {
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                    "User-Agent": "sim-studio",
                  },
                },
              );

              if (!profileResponse.ok) {
                logger.error("Failed to fetch GitHub profile", {
                  status: profileResponse.status,
                  statusText: profileResponse.statusText,
                });
                throw new Error(
                  `Failed to fetch GitHub profile: ${profileResponse.statusText}`,
                );
              }

              const profile = await profileResponse.json();

              if (!profile.email) {
                const emailsResponse = await fetch(
                  "https://api.github.com/user/emails",
                  {
                    headers: {
                      Authorization: `Bearer ${tokens.accessToken}`,
                      "User-Agent": "sim-studio",
                    },
                  },
                );

                if (emailsResponse.ok) {
                  const emails = await emailsResponse.json();

                  const primaryEmail =
                    emails.find(
                      (email: {
                        primary: boolean;
                        email: string;
                        verified: boolean;
                      }) => email.primary,
                    ) || emails[0];
                  if (primaryEmail) {
                    profile.email = primaryEmail.email;
                    profile.emailVerified = primaryEmail.verified || false;
                  }
                } else {
                  logger.warn("Failed to fetch GitHub emails", {
                    status: emailsResponse.status,
                    statusText: emailsResponse.statusText,
                  });
                }
              }

              const now = new Date();

              return {
                id: profile.id.toString(),
                name: profile.name || profile.login,
                email: profile.email,
                image: profile.avatar_url,
                emailVerified: profile.emailVerified || false,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error in GitHub getUserInfo", { error });
              throw error;
            }
          },
        },

        // Google providers
        {
          providerId: "google-email",
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          accessType: "offline",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.labels",
          ],
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/google-email`,
        },
        {
          providerId: "google-calendar",
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          accessType: "offline",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/calendar",
          ],
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/google-calendar`,
        },
        {
          providerId: "google-drive",
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          accessType: "offline",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/drive.file",
          ],
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/google-drive`,
        },
        {
          providerId: "google-docs",
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          accessType: "offline",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/drive.file",
          ],
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/google-docs`,
        },
        {
          providerId: "google-sheets",
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          accessType: "offline",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/drive.file",
          ],
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/google-sheets`,
        },

        {
          providerId: "google-forms",
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          accessType: "offline",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/forms.responses.readonly",
          ],
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/google-forms`,
        },

        {
          providerId: "google-vault",
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          discoveryUrl:
            "https://accounts.google.com/.well-known/openid-configuration",
          accessType: "offline",
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
            "https://www.googleapis.com/auth/ediscovery",
            "https://www.googleapis.com/auth/devstorage.read_only",
          ],
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/google-vault`,
        },

        {
          providerId: "microsoft-teams",
          clientId: env.MICROSOFT_CLIENT_ID as string,
          clientSecret: env.MICROSOFT_CLIENT_SECRET as string,
          authorizationUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          userInfoUrl: "https://graph.microsoft.com/v1.0/me",
          scopes: [
            "openid",
            "profile",
            "email",
            "User.Read",
            "Chat.Read",
            "Chat.ReadWrite",
            "Chat.ReadBasic",
            "Channel.ReadBasic.All",
            "ChannelMessage.Send",
            "ChannelMessage.Read.All",
            "Group.Read.All",
            "Group.ReadWrite.All",
            "Team.ReadBasic.All",
            "offline_access",
          ],
          responseType: "code",
          accessType: "offline",
          authentication: "basic",
          pkce: true,
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/microsoft-teams`,
        },

        {
          providerId: "microsoft-excel",
          clientId: env.MICROSOFT_CLIENT_ID as string,
          clientSecret: env.MICROSOFT_CLIENT_SECRET as string,
          authorizationUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          userInfoUrl: "https://graph.microsoft.com/v1.0/me",
          scopes: [
            "openid",
            "profile",
            "email",
            "Files.Read",
            "Files.ReadWrite",
            "offline_access",
          ],
          responseType: "code",
          accessType: "offline",
          authentication: "basic",
          pkce: true,
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/microsoft-excel`,
        },
        {
          providerId: "microsoft-planner",
          clientId: env.MICROSOFT_CLIENT_ID as string,
          clientSecret: env.MICROSOFT_CLIENT_SECRET as string,
          authorizationUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          userInfoUrl: "https://graph.microsoft.com/v1.0/me",
          scopes: [
            "openid",
            "profile",
            "email",
            "Group.ReadWrite.All",
            "Group.Read.All",
            "Tasks.ReadWrite",
            "offline_access",
          ],
          responseType: "code",
          accessType: "offline",
          authentication: "basic",
          pkce: true,
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/microsoft-planner`,
        },

        {
          providerId: "outlook",
          clientId: env.MICROSOFT_CLIENT_ID as string,
          clientSecret: env.MICROSOFT_CLIENT_SECRET as string,
          authorizationUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          userInfoUrl: "https://graph.microsoft.com/v1.0/me",
          scopes: [
            "openid",
            "profile",
            "email",
            "Mail.ReadWrite",
            "Mail.ReadBasic",
            "Mail.Read",
            "Mail.Send",
            "offline_access",
          ],
          responseType: "code",
          accessType: "offline",
          authentication: "basic",
          pkce: true,
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/outlook`,
        },

        {
          providerId: "onedrive",
          clientId: env.MICROSOFT_CLIENT_ID as string,
          clientSecret: env.MICROSOFT_CLIENT_SECRET as string,
          authorizationUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          userInfoUrl: "https://graph.microsoft.com/v1.0/me",
          scopes: [
            "openid",
            "profile",
            "email",
            "Files.Read",
            "Files.ReadWrite",
            "offline_access",
          ],
          responseType: "code",
          accessType: "offline",
          authentication: "basic",
          pkce: true,
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/onedrive`,
        },

        {
          providerId: "sharepoint",
          clientId: env.MICROSOFT_CLIENT_ID as string,
          clientSecret: env.MICROSOFT_CLIENT_SECRET as string,
          authorizationUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          userInfoUrl: "https://graph.microsoft.com/v1.0/me",
          scopes: [
            "openid",
            "profile",
            "email",
            "Sites.Read.All",
            "Sites.ReadWrite.All",
            "Sites.Manage.All",
            "offline_access",
          ],
          responseType: "code",
          accessType: "offline",
          authentication: "basic",
          pkce: true,
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/sharepoint`,
        },

        {
          providerId: "wealthbox",
          clientId: env.WEALTHBOX_CLIENT_ID as string,
          clientSecret: env.WEALTHBOX_CLIENT_SECRET as string,
          authorizationUrl: "https://app.crmworkspace.com/oauth/authorize",
          tokenUrl: "https://app.crmworkspace.com/oauth/token",
          userInfoUrl: "https://dummy-not-used.wealthbox.com", // Dummy URL since no user info endpoint exists
          scopes: ["login", "data"],
          responseType: "code",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/wealthbox`,
          getUserInfo: async (tokens) => {
            try {
              logger.info("Creating Wealthbox user profile from token data");

              const uniqueId = `wealthbox-${Date.now()}`;
              const now = new Date();

              return {
                id: uniqueId,
                name: "Wealthbox User",
                email: `${uniqueId.replace(
                  /[^a-zA-Z0-9]/g,
                  "",
                )}@wealthbox.user`,
                emailVerified: false,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error creating Wealthbox user profile:", { error });
              return null;
            }
          },
        },

        // Supabase provider
        {
          providerId: "supabase",
          clientId: env.SUPABASE_CLIENT_ID as string,
          clientSecret: env.SUPABASE_CLIENT_SECRET as string,
          authorizationUrl: "https://api.supabase.com/v1/oauth/authorize",
          tokenUrl: "https://api.supabase.com/v1/oauth/token",
          userInfoUrl: "https://dummy-not-used.supabase.co",
          scopes: ["database.read", "database.write", "projects.read"],
          responseType: "code",
          pkce: true,
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/supabase`,
          getUserInfo: async (tokens) => {
            try {
              logger.info("Creating Supabase user profile from token data");

              let userId = "supabase-user";
              if (tokens.idToken) {
                try {
                  const decodedToken = JSON.parse(
                    Buffer.from(
                      tokens.idToken.split(".")[1],
                      "base64",
                    ).toString(),
                  );
                  if (decodedToken.sub) {
                    userId = decodedToken.sub;
                  }
                } catch (e) {
                  logger.warn("Failed to decode Supabase ID token", {
                    error: e,
                  });
                }
              }

              const uniqueId = `${userId}-${Date.now()}`;
              const now = new Date();

              return {
                id: uniqueId,
                name: "Supabase User",
                email: `${uniqueId.replace(/[^a-zA-Z0-9]/g, "")}@supabase.user`,
                emailVerified: false,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error creating Supabase user profile:", { error });
              return null;
            }
          },
        },

        // X provider
        {
          providerId: "x",
          clientId: env.X_CLIENT_ID as string,
          clientSecret: env.X_CLIENT_SECRET as string,
          authorizationUrl: "https://x.com/i/oauth2/authorize",
          tokenUrl: "https://api.x.com/2/oauth2/token",
          userInfoUrl: "https://api.x.com/2/users/me",
          accessType: "offline",
          scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
          pkce: true,
          responseType: "code",
          prompt: "consent",
          authentication: "basic",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/x`,
          getUserInfo: async (tokens) => {
            try {
              const response = await fetch(
                "https://api.x.com/2/users/me?user.fields=profile_image_url,username,name,verified",
                {
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                  },
                },
              );

              if (!response.ok) {
                logger.error("Error fetching X user info:", {
                  status: response.status,
                  statusText: response.statusText,
                });
                return null;
              }

              const profile = await response.json();

              if (!profile.data) {
                logger.error("Invalid X profile response:", profile);
                return null;
              }

              const now = new Date();

              return {
                id: profile.data.id,
                name: profile.data.name || "X User",
                email: `${profile.data.username}@x.com`,
                image: profile.data.profile_image_url,
                emailVerified: profile.data.verified || false,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error in X getUserInfo:", { error });
              return null;
            }
          },
        },

        // Confluence provider
        {
          providerId: "confluence",
          clientId: env.CONFLUENCE_CLIENT_ID as string,
          clientSecret: env.CONFLUENCE_CLIENT_SECRET as string,
          authorizationUrl: "https://auth.atlassian.com/authorize",
          tokenUrl: "https://auth.atlassian.com/oauth/token",
          userInfoUrl: "https://api.atlassian.com/me",
          scopes: [
            "read:page:confluence",
            "write:page:confluence",
            "read:me",
            "offline_access",
          ],
          responseType: "code",
          pkce: true,
          accessType: "offline",
          authentication: "basic",
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/confluence`,
          getUserInfo: async (tokens) => {
            try {
              const response = await fetch("https://api.atlassian.com/me", {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              });

              if (!response.ok) {
                logger.error("Error fetching Confluence user info:", {
                  status: response.status,
                  statusText: response.statusText,
                });
                return null;
              }

              const profile = await response.json();

              const now = new Date();

              return {
                id: profile.account_id,
                name: profile.name || profile.display_name || "Confluence User",
                email: profile.email || `${profile.account_id}@atlassian.com`,
                image: profile.picture || undefined,
                emailVerified: true,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error in Confluence getUserInfo:", { error });
              return null;
            }
          },
        },

        // Discord provider
        {
          providerId: "discord",
          clientId: env.DISCORD_CLIENT_ID as string,
          clientSecret: env.DISCORD_CLIENT_SECRET as string,
          authorizationUrl: "https://discord.com/api/oauth2/authorize",
          tokenUrl: "https://discord.com/api/oauth2/token",
          userInfoUrl: "https://discord.com/api/users/@me",
          scopes: [
            "identify",
            "bot",
            "messages.read",
            "guilds",
            "guilds.members.read",
          ],
          responseType: "code",
          accessType: "offline",
          authentication: "basic",
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/discord`,
          getUserInfo: async (tokens) => {
            try {
              const response = await fetch(
                "https://discord.com/api/users/@me",
                {
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                  },
                },
              );

              if (!response.ok) {
                logger.error("Error fetching Discord user info:", {
                  status: response.status,
                  statusText: response.statusText,
                });
                return null;
              }

              const profile = await response.json();
              const now = new Date();

              return {
                id: profile.id,
                name: profile.username || "Discord User",
                email: profile.email || `${profile.id}@discord.user`,
                image: profile.avatar
                  ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
                  : undefined,
                emailVerified: profile.verified || false,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error in Discord getUserInfo:", { error });
              return null;
            }
          },
        },

        // Jira provider
        {
          providerId: "jira",
          clientId: env.JIRA_CLIENT_ID as string,
          clientSecret: env.JIRA_CLIENT_SECRET as string,
          authorizationUrl: "https://auth.atlassian.com/authorize",
          tokenUrl: "https://auth.atlassian.com/oauth/token",
          userInfoUrl: "https://api.atlassian.com/me",
          scopes: [
            "read:jira-user",
            "read:jira-work",
            "write:jira-work",
            "write:issue:jira",
            "read:project:jira",
            "read:issue-type:jira",
            "read:me",
            "offline_access",
            "read:issue-meta:jira",
            "read:issue-security-level:jira",
            "read:issue.vote:jira",
            "read:issue.changelog:jira",
            "read:avatar:jira",
            "read:issue:jira",
            "read:status:jira",
            "read:user:jira",
            "read:field-configuration:jira",
            "read:issue-details:jira",
          ],
          responseType: "code",
          pkce: true,
          accessType: "offline",
          authentication: "basic",
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/jira`,
          getUserInfo: async (tokens) => {
            try {
              const response = await fetch("https://api.atlassian.com/me", {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              });

              if (!response.ok) {
                logger.error("Error fetching Jira user info:", {
                  status: response.status,
                  statusText: response.statusText,
                });
                return null;
              }

              const profile = await response.json();

              const now = new Date();

              return {
                id: profile.account_id,
                name: profile.name || profile.display_name || "Jira User",
                email: profile.email || `${profile.account_id}@atlassian.com`,
                image: profile.picture || undefined,
                emailVerified: true,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error in Jira getUserInfo:", { error });
              return null;
            }
          },
        },

        // Airtable provider
        {
          providerId: "airtable",
          clientId: env.AIRTABLE_CLIENT_ID as string,
          clientSecret: env.AIRTABLE_CLIENT_SECRET as string,
          authorizationUrl: "https://airtable.com/oauth2/v1/authorize",
          tokenUrl: "https://airtable.com/oauth2/v1/token",
          userInfoUrl: "https://api.airtable.com/v0/meta/whoami",
          scopes: [
            "data.records:read",
            "data.records:write",
            "user.email:read",
            "webhook:manage",
          ],
          responseType: "code",
          pkce: true,
          accessType: "offline",
          authentication: "basic",
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/airtable`,
        },

        // Notion provider
        {
          providerId: "notion",
          clientId: env.NOTION_CLIENT_ID as string,
          clientSecret: env.NOTION_CLIENT_SECRET as string,
          authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
          tokenUrl: "https://api.notion.com/v1/oauth/token",
          userInfoUrl: "https://api.notion.com/v1/users/me",
          scopes: [
            "workspace.content",
            "workspace.name",
            "page.read",
            "page.write",
          ],
          responseType: "code",
          pkce: false,
          accessType: "offline",
          authentication: "basic",
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/notion`,
          getUserInfo: async (tokens) => {
            try {
              const response = await fetch(
                "https://api.notion.com/v1/users/me",
                {
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                    "Notion-Version": "2022-06-28",
                  },
                },
              );

              if (!response.ok) {
                logger.error("Error fetching Notion user info:", {
                  status: response.status,
                  statusText: response.statusText,
                });
                return null;
              }

              const profile = await response.json();
              const now = new Date();

              return {
                id: profile.bot?.owner?.user?.id || profile.id,
                name:
                  profile.name ||
                  profile.bot?.owner?.user?.name ||
                  "Notion User",
                email: profile.person?.email || `${profile.id}@notion.user`,
                emailVerified: !!profile.person?.email,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error in Notion getUserInfo:", { error });
              return null;
            }
          },
        },

        // Reddit provider
        {
          providerId: "reddit",
          clientId: env.REDDIT_CLIENT_ID as string,
          clientSecret: env.REDDIT_CLIENT_SECRET as string,
          authorizationUrl:
            "https://www.reddit.com/api/v1/authorize?duration=permanent",
          tokenUrl: "https://www.reddit.com/api/v1/access_token",
          userInfoUrl: "https://oauth.reddit.com/api/v1/me",
          scopes: ["identity", "read"],
          responseType: "code",
          pkce: false,
          accessType: "offline",
          authentication: "basic",
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/reddit`,
          getUserInfo: async (tokens) => {
            try {
              const response = await fetch(
                "https://oauth.reddit.com/api/v1/me",
                {
                  headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                    "User-Agent": "sim-studio/1.0",
                  },
                },
              );

              if (!response.ok) {
                logger.error("Error fetching Reddit user info:", {
                  status: response.status,
                  statusText: response.statusText,
                });
                return null;
              }

              const data = await response.json();
              const now = new Date();

              return {
                id: data.id,
                name: data.name || "Reddit User",
                email: `${data.name}@reddit.user`,
                image: data.icon_img || undefined,
                emailVerified: false,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error in Reddit getUserInfo:", { error });
              return null;
            }
          },
        },

        {
          providerId: "linear",
          clientId: env.LINEAR_CLIENT_ID as string,
          clientSecret: env.LINEAR_CLIENT_SECRET as string,
          authorizationUrl: "https://linear.app/oauth/authorize",
          tokenUrl: "https://api.linear.app/oauth/token",
          scopes: ["read", "write"],
          responseType: "code",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/linear`,
          pkce: true,
          prompt: "consent",
          accessType: "offline",
          getUserInfo: async (tokens) => {
            try {
              const response = await fetch("https://api.linear.app/graphql", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
                body: JSON.stringify({
                  query: `{
                    viewer {
                      id
                      email
                      name
                      avatarUrl
                    }
                  }`,
                }),
              });

              if (!response.ok) {
                const errorText = await response.text();
                logger.error("Linear API error:", {
                  status: response.status,
                  statusText: response.statusText,
                  body: errorText,
                });
                throw new Error(
                  `Linear API error: ${response.status} ${response.statusText}`,
                );
              }

              const { data, errors } = await response.json();

              if (errors) {
                logger.error("GraphQL errors:", errors);
                throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
              }

              if (!data?.viewer) {
                logger.error("No viewer data in response:", data);
                throw new Error("No viewer data in response");
              }

              const viewer = data.viewer;

              return {
                id: viewer.id,
                email: viewer.email,
                name: viewer.name,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                image: viewer.avatarUrl || undefined,
              };
            } catch (error) {
              logger.error("Error in getUserInfo:", error);
              throw error;
            }
          },
        },

        // Slack provider
        {
          providerId: "slack",
          clientId: env.SLACK_CLIENT_ID as string,
          clientSecret: env.SLACK_CLIENT_SECRET as string,
          authorizationUrl: "https://slack.com/oauth/v2/authorize",
          tokenUrl: "https://slack.com/api/oauth.v2.access",
          userInfoUrl: "https://slack.com/api/users.identity",
          scopes: [
            // Bot token scopes only - app acts as a bot user
            "channels:read",
            "channels:history",
            "groups:read",
            "groups:history",
            "chat:write",
            "chat:write.public",
            "users:read",
            "files:write",
            "canvases:write",
          ],
          responseType: "code",
          accessType: "offline",
          prompt: "consent",
          redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/oauth2/callback/slack`,
          getUserInfo: async (tokens) => {
            try {
              logger.info("Creating Slack bot profile from token data");

              // Extract user identifier from tokens if possible
              let userId = "slack-bot";
              if (tokens.idToken) {
                try {
                  const decodedToken = JSON.parse(
                    Buffer.from(
                      tokens.idToken.split(".")[1],
                      "base64",
                    ).toString(),
                  );
                  if (decodedToken.sub) {
                    userId = decodedToken.sub;
                  }
                } catch (e) {
                  logger.warn("Failed to decode Slack ID token", { error: e });
                }
              }

              const uniqueId = `${userId}-${Date.now()}`;
              const now = new Date();

              return {
                id: uniqueId,
                name: "Slack Bot",
                email: `${uniqueId.replace(/[^a-zA-Z0-9]/g, "")}@slack.bot`,
                emailVerified: false,
                createdAt: now,
                updatedAt: now,
              };
            } catch (error) {
              logger.error("Error creating Slack bot profile:", { error });
              return null;
            }
          },
        },
      ],
    }),
    autumn({
      customerScope: "organization",
    }),
    organization({
      ac,
      roles: {
        owner: ownerRole,
        admin: adminRole,
        member: memberRole,
      },
      membershipLimit: 50,
      allowUserToCreateOrganization: async (user) => {
        try {
          // Find the user's personal organization
          const personalOrg = await db
            .select()
            .from(schema.organization)
            .innerJoin(
              schema.member,
              eq(schema.member.organizationId, schema.organization.id),
            )
            .where(
              and(
                eq(schema.member.userId, user.id),
                eq(schema.member.role, "owner"),
                // Check for personal org type in metadata
                sql`${schema.organization.metadata}->>'type' = 'personal'`,
              ),
            )
            .limit(1);

          if (personalOrg.length === 0) {
            logger.warn("No personal org found for user", { userId: user.id });
            return false;
          }

          const orgId = personalOrg[0].organization.id;

          // Check if user's personal org has pro+ subscription
          const canCreate = await canCreateTeamOrg(orgId);

          logger.info("Checking if user can create team org", {
            userId: user.id,
            personalOrgId: orgId,
            canCreate,
          });

          return canCreate;
        } catch (error) {
          logger.error("Error checking org creation permission", {
            userId: user.id,
            error,
          });
          return false;
        }
      },
      organizationCreation: {
        beforeCreate: async ({ organization, user }) => {
          // Mark new orgs as "team" type (personal orgs are created separately)
          return {
            data: {
              ...organization,
              metadata: {
                ...((organization as any).metadata || {}),
                type: "team",
              },
            },
          };
        },
        afterCreate: async ({ organization, user }) => {
          logger.info("[organizationCreation.afterCreate] Team org created", {
            organizationId: organization.id,
            creatorId: user.id,
          });

          // Optionally: Initialize the team org with a "team" subscription
          // This depends on your billing flow - you might want to:
          // 1. Auto-assign team plan, or
          // 2. Let users upgrade after creation
        },
      },
    }),
  ],
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true, // New browser standards will mandate this for foreign cookies
    },
    crossSubDomainCookies: {
      enabled: true,
    },
  },
});

export type AuthType = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

export type SessionResponse = Awaited<ReturnType<typeof auth.api.getSession>>;
export type Session = NonNullable<SessionResponse>;

// Helpers to read session/organization in the non-Next runtime
export async function getSession(
  headersOrRequest?: HeadersInit | Request,
): Promise<SessionResponse> {
  const headers =
    headersOrRequest instanceof Request
      ? headersOrRequest.headers
      : headersOrRequest;

  return auth.api.getSession({
    headers: headers ? new Headers(headers) : undefined,
  });
}

export async function getActiveOrganizationId(
  sessionOrHeaders?: SessionResponse | HeadersInit | Request,
): Promise<string> {
  const session =
    sessionOrHeaders && "session" in (sessionOrHeaders as any)
      ? (sessionOrHeaders as SessionResponse)
      : await getSession(sessionOrHeaders as any);

  const activeOrgId = (session?.session as any)?.activeOrganizationId;
  if (!activeOrgId) {
    throw new Error("No organization id provided");
  }
  return activeOrgId;
}
