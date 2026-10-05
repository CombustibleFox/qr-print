# qr-print
Prints out (To a label printer) a user's device fingerprint after scanning a QR code

Label kiosk

Deploy (free Cloudflare account): npm i -g wrangler wrangler login wrangler deploy

Set the kiosk key as a Worker secret (stored in Cloudflare, not in git): `wrangler secret put KIOSK_KEY`, then enter the same key on the kiosk page.
For `wrangler dev`, put `KIOSK_KEY=...` in a `.dev.vars` file (gitignored).
QR code -> https://qr-print.<you>.workers.dev/
Kiosk iPhone: open /print.html in Bluefy, enter the UUIDs from nRF Connect, Pair, Test print, Start.
