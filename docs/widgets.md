# iPhone widget and Shortcuts: safe to spend, next bill

Money can hand your iPhone two numbers without opening the app: **how much is safe to spend today** and **when the next bill is due**. You get them as a Home Screen or Lock Screen widget (with the free [Scriptable](https://scriptable.app) app) or from a Shortcut (for Siri, a button, or an automation).

## What it is, and isn't

- Money asks Firefly each time and **keeps nothing**. When Firefly or Money can't be reached, the widget says so. It never shows old numbers.
- The estimate is plain and careful: bank balances, minus what you owe on credit cards, minus bills still due in the next 14 days, minus a $100 cushion. It doesn't count income that hasn't arrived, so it is usually lower than the Forecast page.
- The key only lets someone read these numbers. It can't add or change anything, and it isn't the Apple Pay key.
- Your iPhone must reach Money when the widget refreshes: on your home Wi-Fi that works, and away from home you need a VPN (Tailscale, WireGuard) or a reverse proxy with HTTPS. iOS decides how often a widget refreshes (roughly every 15 minutes or less).

## 1. Copy the address and key

In Money, open **Settings → Widgets** and copy the **Address** (ends in `/api/money-glance`) and the **Key**. Changing `DASH_PASSWORD` or `FIREFLY_TOKEN` gives a new key.

## 2a. Widget with Scriptable

1. Install **Scriptable**, tap **+**, and paste the script below. Put your address and key at the top.
2. On the Home Screen, add a **Scriptable** widget, tap it, and choose this script. Lock Screen widgets work too (small rectangular).

```js
const URL_ = "https://YOUR-MONEY-ADDRESS/api/money-glance"
const KEY = "YOUR-KEY"
const d = new Date(), pad = n => String(n).padStart(2, "0")
const today = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())

let line1 = "", line2 = "", ok = false
try {
  const req = new Request(URL_ + "?today=" + today)
  req.headers = { Authorization: "Bearer " + KEY }
  const g = await req.loadJSON()
  if (req.response.statusCode === 200 && g.ok) {
    ok = true
    const money = n => new Intl.NumberFormat(undefined, { style: "currency", currency: g.currency, maximumFractionDigits: 0 }).format(n)
    const b = g.nextBill
    line1 = money(g.safeToSpend)
    line2 = !b ? "No bills due" : b.overdue ? b.name + " overdue" : b.inDays === 0 ? b.name + " today" : b.name + " in " + b.inDays + "d"
  } else line1 = "Can't reach Firefly"
} catch (e) { line1 = "Can't reach Money" }

const w = new ListWidget()
w.backgroundColor = new Color("#161618")
const t = w.addText(ok ? "Safe to spend" : "Money")
t.font = Font.systemFont(12); t.textColor = Color.gray()
const a = w.addText(line1)
a.font = Font.boldSystemFont(ok ? 30 : 16); a.textColor = ok ? new Color("#39ff9f") : Color.orange(); a.minimumScaleFactor = 0.5
if (line2) { const c = w.addText(line2); c.font = Font.systemFont(13); c.textColor = Color.white() }
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000)
Script.setWidget(w)
if (!config.runsInWidget) await w.presentSmall()
Script.complete()
```

## 2b. Shortcut (Siri, a button, an automation)

1. In **Shortcuts**, make a new shortcut with **Get Contents of URL**.
2. URL: your address plus `?format=text` (for example `https://money.example/api/money-glance?format=text`). Method **GET**. Add a header **Authorization** with value `Bearer ` followed by your key.
3. Add **Show Result** (or **Speak Text**) after it. Name the shortcut "Safe to spend" and say "Hey Siri, safe to spend".
4. Optional: add `&today=` with the **Current Date** formatted as `yyyy-MM-dd` so "today" follows your time zone (the server uses its own).

The text answer reads like `$720 safe to spend · Rent in 3 days`. Drop `?format=text` for JSON with these fields: `safeToSpend`, `balance`, `cardsOwed`, `billsDue`, `currency`, `nextBill` (`name`, `date`, `inDays`, `amount`, `overdue`), `asOf` and `text`.

## Options

Add to the address: `days=` (1 to 60, default 14) for how far ahead bills count against today's money, `buffer=` (default 100) for the cushion, `today=YYYY-MM-DD` and `format=text`.

## Errors

- **401**: the key is wrong or out of date: copy it again from Settings → Widgets.
- **503**: Money can't reach Firefly. There are no numbers in the answer.
