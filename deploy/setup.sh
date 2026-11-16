#!/bin/sh
set -eu
umask 077

cd "$(dirname "$0")"

fail() {
    echo "setup.sh: $1" >&2
    exit 1
}

env_value() {
    sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

random_secret() {
    head -c 48 /dev/urandom | base64 | tr -d '\n'
}

set_env_value() {
    if grep -q "^$1=" .env; then
        sed "s|^$1=.*|$1=$2|" .env >.env.setup-tmp
        cat .env.setup-tmp >.env
        rm -f .env.setup-tmp
    else
        printf '%s=%s\n' "$1" "$2" >>.env
    fi
}

[ -f .env ] || fail ".env not found next to setup.sh"

for key in SITE_ADDRESS MAIL_HOSTNAME MAIL_SERVER_IPV4; do
    [ -n "$(env_value "$key")" ] || fail "$key is empty in .env"
done

generated=""
for key in DB_PASSWORD BACKEND_JWT_SECRET BACKEND_ENCRYPTION_SECRET MAIL_PASSWORD; do
    if [ -z "$(env_value "$key")" ]; then
        set_env_value "$key" "$(random_secret)"
        generated="$generated $key"
        echo "Generated $key in .env."
    fi
done

mail_hostname=$(env_value MAIL_HOSTNAME)
mail_password=$(env_value MAIL_PASSWORD)

bounce="bounce@$mail_hostname"
postmaster="postmaster@$mail_hostname"
accounts=/tmp/docker-mailserver/postfix-accounts.cf
aliases=/tmp/docker-mailserver/postfix-virtual.cf

in_mail() {
    docker compose exec -T mail "$@"
}

ensure_mailbox() {
    in_mail true >/dev/null 2>&1 || return 1
    if in_mail grep -qi "^$bounce|" "$accounts" 2>/dev/null; then
        in_mail setup email update "$bounce" "$mail_password" || return 1
        echo "Updated the password of $bounce."
    else
        in_mail setup email add "$bounce" "$mail_password" || return 1
        echo "Created the mailbox $bounce."
    fi
    if ! in_mail grep -qi "^$postmaster[[:space:]]" "$aliases" 2>/dev/null; then
        in_mail setup alias add "$postmaster" "$bounce" || return 1
        echo "Created the alias $postmaster -> $bounce."
    fi
}

docker compose up -d --pull missing

echo "Waiting for the mail service (it restarts until Caddy has the certificate for $mail_hostname)..."
deadline=$(($(date +%s) + 600))
until ensure_mailbox; do
    [ "$(date +%s)" -lt "$deadline" ] ||
        fail "the mail service did not accept the account within 10 minutes; check: docker compose logs proxy mail"
    sleep 5
done

if [ -n "$generated" ]; then
    echo "Back up .env now: it holds the secrets generated above ($(echo $generated | sed 's/ /, /g')), and a database backup is worthless without BACKEND_ENCRYPTION_SECRET."
fi
echo "Done. The setup token for the first login: docker compose logs backend | grep 'Setup token'"
