export type ConnectedAppDefinition = {
  providerId: string;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  setup: string;
  readyToConnect: boolean;
};

/**
 * App entries are deliberately backed by an executable connector. OAuth
 * provider configuration alone is not enough to appear in this catalog.
 */
export const CONNECTED_APP_CATALOG: readonly ConnectedAppDefinition[] = [
  {
    providerId: "github-repo",
    name: "GitHub",
    description:
      "Read repositories, repository metadata, and public or authorized search results.",
    capabilities: ["read"],
    tools: [
      "githubListRepositories",
      "githubGetRepository",
      "githubSearchRepositories",
    ],
    setup:
      "Authorize GitHub from the app connector panel. The connector exposes read-only operations.",
    readyToConnect: Boolean(
      process.env.GITHUB_REPO_CLIENT_ID?.trim() &&
      process.env.GITHUB_REPO_CLIENT_SECRET?.trim(),
    ),
  },
];

export type ConnectedAppSummary = ConnectedAppDefinition & {
  id: string;
  type: "app";
  status: "connected" | "needs_reconnect";
  connectionId: string;
  accountLabel: string;
};

export function getConnectedAppDefinition(providerId: string) {
  return CONNECTED_APP_CATALOG.find(
    (definition) => definition.providerId === providerId,
  );
}
