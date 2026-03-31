/* One-off: merge service account JSON into .env — run: node scripts/inject-firebase-admin.cjs <path-to.json> */
const fs = require('fs')
const path = require('path')

const jsonPath = process.argv[2]
if (!jsonPath) {
  console.error('Usage: node scripts/inject-firebase-admin.cjs <service-account.json>')
  process.exit(1)
}

const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const esc = j.private_key.replace(/\r?\n/g, '\\n')
const envPath = path.join(__dirname, '..', '.env')
let e = fs.readFileSync(envPath, 'utf8')

e = e.replace(/FIREBASE_CLIENT_EMAIL="[^"]*"/, `FIREBASE_CLIENT_EMAIL="${j.client_email}"`)
e = e.replace(/FIREBASE_PRIVATE_KEY="[^"]*"/, `FIREBASE_PRIVATE_KEY="${esc.replace(/"/g, '\\"')}"`)

fs.writeFileSync(envPath, e)
console.log('Updated FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env')
