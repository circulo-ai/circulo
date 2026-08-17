"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Account } from "@/components/sidebar/settings-modal/components/account/account";
import { General } from "@/components/sidebar/settings-modal/components/general/general";

export function WorkspaceAccount() {
  return <div className="grid gap-6 xl:grid-cols-2">
    <Card><CardHeader><CardTitle>Profile</CardTitle><CardDescription>Update the identity and profile details used across your chats.</CardDescription></CardHeader><CardContent className="p-0"><Account onOpenChange={() => undefined} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Personalization</CardTitle><CardDescription>Choose how Circulo looks on your devices. This preference is personal to you.</CardDescription></CardHeader><CardContent className="p-0"><General /></CardContent></Card>
  </div>;
}
