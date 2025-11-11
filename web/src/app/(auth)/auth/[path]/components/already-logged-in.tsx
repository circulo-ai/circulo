'use client';

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signOut } from "@/lib/auth-client";
import { useSession } from "@/providers/session-provider";
import { ArrowRight, LogOut } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@daveyplate/better-auth-ui"

export const AlreadyLoggedInCard = () => {
  const { data: session, isPending } = useSession();

  if (isPending || !session?.user) {
    return <Spinner />;
  }

  const user = session.user;

  return (
    <Card className="border-border/50 w-full max-w-md">
      <CardContent className="px-8 pt-8 pb-4">
        <div className="flex flex-col items-center space-y-6 text-center">
          {/* Avatar */}
          <UserAvatar
          className="size-20"
          user={user}
           size={"xl"}/>

          {/* Welcome Message */}
          <div className="space-y-2">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              Welcome back, {user.name?.split(" ")[0]}!
            </h1>
            <p className="text-muted-foreground text-sm">
              You're already signed in as
            </p>
            <p className="text-foreground text-sm font-medium">{user.email}</p>
          </div>

          {/* Actions */}
          <div className="w-full space-y-3 pt-4">
            <Link href="/dashboard" className="block w-full">
              <Button size="lg" className="group w-full">
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>

            <Button
              variant="outline"
              size="lg"
              className="w-full bg-transparent"
              onClick={async () => {
                await signOut();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
