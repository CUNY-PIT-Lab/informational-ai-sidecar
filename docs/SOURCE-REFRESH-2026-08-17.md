# Public source refresh — 2026-08-17

## Result

The live Wix inventory was refreshed from the public sitemap and blog feed, reviewed against the prior approved inventory, and captured atomically. The accepted source index contains 138 canonical routes: 90 answer, 18 excluded, 21 archive, and 9 navigation. The full replica contains 138 HTTP 200 pages at one Wix published revision, **2063**, captured at `2026-08-17T21:50:14.835Z`.

The prior source was generated at `2026-08-08T19:34:51+00:00` with 200 routes and authority counts `{"answer":143,"excluded":27,"archive":21,"navigation":9}`. The refreshed index was generated at `2026-08-17T21:41:52+00:00`.

## Authority review

- `/workshops` is current answer authority and replaces the absent `/trainings` source route.
- `/support` is current answer authority and replaces the absent `/individual` source route.
- `/workshops/staff` is explicitly excluded because the live title marks it inactive.
- All newly discovered routes remain excluded pending Fortune review; none was auto-promoted.
- News category and pagination pages remain navigation-only; news posts remain archive-only.
- No answer-authority page has a failed status, inactive title, news/profile kind, staging/test path, or absent public route.
- `knowledge.json` retains stable routing IDs and provenance but no compact factual strings. Its core records merge with the matching live `site-index.json` blocks, preventing prior laptop-referral, support-hours, workshop-taxonomy, calendar, or contact copy from overriding the current site.

## FAQ URL changes

| URL | Change | Questions | Content hash |
| --- | --- | ---: | --- |
| `https://www.fortunedigitalequity.org/` | changed | 1 → 4 | `2eb70fdf59f7` → `e862583c6c7e` |
| `https://www.fortunedigitalequity.org/contact` | FAQ added to existing changed page | 0 → 4 | `29d35482bd4b` → `19e99c22420b` |

The current four-question FAQ covers rolling versus multi-part attendance, walk-in versus required registration, one-to-one help for topics outside the catalog/calendar, and the current five-class laptop-referral threshold. The report records source changes only; it does not embed participant-facing response copy.

## Site topology

Added (9):

- `https://www.fortunedigitalequity.org/catalog`
- `https://www.fortunedigitalequity.org/mediakit`
- `https://www.fortunedigitalequity.org/pdf/upload-practice`
- `https://www.fortunedigitalequity.org/service-page/app-essentials-smart-features`
- `https://www.fortunedigitalequity.org/service-page/intro-to-ai-pt-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-ai-pt-2`
- `https://www.fortunedigitalequity.org/techfair/contest`
- `https://www.fortunedigitalequity.org/techfair/photos`
- `https://www.fortunedigitalequity.org/workshops/staff`

Removed (71):

