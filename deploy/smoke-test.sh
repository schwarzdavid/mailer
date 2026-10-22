#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
base=http://localhost:18080
mail_hostname=mail.smoke.test
smtp_url=smtp://localhost:18025/smoke-client.example.org
tmp=$(mktemp -d)

dc() {
    docker compose -p mailer-smoke --project-directory "$tmp" -f "$tmp/compose.yml" -f "$tmp/compose.smoke.yml" "$@"
}

cleanup() {
    local code=$?
    trap - EXIT
    dc down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$tmp"
    exit "$code"
}
trap cleanup EXIT

pass() {
    echo "PASS $1"
}

fail() {
    echo "FAIL $1" >&2
    exit 1
}

secret() {
    head -c 32 /dev/urandom | base64 | tr -d '\n'
}

request() {
    local method=$1 path=$2
    shift 2
    status=$(curl -sS -X "$method" -D "$tmp/headers.raw" -o "$tmp/body" -w '%{http_code}' "$@" "$base$path")
    tr -d '\r' <"$tmp/headers.raw" >"$tmp/headers"
    grep -qix 'x-robots-tag: noindex, nofollow' "$tmp/headers" || fail "$method $path lacks X-Robots-Tag: noindex, nofollow"
}

expect_status() {
    [ "$status" = "$1" ] || fail "$2: expected HTTP $1, got $status"
}

health() {
    local id
    id=$(dc ps -q "$1")
    if [ -z "$id" ]; then
        echo absent
        return
    fi
    docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || echo absent
}

wait_healthy() {
    local deadline=$((SECONDS + $2))
    while [ "$SECONDS" -lt "$deadline" ]; do
        [ "$(health "$1")" = healthy ] && return 0
        sleep 2
    done
    return 1
}

issue_leaf() {
    openssl req -new -newkey rsa:2048 -nodes -config "$tmp/pki/leaf.cnf" \
        -keyout "$1/$mail_hostname.key" -out "$tmp/pki/leaf.csr" 2>/dev/null
    openssl x509 -req -in "$tmp/pki/leaf.csr" -CA "$tmp/ca/ca.crt" -CAkey "$tmp/pki/ca.key" \
        -set_serial "0x$(openssl rand -hex 16)" -days 2 -extfile "$tmp/pki/leaf.cnf" -extensions leaf_ext \
        -out "$1/$mail_hostname.crt" 2>/dev/null
}

serial_of() {
    openssl x509 -noout -serial -in "$1"
}

served_smtp_serial() {
    openssl s_client -starttls smtp -connect localhost:18025 -servername "$mail_hostname" </dev/null 2>/dev/null |
        openssl x509 -noout -serial 2>/dev/null || true
}

served_imap_serial() {
    dc exec -T mail sh <<'SH' || true
openssl s_client -starttls imap -connect 127.0.0.1:143 -servername "$(hostname -f)" </dev/null 2>/dev/null |
    openssl x509 -noout -serial 2>/dev/null
SH
}

backend_node() {
    dc exec -T -e "SMOKE_DOMAIN=$mail_hostname" backend node --input-type=module
}

bounce_count() {
    dc exec -T postgres psql -U mailer -d mailer -tAc 'select count(*) from bounce' 2>/dev/null | tr -d '[:space:]'
}

cp "$script_dir/compose.yml" "$tmp/compose.yml"
cat >"$tmp/compose.smoke.yml" <<YML
services:
    mail:
        environment:
            SSL_CERT_PATH: /smoke-tls/$mail_hostname.crt
            SSL_KEY_PATH: /smoke-tls/$mail_hostname.key
        volumes:
            - ./tls:/smoke-tls:ro
    backend:
        environment:
            NODE_EXTRA_CA_CERTS: /smoke-ca/ca.crt
        volumes:
            - ./ca:/smoke-ca:ro
YML

mail_password=$(secret)
cat >"$tmp/.env" <<ENV
SITE_ADDRESS=:80
HTTP_PORT=18080
HTTPS_PORT=18443
SMTP_PUBLIC_PORT=18025
IMAGE_TAG=${IMAGE_TAG:-local}
DB_DATABASE=mailer
DB_USERNAME=mailer
DB_PASSWORD=$(secret)
BACKEND_JWT_SECRET=$(secret)
BACKEND_ENCRYPTION_SECRET=$(secret)
MAIL_HOSTNAME=$mail_hostname
MAIL_PASSWORD=$mail_password
ENV

