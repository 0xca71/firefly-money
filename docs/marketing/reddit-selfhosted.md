Where: r/selfhosted (use the "Finance Management"/"Release" flair if offered; check the sub's current AI/self-promo rules first)

Title: Money: a mobile-first front end for Firefly III with Apple Pay auto-logging (single nginx container, no DB)

Body:
I use Firefly III but wanted something quicker on my phone, so I built Money. It's a static web app plus nginx that talks to your existing Firefly through its API. No database, no cloud, no telemetry; the Firefly token stays server-side behind a password.

- Type `coffee 5.40 amex yesterday` and it fills in the form
- iPhone Shortcut logs each Apple Pay tap
- Safe to spend until payday, forecast, bills calendar, monthly recap
- 12 themes, installable as an app
- Docker compose, TrueNAS catalog, Unraid template

Demo with fake data, runs in the browser: https://muffy0906.github.io/firefly-money/
Repo (MIT): https://github.com/Muffy0906/firefly-money

Happy to answer questions. It's a solo project, so bug reports are very welcome.
