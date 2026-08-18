"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { organizationPlugin } from "@/lib/auth/organization-plugin";
import { parseAdditionalFieldValue } from "@better-auth-ui/core";
import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization";
import { useAuth, useAuthPlugin } from "@better-auth-ui/react";
import { useCreateOrganization } from "@better-auth-ui/react/plugins/organization";
import { Briefcase } from "lucide-react";
import { type SyntheticEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { AdditionalField } from "../additional-field";
import { SlugField, sanitizeSlug } from "./slug-field";

/** Props for the `CreateOrganizationDialog` component. */
export type CreateOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) {
  const { authClient, localization } = useAuth<OrganizationAuthClient>();
  const { additionalFields, localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [submitError, setSubmitError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLocked = useRef(false);

  const { mutate: createOrganization, isPending: isCreating } =
    useCreateOrganization(authClient, {
      onSuccess: () => onOpenChange(false),
      onError: (error) => {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error && "message" in error
              ? String(error.message)
              : "We couldn’t create the workspace. Check the details and try again.";
        setSubmitError(
          message === "Internal server error"
            ? "The workspace service could not complete this request. Check that your workspace name and slug are unique, then try again."
            : message,
        );
        toast.error("Workspace creation failed");
      },
      onSettled: () => {
        submissionLocked.current = false;
        setIsSubmitting(false);
      },
    });

  const effectiveSlug = slugEdited ? slug : sanitizeSlug(name);

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submissionLocked.current) return;

    submissionLocked.current = true;
    setIsSubmitting(true);
    setSubmitError(undefined);
    const formData = new FormData(e.currentTarget);
    const additionalValues: Record<string, unknown> = {};
    try {
      for (const field of additionalFields) {
        const value = parseAdditionalFieldValue(
          field,
          formData.get(field.name) as string | null,
        );
        await field.validate?.(value);
        if (value !== undefined) additionalValues[field.name] = value;
      }
    } catch (error) {
      submissionLocked.current = false;
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : String(error));
      return;
    }
    createOrganization({ name, slug: effectiveSlug, ...additionalValues });
  };

  const isPending = isCreating || isSubmitting;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSlug("");
      setName("");
      setSlugEdited(false);
      setNameError(undefined);
      setSubmitError(undefined);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>
              <Briefcase />
              {organizationLocalization.createOrganization}
            </DialogTitle>

            <DialogDescription>
              {organizationLocalization.organizationsDescription}
            </DialogDescription>
          </DialogHeader>

          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>Couldn’t create workspace</AlertTitle>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4">
            <Field data-invalid={!!nameError}>
              <FieldLabel htmlFor="create-organization-name">
                {organizationLocalization.name}
              </FieldLabel>

              <Input
                id="create-organization-name"
                name="name"
                autoFocus
                required
                placeholder={organizationLocalization.namePlaceholder}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(undefined);
                }}
                onInvalid={(e) => {
                  e.preventDefault();
                  setNameError(localization.auth.fieldRequired);
                }}
                aria-invalid={!!nameError}
                disabled={isPending}
              />

              <FieldError>{nameError}</FieldError>
            </Field>

            <SlugField
              id="create-organization-slug"
              value={slug}
              onChange={(value) => {
                setSlug(value);
                setSlugEdited(true);
              }}
              disabled={isPending}
            />

            {additionalFields.map((field) => (
              <AdditionalField
                key={field.name}
                field={field}
                isPending={isPending}
                name={field.name}
                optionalLabel={localization.settings.optional}
              />
            ))}
          </div>

          <DialogFooter>
            <DialogClose
              className={buttonVariants({ variant: "outline" })}
              disabled={isPending}
              type="button"
            >
              {localization.settings.cancel}
            </DialogClose>

            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}

              {organizationLocalization.createOrganization}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
