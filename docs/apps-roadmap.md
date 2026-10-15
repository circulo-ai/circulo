# Circulo Apps: current support and next phase

Verified from the executable connector catalog on October 14, 2026.

## Available today

| App connector          | Executable tools                                                            | Access                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub (`github-repo`) | `githubListRepositories`, `githubGetRepository`, `githubSearchRepositories` | Read-only repository list, metadata and search. Requires separate repository OAuth configuration and a connected user account; chat connection allowlists and API-key app scopes apply. |

The Apps feature currently has one connector. GitHub sign-in is separate from authorizing this repository connector. A configured OAuth login provider alone does not create an executable App. Context7 is an MCP integration, and MCP recipes are not native App connectors.

## Recommended next phase

This priority order follows the requested research, files, knowledge and workflow workloads. These connectors are recommendations, not implemented features.

| Priority | Connector                                 | First useful operations                                                                    | Authorization and boundaries                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Google Drive / Docs / Sheets              | Find and read approved files; import knowledge; create reviewed drafts                     | OAuth with narrow file access, resource selection and incremental consent. [Google scopes](https://developers.google.com/identity/protocols/oauth2/scopes), [Workspace data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy). |
| 1        | Notion                                    | Search shared pages, read content and import knowledge; later create/update approved pages | Public OAuth with selected pages and explicit capabilities, refresh and revocation. [Notion authorization](https://developers.notion.com/guides/get-started/authorization).                                                                                            |
| 1        | Linear                                    | Read issues/projects; create follow-up drafts; update progress after approval              | OAuth scopes, organization isolation and user/app actor choice. [Linear OAuth](https://linear.app/developers/oauth-2-0-authentication).                                                                                                                                |
| 2        | Google Calendar / Gmail                   | Read upcoming events and authorized mail; draft communications                             | Incremental service scopes and provider verification requirements. Sending mail and changing events need explicit authorization. [Google scopes](https://developers.google.com/identity/protocols/oauth2/scopes).                                                      |
| 2        | Slack                                     | Read permitted conversations; summarize threads; draft/send approved updates               | OAuth installation with explicit bot/user scopes and channel restrictions. [Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/).                                                                                                                |
| 2        | Microsoft OneDrive / SharePoint / Outlook | Read approved files, mail and calendar events                                              | Graph delegated permissions, tenant consent and resource restrictions. Enterprise installations need administrator review. [Graph permissions](https://learn.microsoft.com/graph/permissions-reference).                                                               |
| 3        | Jira / Confluence                         | Read projects, issues and pages; create reviewed follow-ups                                | OAuth 2.0 3LO with operation-specific scopes and site/project restrictions. [Atlassian scopes](https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/).                                                                            |

## Connector release requirements

Every connector should ship token encryption, refresh/reconnect, revocation, account/tenant/resource isolation, executable tools, separate read/write scopes, explicit approval for consequential actions, pagination, provider rate-limit handling, durable operation evidence and integration tests. Only then should it appear as available in Apps. Private provider data remains source context and cannot expand permissions.