- `https://www.fortunedigitalequity.org/about/partners`
- `https://www.fortunedigitalequity.org/acp`
- `https://www.fortunedigitalequity.org/assessments`
- `https://www.fortunedigitalequity.org/calendar/test`
- `https://www.fortunedigitalequity.org/calendar/test-calendy`
- `https://www.fortunedigitalequity.org/file-share`
- `https://www.fortunedigitalequity.org/groups`
- `https://www.fortunedigitalequity.org/grow`
- `https://www.fortunedigitalequity.org/home-old`
- `https://www.fortunedigitalequity.org/media`
- `https://www.fortunedigitalequity.org/pdf2-upload`
- `https://www.fortunedigitalequity.org/profile/abarnes/profile`
- `https://www.fortunedigitalequity.org/profile/awhaley/profile`
- `https://www.fortunedigitalequity.org/profile/jschwartz/profile`
- `https://www.fortunedigitalequity.org/profile/wwaters/profile`
- `https://www.fortunedigitalequity.org/reserve`
- `https://www.fortunedigitalequity.org/service-page/advanced-email`
- `https://www.fortunedigitalequity.org/service-page/being-a-smart-content-consumer`
- `https://www.fortunedigitalequity.org/service-page/being-a-smart-tech-consumer`
- `https://www.fortunedigitalequity.org/service-page/digital-brand-management`
- `https://www.fortunedigitalequity.org/service-page/digital-photography-archive`
- `https://www.fortunedigitalequity.org/service-page/digital-photography-with-smartphones-1`
- `https://www.fortunedigitalequity.org/service-page/digital-reputation-management`
- `https://www.fortunedigitalequity.org/service-page/essential-smartphone-tools`
- `https://www.fortunedigitalequity.org/service-page/family-robot-building-day`
- `https://www.fortunedigitalequity.org/service-page/google-drive-calendar-for-smartphones`
- `https://www.fortunedigitalequity.org/service-page/identity-theft-how-to-minimize-risk`
- `https://www.fortunedigitalequity.org/service-page/identity-theft-how-to-minimize-risk-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-adobe-photoshop`
- `https://www.fortunedigitalequity.org/service-page/intro-to-artificial-intelligence-pt-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-artificial-intelligence-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-canva`
- `https://www.fortunedigitalequity.org/service-page/intro-to-computers`
- `https://www.fortunedigitalequity.org/service-page/intro-to-email-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-file-print-management`
- `https://www.fortunedigitalequity.org/service-page/intro-to-google-drive-calendar`
- `https://www.fortunedigitalequity.org/service-page/intro-to-robotics-archive-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-robotics-archive-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-smartphones-tablets`
- `https://www.fortunedigitalequity.org/service-page/intro-to-smartphones-tablets-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-the-cloud`
- `https://www.fortunedigitalequity.org/service-page/intro-to-the-google-suite-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-windows-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-windows-desktop`
- `https://www.fortunedigitalequity.org/service-page/intro-to-windows-navigation`
- `https://www.fortunedigitalequity.org/service-page/linkedin-for-smartphones`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-charts`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-conditional-formatting`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-data`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-functions`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-macros`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-pivot-tables`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-tables`
- `https://www.fortunedigitalequity.org/service-page/microsoft-powerpoint-advanced`
- `https://www.fortunedigitalequity.org/service-page/microsoft-powerpoint-themes-templates`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-associate-certification`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-macros`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-mail-merge`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-styles`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-tables`
- `https://www.fortunedigitalequity.org/service-page/mobile-browsing-file-management`
- `https://www.fortunedigitalequity.org/service-page/resume-writing-in-an-ai-world`
- `https://www.fortunedigitalequity.org/service-page/smart-features-mobile-ai`
- `https://www.fortunedigitalequity.org/service-page/the-beekeeper`
- `https://www.fortunedigitalequity.org/service-page/transitioning-jpay-to-android-tablets`
- `https://www.fortunedigitalequity.org/service-page/word-docs-for-smartphones`
- `https://www.fortunedigitalequity.org/service-page/zoom-google-meet-for-smartphones`
- `https://www.fortunedigitalequity.org/staff`
- `https://www.fortunedigitalequity.org/techfair/logocontest`
- `https://www.fortunedigitalequity.org/techfair/share`
- `https://www.fortunedigitalequity.org/workshops/list-tests`

Retained routes with changed public content hashes: 95.

## Workshop and catalog URLs

Added (5):

- `https://www.fortunedigitalequity.org/catalog`
- `https://www.fortunedigitalequity.org/service-page/app-essentials-smart-features`
- `https://www.fortunedigitalequity.org/service-page/intro-to-ai-pt-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-ai-pt-2`
- `https://www.fortunedigitalequity.org/workshops/staff`

Removed (52):

