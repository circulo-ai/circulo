"use client";

import { AuthUIContext } from "@daveyplate/better-auth-ui";
import { useContext } from "react";

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
  const {
    hooks: { useListOrganizations, useActiveOrganization },
  } = useContext(AuthUIContext);
  return {
    useListOrganizations,
    useActiveOrganization,
  };
}

// TODO rewrite with swr
