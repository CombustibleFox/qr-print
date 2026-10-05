# qr-print
Prints out (To a label printer) a user's device fingerprint after scanning a QR code

Label kiosk

Deploy (free Cloudflare account): npm i -g wrangler wrangler login wrangler deploy

Edit KIOSK_KEY in src/index.js first (and enter the same key on the kiosk page).
QR code -> https://label-kiosk.<you>.workers.dev/
Kiosk iPhone: open /print.html in Bluefy, enter the UUIDs from nRF Connect, Pair, Test print, Start.
