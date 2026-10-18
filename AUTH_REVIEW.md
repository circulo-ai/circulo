# Authentication Review

Reviewed the authentication path across the cloud, self-hosted, and desktop
runtimes, including runtime detection, account provisioning, instance signup
policy, OAuth provider configuration, browser auth UI, trusted origins, and the
desktop app's same-origin API proxy.

## Findings fixed

### Runtime detection could leave desktop and self-hosted sign-in in cloud mode

The browser previously made one request to `/api/instance/info` and defaulted
to cloud mode if the local server was still starting. In that state the
password-based account setup used by desktop and self-hosted installations was
hidden. The client now starts from the build's runtime kind and retries
transient instance-info failures with capped backoff. A successful response
from the server remains authoritative.

### The account UI did not reflect the local signup policy

The server already enforces the bootstrap and administrator-controlled signup
policy when creating users, but the browser exposed signup links after the
administrator closed registration. The client now reads the public instance
policy, hides signup links when registration is closed, and renders a clear
closed-registration page for direct signup URLs. Existing users can still sign
in. The server-side provisioning check remains the enforcement boundary.

### OAuth could be advertised without usable credentials

The Google provider was always added to Better Auth and always displayed in the
browser, even when deployments had no client ID or secret. Google is now
configured only when both credentials are present. `/instance/info` returns
the enabled provider identifiers, without exposing secrets, and the browser
only renders providers the server has enabled.

### Production trusted origins included development hosts

The production auth configuration trusted localhost development origins and
accepted raw comma-separated CORS entries. Origins are now normalized and
validated, production only trusts the configured app, auth, and CORS origins,
and development localhost origins are added only outside production.

## Runtime behavior

| Runtime     | Sign-in                                                           | New accounts                                                                                     | OAuth                                                  |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Cloud       | Email OTP and magic link; password auth stays disabled            | Cloud policy through Better Auth                                                                 | Google only when both OAuth credentials are configured |
| Self-hosted | Local email and password; existing accounts remain usable offline | Initial account is atomically claimed as administrator; later signup follows the instance policy | Google only when configured                            |
| Desktop     | Local email and password against the embedded server and database | Initial account is atomically claimed as administrator; later signup follows the instance policy | Google only when configured                            |

Desktop auth calls continue through the web app's same-origin `/api` proxy, so
the browser does not need cross-origin session cookies between the Electron
renderer and its embedded API.

## Verification

The focused provider-capability and trusted-origin tests cover absent and
partial OAuth credentials, origin normalization, rejecting URL paths and
credentials, and production versus development origin sets. The server and
web type checks and production web build passed. The full server suite passed
199 tests with a 15-second test timeout. The PDF parser test exceeded the
default 5-second timeout once under full-suite load, then passed both in
isolation and on the full-suite rerun. The focused authentication tests passed
independently.
