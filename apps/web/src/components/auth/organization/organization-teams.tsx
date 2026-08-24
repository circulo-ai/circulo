"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import {
  useActiveOrganization,
  useAddTeamMember,
  useCreateTeam,
  useListOrganizationMembers,
  useListTeamMembers,
  useListTeams,
  useRemoveTeam,
  useRemoveTeamMember,
  useUpdateTeam,
} from "@better-auth-ui/react/plugins/organization";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

export function OrganizationTeams() {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { data: activeOrganization } = useActiveOrganization(authClient);
  const { localization } = useAuthPlugin(organizationPlugin);
  const teams = useListTeams(authClient, {
    query: { organizationId: activeOrganization?.id },
  });
  const members = useListOrganizationMembers(authClient);
  const createTeam = useCreateTeam(authClient, {
    onSuccess: () => toast.success(localization.teamCreated),
  });

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name || !activeOrganization) return;
    createTeam.mutate({ name, organizationId: activeOrganization.id });
    form.reset();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-sm font-semibold">{localization.teams}</h2>
          <p className="text-sm text-muted-foreground">
            {localization.teamsDescription}
          </p>
        </div>
        <form className="flex items-end gap-2" onSubmit={handleCreate}>
          <Field>
            <FieldLabel htmlFor="new-team-name">{localization.name}</FieldLabel>
            <Input id="new-team-name" name="name" required />
          </Field>
          <Button type="submit" disabled={createTeam.isPending}>
            {createTeam.isPending && <Spinner />}
            {localization.createTeam}
          </Button>
        </form>
      </div>
      {teams.isPending ? (
        <Spinner />
      ) : teams.data?.length ? (
        teams.data.map((team: { id: string; name: string }) => (
          <TeamCard
            key={team.id}
            organizationId={activeOrganization?.id ?? ""}
            organizationMembers={members.data?.members ?? []}
            team={team}
          />
        ))
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{localization.noTeams}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {localization.noTeamsDescription}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TeamCard({
  organizationId,
  organizationMembers,
  team,
}: {
  organizationId: string;
  organizationMembers: Array<{
    userId: string;
    user: { name: string; email: string };
  }>;
  team: { id: string; name: string };
}) {
  const { authClient, localization: authLocalization } =
    useAuth<OrganizationAuthClient>();
  const { localization } = useAuthPlugin(organizationPlugin);
  const [removed, setRemoved] = useState(false);
  const teamMembers = useListTeamMembers(authClient, {
    query: { teamId: team.id },
    enabled: !removed,
  });
  const updateTeam = useUpdateTeam(authClient);
  const removeTeam = useRemoveTeam(authClient);
  const [name, setName] = useState(team.name);
  const [userId, setUserId] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const addMember = useAddTeamMember(authClient, {
    onSuccess: () => setUserId(""),
  });
  const removeMember = useRemoveTeamMember(authClient);
  const memberIds = new Set(
    teamMembers.data?.map((member: { userId: string }) => member.userId),
  );
  const availableMembers = organizationMembers
    .filter((member) => !memberIds.has(member.userId))
    .map((member) => ({
      label: member.user.name || member.user.email,
      value: member.userId,
    }));

  if (removed) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex flex-col items-end gap-2 sm:flex-row">
          <Field className="flex-1">
            <FieldLabel htmlFor={`team-name-${team.id}`}>
              {localization.name}
            </FieldLabel>
            <Input
              id={`team-name-${team.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Button
            disabled={updateTeam.isPending}
            variant="outline"
            onClick={() =>
              updateTeam.mutate({
                teamId: team.id,
                data: { name, organizationId },
              })
            }
          >
            {authLocalization.settings.saveChanges}
          </Button>
          <Button
            disabled={removeTeam.isPending}
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            {localization.deleteTeam}
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Field className="flex-1">
            <FieldLabel>{localization.addTeamMember}</FieldLabel>
            <Select
              items={availableMembers}
              value={userId}
              onValueChange={(value) => setUserId(value ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={localization.selectMember} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {availableMembers.map((member) => (
                    <SelectItem key={member.value} value={member.value}>
                      {member.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            disabled={!userId || addMember.isPending}
            onClick={() =>
              userId &&
              addMember.mutate({ teamId: team.id, userId, organizationId })
            }
          >
            {localization.addTeamMember}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {teamMembers.data?.map(
            (teamMember: { id: string; userId: string }) => {
              const member = organizationMembers.find(
                (candidate) => candidate.userId === teamMember.userId,
              );
              return (
                <div
                  className="flex items-center justify-between gap-3"
                  key={teamMember.id}
                >
                  <span className="text-sm">
                    {member?.user.name ||
                      member?.user.email ||
                      teamMember.userId}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      removeMember.mutate({
                        teamId: team.id,
                        userId: teamMember.userId,
                        organizationId,
                      })
                    }
                  >
                    {localization.removeTeamMember}
                  </Button>
                </div>
              );
            },
          )}
        </div>
      </CardContent>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{localization.deleteTeam}</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the team. Members will stay in the workspace, but
              their team assignment will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeTeam.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              disabled={removeTeam.isPending}
              onClick={(event) => {
                event.preventDefault();
                setRemoved(true);
                removeTeam.mutate(
                  { teamId: team.id, organizationId },
                  {
                    onSuccess: () => {
                      setDeleteOpen(false);
                    },
                    onError: () => setRemoved(false),
                  },
                );
              }}
            >
              {removeTeam.isPending && <Spinner />}
              {localization.deleteTeam}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