- `https://www.fortunedigitalequity.org/service-page/advanced-email`
- `https://www.fortunedigitalequity.org/service-page/being-a-smart-content-consumer`
- `https://www.fortunedigitalequity.org/service-page/being-a-smart-tech-consumer`
- `https://www.fortunedigitalequity.org/service-page/digital-brand-management`
- `https://www.fortunedigitalequity.org/service-page/digital-photography-archive`
- `https://www.fortunedigitalequity.org/service-page/digital-photography-with-smartphones-1`
- `https://www.fortunedigitalequity.org/service-page/digital-reputation-management`
- `https://www.fortunedigitalequity.org/service-page/essential-smartphone-tools`
- `https://www.fortunedigitalequity.org/service-page/family-robot-building-day`
- `https://www.fortunedigitalequity.org/service-page/google-drive-calendar-for-smartphones`
- `https://www.fortunedigitalequity.org/service-page/identity-theft-how-to-minimize-risk`
- `https://www.fortunedigitalequity.org/service-page/identity-theft-how-to-minimize-risk-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-adobe-photoshop`
- `https://www.fortunedigitalequity.org/service-page/intro-to-artificial-intelligence-pt-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-artificial-intelligence-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-canva`
- `https://www.fortunedigitalequity.org/service-page/intro-to-computers`
- `https://www.fortunedigitalequity.org/service-page/intro-to-email-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-file-print-management`
- `https://www.fortunedigitalequity.org/service-page/intro-to-google-drive-calendar`
- `https://www.fortunedigitalequity.org/service-page/intro-to-robotics-archive-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-robotics-archive-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-smartphones-tablets`
- `https://www.fortunedigitalequity.org/service-page/intro-to-smartphones-tablets-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-the-cloud`
- `https://www.fortunedigitalequity.org/service-page/intro-to-the-google-suite-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-windows-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-windows-desktop`
- `https://www.fortunedigitalequity.org/service-page/intro-to-windows-navigation`
- `https://www.fortunedigitalequity.org/service-page/linkedin-for-smartphones`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-charts`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-conditional-formatting`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-data`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-functions`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-macros`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-pivot-tables`
- `https://www.fortunedigitalequity.org/service-page/microsoft-excel-tables`
- `https://www.fortunedigitalequity.org/service-page/microsoft-powerpoint-advanced`
- `https://www.fortunedigitalequity.org/service-page/microsoft-powerpoint-themes-templates`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-associate-certification`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-macros`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-mail-merge`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-styles`
- `https://www.fortunedigitalequity.org/service-page/microsoft-word-tables`
- `https://www.fortunedigitalequity.org/service-page/mobile-browsing-file-management`
- `https://www.fortunedigitalequity.org/service-page/resume-writing-in-an-ai-world`
- `https://www.fortunedigitalequity.org/service-page/smart-features-mobile-ai`
- `https://www.fortunedigitalequity.org/service-page/the-beekeeper`
- `https://www.fortunedigitalequity.org/service-page/transitioning-jpay-to-android-tablets`
- `https://www.fortunedigitalequity.org/service-page/word-docs-for-smartphones`
- `https://www.fortunedigitalequity.org/service-page/zoom-google-meet-for-smartphones`
- `https://www.fortunedigitalequity.org/workshops/list-tests`

Changed (75):

