# Security

Report a vulnerability through [GitHub private vulnerability reporting](https://github.com/hamzahamidi/google-maps-rest/security/advisories/new). Do not open a public issue for it.

Expect an acknowledgement within 7 days. A fix ships as a patch release of the latest major version, and the advisory is published once the release is on npm.

The client sends your API key in an `X-Goog-Api-Key` header to `*.googleapis.com` only, or to the origin your `resolveOrigin` option returns. It stores nothing and logs nothing.
