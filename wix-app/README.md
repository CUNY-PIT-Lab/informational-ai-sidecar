# Wix app subset

This directory contains the Wix-facing part of the Digital Equity guide. It is designed for a private Wix app with three pieces:

1. A dashboard page lets a site administrator enter or replace the model provider key.
2. An administrator-only backend method writes that value to the site's Wix Secrets Manager under `fortuneGuideOllamaKey`.
3. A site-wide embedded script loads the guide element. Visitor questions go to backend chat code, which retrieves the secret and calls the provider without returning the key to the browser.

The provider key does not belong in an embedded script, site widget property, page code, repository secret that is copied into a bundle, browser storage, query string, or chat request. The dashboard form keeps the value in its password field only until the administrator submits it. The form clears the field after the backend confirms storage.

## Why this is a Wix app rather than a site plugin

Wix uses “site plugin” for components that occupy slots inside Wix business apps such as Stores and Bookings. The Digital Equity guide needs a fixed, site-wide presence, so an embedded script extension is the closer Wix extension type. A custom element site widget remains available when Fortune wants editors to place the guide inside selected page layouts.

## Directory map

```text
wix-app/
├── dashboard/
│   ├── provider-settings.html
│   └── provider-settings.js
├── site/
│   ├── embed.html
│   └── fortune-guide-element.js
└── velo-backend/
    ├── provider-config.web.js
    └── provider-secret.js
```

- `dashboard/` is the administrator-only key setup surface. A generated Wix dashboard extension supplies `window.FortuneWixAdmin` with `status()` and `saveProviderKey(value)` functions backed by `provider-config.web.js`.
- `site/` contains the visitor-facing custom element and the `BODY_END` fragment for an embedded script extension.
- `velo-backend/provider-config.web.js` uses `Permissions.Admin`, Wix Secrets API v2, and elevated calls to create or update the site secret.
- `velo-backend/provider-secret.js` is backend-only. Chat code imports it and uses the returned value in the provider request. It must never be re-exported through a web method.

## Attach it to a Wix site

1. Create or open a private app in Wix Studio and generate a dashboard page plus an embedded script extension with the Wix CLI.
2. Request the **Manage Secrets** app permission. Wix currently requires Members Area before code can create or manage a site secret. Secret retrieval does not require Members Area.
3. Copy the dashboard and backend modules into the generated project. Bind the generated dashboard page to `provider-settings.html` and supply its adapter with the two administrator-only web methods.
4. Add `site/embed.html` to the embedded script extension at `BODY_END`. Host `fortune-guide-element.js` through the generated app or another approved HTTPS asset host.
5. Connect the visitor element to a Wix backend chat endpoint that imports `getProviderKey()` from `provider-secret.js`, runs the same privacy and source checks as `server.py`, and returns only the bounded response contract.
6. Build and release the app version, install it through its direct install URL, then verify the dashboard setup page and a published test site before attaching it to Fortune's production site.

The repository omits Wix-generated app, component, and extension IDs because they belong to the app created in the owner's Wix account.

## Required review

- Confirm that only an Admin, Co-Owner, or Website Manager can reach the provider settings page.
- Confirm that the `saveProviderKey` web method has `Permissions.Admin`.
- Confirm that the secret value never appears in a browser response, page source, network URL, application log, or error message.
- Confirm that visitor text reaches the provider only after the same personal-information hold, current-page retrieval, and source-authority checks used in `server.py`.
- Confirm that the provider key can be replaced and that the old value is no longer accepted.
- Confirm that duplicating a Wix site does not carry the secret to the duplicate. Wix documents that site duplication does not copy Secrets Manager values.

## Wix references

- [About the Secrets API](https://dev.wix.com/docs/velo/apis/wix-secrets-backend-v2/introduction)
- [Create and update secrets](https://dev.wix.com/docs/velo/apis/wix-secrets-backend-v2/secrets/create-secret)
- [Security best practices](https://dev.wix.com/docs/develop-websites/articles/best-practices/security-best-practices)
- [Embedded script extensions](https://dev.wix.com/docs/build-apps/develop-your-app/frameworks/self-hosting/supported-extensions/site-extensions/embedded-scripts/add-an-embedded-script-extension-to-a-self-hosted-app)
- [Site widget extensions](https://dev.wix.com/docs/build-apps/develop-your-app/extensions/site-extensions/site-widgets/about-site-widget-extensions)
