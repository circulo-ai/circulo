export interface General {
  theme: "light" | "dark" | "system";
  isLoading: boolean;
  error: string | null;
}

export interface GeneralActions {
  loadSettings: (force?: boolean) => Promise<void>;
  updateSetting: <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => Promise<void>;
}

export type GeneralStore = General & GeneralActions;

export type UserSettings = {
  theme: "light" | "dark" | "system";
};