- `https://www.fortunedigitalequity.org/service-page/alfabetización-digital-básica-en-español`
- `https://www.fortunedigitalequity.org/service-page/app-essentials-contacts-communication`
- `https://www.fortunedigitalequity.org/service-page/app-essentials-managing-your-time`
- `https://www.fortunedigitalequity.org/service-page/app-essentials-navigating-safely`
- `https://www.fortunedigitalequity.org/service-page/app-essentials-transactions-access`
- `https://www.fortunedigitalequity.org/service-page/canva-content-workflows`
- `https://www.fortunedigitalequity.org/service-page/canva-design-tools`
- `https://www.fortunedigitalequity.org/service-page/customizing-your-smartphone`
- `https://www.fortunedigitalequity.org/service-page/digital-branding-capstone-day`
- `https://www.fortunedigitalequity.org/service-page/digital-color-concepts-codes`
- `https://www.fortunedigitalequity.org/service-page/digital-discussion-group`
- `https://www.fortunedigitalequity.org/service-page/digital-safety-computers`
- `https://www.fortunedigitalequity.org/service-page/digital-safety-email`
- `https://www.fortunedigitalequity.org/service-page/digital-safety-mobile-devices`
- `https://www.fortunedigitalequity.org/service-page/digital-safety-online`
- `https://www.fortunedigitalequity.org/service-page/excel-capstone-day`
- `https://www.fortunedigitalequity.org/service-page/excel-formatting-data`
- `https://www.fortunedigitalequity.org/service-page/excel-formulas-functions`
- `https://www.fortunedigitalequity.org/service-page/excel-organizing-data`
- `https://www.fortunedigitalequity.org/service-page/excel-presenting-data`
- `https://www.fortunedigitalequity.org/service-page/exploring-events-in-sched`
- `https://www.fortunedigitalequity.org/service-page/google-docs-collaborating`
- `https://www.fortunedigitalequity.org/service-page/google-sheets-collaborating`
- `https://www.fortunedigitalequity.org/service-page/intro-to-ai-art`
- `https://www.fortunedigitalequity.org/service-page/intro-to-ai-art-pt-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-coursera`
- `https://www.fortunedigitalequity.org/service-page/intro-to-drones`
- `https://www.fortunedigitalequity.org/service-page/intro-to-email`
- `https://www.fortunedigitalequity.org/service-page/intro-to-fortune-digital-equity`
- `https://www.fortunedigitalequity.org/service-page/intro-to-google-meet-ms-teams`
- `https://www.fortunedigitalequity.org/service-page/intro-to-google-sites`
- `https://www.fortunedigitalequity.org/service-page/intro-to-microsoft-excel`
- `https://www.fortunedigitalequity.org/service-page/intro-to-microsoft-powerpoint-1`
- `https://www.fortunedigitalequity.org/service-page/intro-to-microsoft-word`
- `https://www.fortunedigitalequity.org/service-page/intro-to-robotics-2`
- `https://www.fortunedigitalequity.org/service-page/intro-to-the-google-suite`
- `https://www.fortunedigitalequity.org/service-page/intro-to-zoom-google-meet`
- `https://www.fortunedigitalequity.org/service-page/job-searching-online`
- `https://www.fortunedigitalequity.org/service-page/linkedin-networking-strategies`
- `https://www.fortunedigitalequity.org/service-page/linkedin-profile-foundations`
- `https://www.fortunedigitalequity.org/service-page/managing-your-smartphone`
- `https://www.fortunedigitalequity.org/service-page/mobile-computing-capstone-day`
- `https://www.fortunedigitalequity.org/service-page/navigating-internet-browsers`
- `https://www.fortunedigitalequity.org/service-page/navigating-the-cloud`
- `https://www.fortunedigitalequity.org/service-page/navigating-windows-desktop`
- `https://www.fortunedigitalequity.org/service-page/navigating-your-smartphone`
- `https://www.fortunedigitalequity.org/service-page/open-computer-lab-session`
- `https://www.fortunedigitalequity.org/service-page/personalizing-events-in-sched`
- `https://www.fortunedigitalequity.org/service-page/powerpoint-capstone-day`
- `https://www.fortunedigitalequity.org/service-page/powerpoint-laying-out-themes`
- `https://www.fortunedigitalequity.org/service-page/powerpoint-objects-images`
- `https://www.fortunedigitalequity.org/service-page/powerpoint-transitions-animations`
- `https://www.fortunedigitalequity.org/service-page/powerpoint-working-with-words`
- `https://www.fortunedigitalequity.org/service-page/robot-coders-101`
- `https://www.fortunedigitalequity.org/service-page/smartphone-photography-essentials`
- `https://www.fortunedigitalequity.org/service-page/smartphone-photography-techniques`
- `https://www.fortunedigitalequity.org/service-page/smartphone-professionalism`
- `https://www.fortunedigitalequity.org/service-page/tech-fair-capstone-day`
- `https://www.fortunedigitalequity.org/service-page/tech-time-focused`
- `https://www.fortunedigitalequity.org/service-page/tech-time-foundations-1`
- `https://www.fortunedigitalequity.org/service-page/the-canva-presentations-alternative`
- `https://www.fortunedigitalequity.org/service-page/the-digital-handshake`
- `https://www.fortunedigitalequity.org/service-page/the-google-docs-alternative`
- `https://www.fortunedigitalequity.org/service-page/the-google-sheets-alternative`
- `https://www.fortunedigitalequity.org/service-page/the-google-slides-alternative`
- `https://www.fortunedigitalequity.org/service-page/the-tech-fair-toolkit`
- `https://www.fortunedigitalequity.org/service-page/understanding-computers`
- `https://www.fortunedigitalequity.org/service-page/understanding-file-management`
- `https://www.fortunedigitalequity.org/service-page/understanding-keyboarding-mousing`
- `https://www.fortunedigitalequity.org/service-page/word-capstone-day`
- `https://www.fortunedigitalequity.org/service-page/word-finalizing-a-draft`
- `https://www.fortunedigitalequity.org/service-page/word-objects-images`
- `https://www.fortunedigitalequity.org/service-page/word-structuring-text`
- `https://www.fortunedigitalequity.org/service-page/word-working-with-text`
- `https://www.fortunedigitalequity.org/workshops`

No retained workshop/catalog URL kept the same content hash.

## Rollback and verification

The pre-refresh index, manifest, 200 compressed snapshots, raw Railway bundle, SHA-256 inventories, and the uncured 142-route crawl are preserved outside the repository at `/tmp/fortune-source-refresh-20260817.YfL2rb`.

Passed:

- `python3 scripts/build_pages.py --check-index` — 138 unique HTTPS routes.
- `python3 scripts/build_pages.py` — 138 indexed routes and 138 replica routes.
- `python3 -m unittest discover -s tests -p 'test_crawler.py'` — 15/15.
- `node --test tests/test_snapshot_generator.mjs` — 13/13.
- Isolated `scripts/unpack_deploy_snapshots.py` restore — 138 verified snapshots from the refreshed raw Railway bundle.
- Authority integrity and legacy-knowledge conflict assertions.

The complete shared suite is not yet green after the topology change: 199 Python tests ran with 18 failures and 5 errors. These failures identify stale route/count/fact expectations plus runtime routing constants for removed `/reserve`, `/trainings`, `/individual`, `/about/partners`, and removed class pages. The source refresh must not be released until those routing and test regressions are reconciled against the current URLs.

