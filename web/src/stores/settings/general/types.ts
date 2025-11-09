export interface General {
  telemetryEnabled: boolean
  isLoading: boolean
  error: string | null
  isTelemetryLoading: boolean
  isBillingUsageNotificationsLoading: boolean
  isBillingUsageNotificationsEnabled: boolean
}

export interface GeneralActions {
  setTelemetryEnabled: (enabled: boolean) => Promise<void>
  setBillingUsageNotificationsEnabled: (enabled: boolean) => Promise<void>
  loadSettings: (force?: boolean) => Promise<void>
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => Promise<void>
}

export type GeneralStore = General & GeneralActions

export type UserSettings = {
  telemetryEnabled: boolean
  isBillingUsageNotificationsEnabled: boolean
}
