"use client";

import { authClient } from "@/lib/auth-client";

export type User = {
  id: string;
  email: string;
  emailVerified?: boolean;
  name?: string | null;
  image?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export function useOrganizationsHooks() {
  return {
    useListOrganizations: authClient.useListOrganizations,
    useActiveOrganization: authClient.useActiveOrganization,
  };
}

// TODO rewrite with swr
