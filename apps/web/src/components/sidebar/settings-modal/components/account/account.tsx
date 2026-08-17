"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FileInput } from "@/components/uploads/file-input";
import { useUploadTaskManager } from "@/hooks/use-upload-task-manager";
import { signOut, useSession } from "@/lib/auth-client";
import { useBrandConfig } from "@/lib/branding/branding";
import { createLogger } from "@/lib/logs/console/logger";
import { clearUserData } from "@/stores";
import { Camera, UserIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const logger = createLogger("Account");

interface AccountProps {
  onOpenChange: (open: boolean) => void;
}

export function Account(_props: AccountProps) {
  const router = useRouter();
  const brandConfig = useBrandConfig();

  const { data: session, isPending } = useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userImage, setUserImage] = useState<string | null>(null);

  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadManager = useUploadTaskManager({
    defaultStorageContext: "profile-pictures",
    onTaskComplete: async (task) => {
      if (task.status === "success") {
        try {
          await updateUserImage(task.url || null);
          setUploadError(null);
        } catch (_err) {
          setUploadError("Failed to update profile picture");
        }
      } else if (task.status === "error") {
        setUploadError(task.error || "Failed to upload profile picture");
      }
    },
  });

  const activeProfileImage =
    uploadManager.uploadTasks.find((task) => task.status === "success")?.url ||
    uploadManager.uploadTasks.find((task) => task.status === "uploading")
      ?.url ||
    userImage;

  const updateUserImage = async (imageUrl: string | null) => {
    try {
      const response = await fetch("/api/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update profile picture");
      }

      setUserImage(imageUrl);
    } catch (error) {
      logger.error("Error updating profile image:", error);
      throw error;
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) return;

      setIsLoadingProfile(true);

      try {
        const response = await fetch("/api/users/me/profile");
        if (!response.ok) {
          throw new Error("Failed to fetch profile");
        }

        const data = await response.json();
        setName(data.user.name);
        setEmail(data.user.email);
        setUserImage(data.user.image);
      } catch (error) {
        logger.error("Error fetching profile:", error);
        if (session?.user) {
          setName(session.user.name || "");
          setEmail(session.user.email || "");
          setUserImage(session.user.image || null);
        }
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchProfile();
  }, [session]);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleUpdateName = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    if (trimmedName === (session?.user?.name || "")) {
      setIsEditingName(false);
      return;
    }

    setIsUpdatingName(true);

    try {
      const response = await fetch("/api/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update name");
      }

      setIsEditingName(false);
    } catch (error) {
      logger.error("Error updating name:", error);
      setName(session?.user?.name || "");
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleUpdateName();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setName(session?.user?.name || "");
  };

  const handleInputBlur = () => {
    handleUpdateName();
  };

  const handleSignOut = async () => {
    try {
      await Promise.all([signOut(), clearUserData()]);
      router.push("/auth/sign-in?fromLogout=true");
    } catch (error) {
      logger.error("Error signing out:", { error });
      router.push("/auth/sign-in?fromLogout=true");
    }
  };

  return (
    <div className="px-6 pt-4 pb-4">
      <div className="flex flex-col gap-4">
        {isLoadingProfile || isPending ? (
          <>
            {/* User Info Section Skeleton */}
            <div className="flex items-center gap-4">
              {/* User Avatar Skeleton */}
              <Skeleton className="h-10 w-10 rounded-full" />

              {/* User Details Skeleton */}
              <div className="flex flex-col">
                <Skeleton className="mb-1 h-5 w-32" />
                <Skeleton className="h-5 w-48" />
              </div>
            </div>

            {/* Name Field Skeleton */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-16" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-5 w-[42px]" />
              </div>
            </div>

            {/* Email Field Skeleton */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-48" />
            </div>

            {/* Sign Out Button Skeleton */}
            <div>
              <Skeleton className="h-8 w-[71px] rounded-xl" />
            </div>
          </>
        ) : (
          <>
            {/* User Info Section */}
            <div className="flex items-center gap-4">
              {/* Profile Picture Upload */}
              <div className="relative">
                <FileInput
                  className="h-12 w-12 rounded-full!"
                  accept="image/png, image/jpeg, image/jpg"
                  multiple={false}
                  useUploadTaskManagerProps={{
                    defaultStorageContext: "profile-pictures",
                  }}
                  disabled={uploadManager.hasActiveUploads}
                  onChange={(value) => {
                    if (typeof value === "string") {
                      void updateUserImage(value).catch(() => {
                        setUploadError("Failed to update profile picture");
                      });
                    }
                  }}
                  customComponent={({}) => (
                    <div className="group relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#802FFF] transition-all hover:opacity-80">
                      {(() => {
                        const imageUrl =
                          activeProfileImage || brandConfig.logoUrl;
                        return imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={name || "User"}
                            width={48}
                            height={48}
                            loader={({ src }) => src}
                            unoptimized
                            className={`h-full w-full object-cover transition-opacity duration-300 ${
                              uploadManager.hasActiveUploads
                                ? "opacity-50"
                                : "opacity-100"
                            }`}
                          />
                        ) : (
                          <UserIcon className="h-6 w-6 text-white" />
                        );
                      })()}

                      <div
                        className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/50 transition-opacity ${
                          uploadManager.hasActiveUploads
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        {uploadManager.hasActiveUploads ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Camera className="h-5 w-5 text-white" />
                        )}
                      </div>
                    </div>
                  )}
                />
              </div>

              {/* User Details */}
              <div className="flex flex-1 flex-col justify-center">
                <h3 className="text-base font-medium">{name}</h3>
                <p className="text-sm font-normal text-muted-foreground">
                  {email}
                </p>
                {uploadError && (
                  <p className="mt-1 text-xs text-destructive">{uploadError}</p>
                )}
              </div>
            </div>

            {/* {uploadManager.uploadTasks.length > 0 && (
              <UploadList
                items={uploadManager.uploadTasks}
                onCancel={uploadManager.cancelUploadTask}
                onRetry={uploadManager.retryUploadTask}
                onRemove={(id) => {
                  uploadManager.removeUploadTask(id);
                  if (uploadManager.uploadTasks.length === 0) {
                    void updateUserImage(null);
                  }
                }}
                hideProgress={false}
              />
            )} */}

            {/* Name Field */}
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="name"
                className="text-sm font-normal text-muted-foreground"
              >
                Name
              </Label>
              {isEditingName ? (
                <input
                  ref={inputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleInputBlur}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base outline-none focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
                  maxLength={100}
                  disabled={isUpdatingName}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              ) : (
                <div className="flex items-center gap-4">
                  <span className="text-base">{name}</span>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 text-sm font-normal text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
                    onClick={() => setIsEditingName(true)}
                  >
                    update
                    <span className="sr-only">Update name</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Email Field - Read Only */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-normal text-muted-foreground">
                Email
              </Label>
              <p className="text-base">{email}</p>
            </div>

            {/* Sign Out Button */}
            <div>
              <Button
                onClick={handleSignOut}
                variant="destructive"
                className="h-8 rounded-xl bg-red-500 text-white transition-all duration-200 hover:bg-red-600"
              >
                Sign Out
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
