"use client";

import { createContext, useContext } from "react";

export type RuntimeKind = "cloud" | "self-hosted" | "desktop";

export type InstanceAuthState = {
  runtimeKind: RuntimeKind;
  localAuth: boolean;
  signupEnabled: boolean;
  socialProviders: "google"[];
  ready: boolean;
};

export const InstanceAuthContext = createContext<InstanceAuthState>({
  runtimeKind: "cloud",
  localAuth: false,
  signupEnabled: false,
  socialProviders: [],
  ready: false,
});

export function useInstanceAuth() {
  return useContext(InstanceAuthContext);
}

export function useCanSignUp() {
  const { localAuth, ready, signupEnabled } = useInstanceAuth();
  return !localAuth || (ready && signupEnabled);
}
