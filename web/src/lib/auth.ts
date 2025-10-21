import { db } from "@/db";
import * as schema from "@/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import {
    customSession,
    oneTimeToken,
} from "better-auth/plugins";
import { headers } from "next/headers";
import { getBaseURL } from "@/lib/auth-client";
import { env } from "./env";
import { telegram } from "better-auth-telegram";

export const auth = betterAuth({
    appName: "dnd",
    baseURL: getBaseURL(),
    trustedOrigins: [
        env.NEXT_PUBLIC_APP_URL as string,
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
                'google',
                'github',
                'email-password',
                'telegram',
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
        oneTimeToken({
            expiresIn: 24 * 60 * 60, // 24 hours - Socket.IO handles connection persistence with heartbeats
        }),
        customSession(async ({ user, session }) => ({
            user,
            session,
        })),
        nextCookies(),
        telegram({
            botToken: env.BOT_TOKEN,
            allowUserToLink: true,
            autoCreateUser: true,
            miniApp: {
                enabled: true,
                allowAutoSignin: true,
                validateInitData: true,
            },
            botUsername: "IntelliSenseBot", // TODO: replace with real telegram bot username
        }),
    ],
});

// Server-side auth helpers
export async function getSession() {
    const hdrs = await headers()
    return await auth.api.getSession({
        headers: hdrs,
    })
}