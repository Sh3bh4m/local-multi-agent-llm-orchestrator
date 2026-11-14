# Security and responsible usage

This repository is a local demonstration using fictional records.

- Do not connect real business systems without a separate security review.
- Do not commit API keys, customer records, credentials, or private URLs.
- Do not expose the local development server directly to the internet.
- The demo has no authentication, user isolation or abuse controls. Do not deploy it as a public service, including through a tunnel or reverse proxy.
- Keep local model APIs bound to trusted local interfaces; the example API keys are placeholders only for unauthenticated local endpoints.
- Review screenshots before sharing: crop out credentials, private application windows, file paths and personal notifications.
- Tool access is scoped by specialist role.
- Tool results and execution traces may contain sensitive information
  if the application is adapted to real data.
- Model output should never authorize business transactions on its own.