mkdir -p "$tmp/pki" "$tmp/ca" "$tmp/tls" "$tmp/renew" "$tmp/tls-away"
cat >"$tmp/pki/ca.cnf" <<'CNF'
[req]
prompt = no
distinguished_name = dn
x509_extensions = ca_ext

[dn]
CN = Mailer Smoke CA

[ca_ext]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
CNF
cat >"$tmp/pki/leaf.cnf" <<CNF
[req]
prompt = no
distinguished_name = dn

[dn]
CN = $mail_hostname

[leaf_ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = DNS:$mail_hostname
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
CNF
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -config "$tmp/pki/ca.cnf" \
    -keyout "$tmp/pki/ca.key" -out "$tmp/ca/ca.crt" 2>/dev/null
issue_leaf "$tmp/tls"

mapfile -t app_services < <(dc config --services | tr -d '\r' | grep -vx mail)
dc up -d --pull missing --wait "${app_services[@]}"
pass "stack without mail is up and healthy"

dc up -d --pull missing mail || fail "mail service did not start"
dc exec -T mail setup email add "bounce@$mail_hostname" "$mail_password" || fail "creating the bounce account failed"
dc exec -T mail setup alias add "postmaster@$mail_hostname" "bounce@$mail_hostname" || fail "creating the postmaster alias failed"
wait_healthy mail 120 || fail "mail did not become healthy within 120 s"
pass "mail is up and healthy with the bounce account"

for _ in $(seq 1 30); do
    curl -sS -o /dev/null "$base/" 2>/dev/null && break
    sleep 1
done

request GET /
expect_status 200 "GET /"
grep -q '<div id="app">' "$tmp/body" || fail "GET / body lacks <div id=\"app\">"
cp "$tmp/body" "$tmp/index.html"
pass "GET / serves the SPA"

request GET /projects/5
expect_status 200 "GET /projects/5"
grep -q '<div id="app">' "$tmp/body" || fail "GET /projects/5 body lacks <div id=\"app\">"
pass "GET /projects/5 falls back to index.html"

request GET /
grep -i '^cache-control:.*no-cache' "$tmp/headers" >/dev/null || fail "GET / lacks Cache-Control: no-cache"
asset=$(grep -oE '/assets/[^"]+\.js' "$tmp/index.html" | sed -n 1p)
[ -n "$asset" ] || fail "index.html references no /assets/*.js"
request GET "$asset"
expect_status 200 "GET $asset"
grep -i '^cache-control:.*immutable' "$tmp/headers" >/dev/null || fail "GET $asset lacks Cache-Control: immutable"
pass "cache headers: no-cache for the shell, immutable for $asset"

request GET /assets/does-not-exist.js
expect_status 404 "GET /assets/does-not-exist.js"
if grep -qi '^cache-control:.*immutable' "$tmp/headers"; then
    fail "missing asset is served with Cache-Control: immutable"
fi
pass "missing asset returns 404 without immutable caching"

request GET /api/setup/status
expect_status 200 "GET /api/setup/status"
grep -qi '^content-type:.*application/json' "$tmp/headers" || fail "GET /api/setup/status is not JSON"
pass "GET /api/setup/status returns JSON"

request GET /docs
if grep -q 'swagger-ui' "$tmp/body"; then
    fail "GET /docs exposes swagger-ui"
fi
pass "GET /docs does not expose swagger-ui"

pass "every response carried X-Robots-Tag: noindex, nofollow"

for i in $(seq 1 11); do
    request POST /api/auth/login \
        -H 'Content-Type: application/json' \
        -H "X-Forwarded-For: 203.0.113.$i" \
        --data '{"email":"smoke@example.com","password":"wrong-password"}'
    if [ "$i" -le 10 ]; then
        expect_status 401 "login attempt $i"
    else
        expect_status 429 "login attempt $i"
    fi
done
pass "forged X-Forwarded-For does not evade the login throttle"

submission=$(backend_node <<'JS'
import { createTransport } from 'nodemailer'

const env = process.env
const domain = env.SMOKE_DOMAIN
if (env.SMTP_HOST !== 'mail' || env.SMTP_TLS_SERVERNAME !== domain || env.IMAP_TLS_SERVERNAME !== domain) {
    throw new Error(`unexpected mail settings: SMTP_HOST=${env.SMTP_HOST} SMTP_TLS_SERVERNAME=${env.SMTP_TLS_SERVERNAME} IMAP_TLS_SERVERNAME=${env.IMAP_TLS_SERVERNAME}`)
}
const options = {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === 'true',
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
}
const unnamed = createTransport(options)
try {
    await unnamed.verify()
    throw new Error(`certificate accepted for host ${env.SMTP_HOST} without a servername`)
} catch (error) {
    if (!/does not match certificate's altnames/.test(error.message)) {
        throw error
    }
    console.log(`without servername the certificate is refused: ${error.message}`)
} finally {
    unnamed.close()
}
const transport = createTransport({ ...options, tls: { servername: env.SMTP_TLS_SERVERNAME } })
const send = (from) =>
    transport.sendMail({
        envelope: { from, to: `bounce@${domain}` },
        from,
        to: `bounce@${domain}`,
        subject: 'smoke submission',
        text: 'smoke submission',
    })

await transport.verify()
console.log(`verify ok against ${env.SMTP_TLS_SERVERNAME} on ${env.SMTP_HOST}:${env.SMTP_PORT}`)
const info = await send(`bounce@${domain}`)
if (!info.accepted.includes(`bounce@${domain}`)) {
    throw new Error(`own envelope not accepted: ${info.response}`)
}
console.log(`own envelope accepted: ${info.response}`)
let spoofed
try {
    spoofed = await send(`other@${domain}`)
} catch (error) {
    console.log(`foreign envelope rejected: ${error.response}`)
}
transport.close()
if (spoofed) {
    throw new Error(`foreign envelope accepted: ${spoofed.response}`)
}
JS
) || fail "authenticated submission check failed: $submission"
echo "$submission"
grep -q '^foreign envelope rejected: 5' <<<"$submission" || fail "foreign envelope was not rejected with a 5xx"
grep -q "^verify ok against $mail_hostname on mail:587" <<<"$submission" || fail "submission did not verify the certificate against $mail_hostname"
pass "authenticated submission on mail:587 verifies the certificate against $mail_hostname and spoof protection rejects other@$mail_hostname"

relay_message=$(printf 'From: smoke@example.org\r\nTo: victim@example.org\r\nSubject: relay\r\n\r\nrelay\r\n')
if outside=$(curl -v --url "$smtp_url" --mail-from smoke@example.org --mail-rcpt victim@example.org --upload-file - <<<"$relay_message" 2>&1); then
    fail "port 25 relayed mail for victim@example.org"
fi
grep -q 'Relay access denied' <<<"$outside" || fail "port 25 did not answer Relay access denied: $outside"
pass "port 25 from outside rejects relaying: $(grep -m1 'Relay access denied' <<<"$outside" | tr -d '\r')"

inside=$(backend_node <<'JS'
import { createTransport } from 'nodemailer'

const domain = process.env.SMOKE_DOMAIN
const transport = createTransport({ host: 'mail', port: 25, secure: false, tls: { servername: domain } })
let relayed
try {
    relayed = await transport.sendMail({
        envelope: { from: `bounce@${domain}`, to: 'victim@example.org' },
        from: `bounce@${domain}`,
        to: 'victim@example.org',
        subject: 'relay',
        text: 'relay',
    })
} catch (error) {
    if (!/Relay access denied/.test(error.response ?? '')) {
        throw error
    }
    console.log(`unauthenticated relay rejected: ${error.response}`)
}
transport.close()
if (relayed) {
    throw new Error(`unauthenticated relay accepted: ${relayed.response}`)
}
JS
) || fail "unauthenticated relay check from inside failed: $inside"
pass "mail:25 from the backend network rejects unauthenticated relaying: $inside"

tr -d '\r' <"$script_dir/../dev/fixtures/dsn-permanent.eml" |
    curl -sS --crlf --url "$smtp_url" --mail-from '<>' --mail-rcpt "bounce@$mail_hostname" --upload-file - ||
    fail "delivering the DSN fixture to bounce@$mail_hostname failed"
deadline=$((SECONDS + 150))
until [ "$(bounce_count)" -ge 1 ] 2>/dev/null; do
    [ "$SECONDS" -lt "$deadline" ] || fail "no bounce row within 150 s of delivering the DSN fixture"
    sleep 5
done
pass "the DSN delivered on port 25 is ingested over IMAP (mail:143, servername $mail_hostname) into the bounce table ($(bounce_count) row)"

[ -z "$(dc port mail 587 2>/dev/null || true)" ] || fail "mail publishes port 587"
[ -z "$(dc port mail 143 2>/dev/null || true)" ] || fail "mail publishes port 143"
smtp_port=$(dc port mail 25 | tr -d '\r')
[[ "$smtp_port" == *:18025 ]] || fail "mail port 25 is published as '$smtp_port', expected :18025"
pass "mail publishes only port 25 ($smtp_port); 587 and 143 stay internal"

initial_serial=$(serial_of "$tmp/tls/$mail_hostname.crt")
dc stop mail >/dev/null 2>&1
dc rm -f mail >/dev/null 2>&1
mv "$tmp/tls/"* "$tmp/tls-away/"
dc up -d mail >/dev/null 2>&1 || fail "mail did not start without a certificate"
if wait_healthy mail 60; then
    fail "mail became healthy without a certificate"
fi
pass "mail stays unhealthy for 60 s without a certificate (state: $(health mail))"
mv "$tmp/tls-away/"* "$tmp/tls/"
wait_healthy mail 180 || fail "mail did not recover within 180 s after the certificate appeared"
pass "mail recovers on its own once the certificate appears"

[ "$(served_smtp_serial)" = "$initial_serial" ] || fail "port 25 does not serve the issued certificate"
[ "$(served_imap_serial)" = "$initial_serial" ] || fail "port 143 does not serve the issued certificate"
issue_leaf "$tmp/renew"
renewed_serial=$(serial_of "$tmp/renew/$mail_hostname.crt")
[ "$renewed_serial" != "$initial_serial" ] || fail "renewed certificate has the old serial"
mail_started=$(docker inspect --format '{{.State.StartedAt}} {{.RestartCount}}' "$(dc ps -q mail)")
mv -f "$tmp/renew/"* "$tmp/tls/"
deadline=$((SECONDS + 90))
until [ "$(served_smtp_serial)" = "$renewed_serial" ] && [ "$(served_imap_serial)" = "$renewed_serial" ]; do
    [ "$SECONDS" -lt "$deadline" ] || fail "renewed certificate not served within 90 s (smtp: $(served_smtp_serial), imap: $(served_imap_serial), expected $renewed_serial)"
    sleep 3
done
[ "$(docker inspect --format '{{.State.StartedAt}} {{.RestartCount}}' "$(dc ps -q mail)")" = "$mail_started" ] ||
    fail "mail was restarted or replaced during renewal"
pass "renewed certificate is served on 25 and 143 without a restart ($initial_serial -> $renewed_serial)"

pending=$(dc run --rm -T migrate node dist/migrate.js pending --json | tail -n 1 | tr -d '[:space:]')
[ "$pending" = "[]" ] || fail "re-running migrations reports pending: $pending"
pass "migrations are idempotent"

old_backend=$(dc ps -q backend)
[ -n "$old_backend" ] || fail "no running backend container"
cat >"$tmp/compose.fail.yml" <<'YML'
services:
    migrate:
        command: ["node", "-e", "process.exit(1)"]
    backend:
        environment:
            SMOKE_REVISION: "2"
YML
if dc -f "$tmp/compose.fail.yml" run --rm -T migrate && dc -f "$tmp/compose.fail.yml" up -d --pull missing; then
    fail "update sequence with a failing migration exited zero"
fi
request GET /api/setup/status
expect_status 200 "backend after failed migration"
[ "$(dc ps -q backend)" = "$old_backend" ] || fail "backend container was replaced after a failed migration"
pass "failed migration step keeps the old backend serving"

cat >"$tmp/compose.revision.yml" <<'YML'
services:
    backend:
        environment:
            SMOKE_REVISION: "2"
YML
dc -f "$tmp/compose.revision.yml" run --rm -T migrate
dc -f "$tmp/compose.revision.yml" up -d --pull missing --wait
request GET /api/setup/status
expect_status 200 "backend after update"
[ "$(dc ps -q backend)" != "$old_backend" ] || fail "update did not replace the backend container"
pass "migrate then up replaces the backend"

echo "smoke test passed"
