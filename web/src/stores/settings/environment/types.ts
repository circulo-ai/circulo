export interface EnvironmentVariable {
  key: string;
  value: string;
}

export interface EnvironmentState {
  variables: Record<string, EnvironmentVariable>;
  isLoading: boolean;
  error: string | null;
}

export interface EnvironmentStore extends EnvironmentState {
  loadEnvironmentVariables: () => Promise<void>;
  saveEnvironmentVariables: (
    variables: Record<string, string>,
  ) => Promise<void>;

  getAllVariables: () => Record<string, EnvironmentVariable>;
}
