/**
 * Better Auth 1.4 exposes these response models through the generated client
 * rather than as named exports. The registry components use the named-export
 * form, so keep the local declarations small and response-shaped.
 */
declare module "better-auth/client" {
  export type Organization = {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    metadata?: string | null;
    createdAt: Date;
  };

  export type Member = {
    id: string;
    organizationId: string;
    userId: string;
    role: "owner" | "admin" | "member" | string;
    createdAt: Date;
    user?: User;
  };

  export type Invitation = {
    id: string;
    organizationId: string;
    email: string;
    role: string;
    status: string;
    createdAt?: Date;
    expiresAt: Date;
    organizationName?: string;
  };

  export type User = {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
}

declare module "better-auth" {
  export type SocialProvider = string;
  export type User = {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: boolean;
  };
  export type Account = {
    id: string;
    accountId: string;
    providerId: string;
    userId?: string;
    createdAt?: Date;
    updatedAt?: Date;
  };
  export type Session = {
    id: string;
    userId: string;
    token?: string;
    expiresAt: Date;
    createdAt?: Date;
    updatedAt?: Date;
  };
}
