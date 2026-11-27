#!/bin/sh
set -eu
umask 077

CDPATH= cd -- "$(dirname -- "$0")"

IMAGE=ghcr.io/schwarzdavid/mailer
SECRET_KEYS="DB_PASSWORD BACKEND_JWT_SECRET BACKEND_ENCRYPTION_SECRET MAIL_PASSWORD"
REQUIRED_SETTINGS="SITE_ADDRESS MAIL_HOSTNAME MAIL_SERVER_IPV4"
UPDATE_LOCK=.update-lock
MAILBOX_HASH_FAILED=65

say() {
    printf '%s\n' "$1"
}

warn() {
    printf 'mailer.sh: %s\n' "$1" >&2
}

fail() {
    warn "$1"
    exit 1
}

usage() {
    cat <<'USAGE'
Usage: sh mailer.sh <command> [arguments]

Commands:
  setup [options]                 set up this directory, then start mailer
  start                           start mailer
  stop                            stop mailer
  restart                         restart mailer
  status                          show the containers
  logs [arguments]                show the logs (docker compose logs)
  compose [arguments]             run docker compose in this directory
  token                           print the setup token for the first login
  version                         print the installed version and format
  doctor                          check Docker Compose, .env and the secrets
  recovery-kit                    print the secrets to keep in a password manager
  update [major] --to <version>   update to <version>
  help                            show this help
USAGE
}

fail_usage() {
    warn "$1"
    usage >&2
    exit 2
}

env_value() {
    [ -f .env ] || return 0
    sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' | sed -e "/^[\"']/!s/[[:space:]]\{1,\}#.*//" \
        -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

secret_value() {
    eval "secret_from_environment=\${$1:-}"
    if [ -n "$secret_from_environment" ]; then
        printf '%s' "$secret_from_environment"
    else
        env_value "$1"
    fi
}

shell_quote() {
    quote_rest=$1
    quote_done=
    while :; do
        case $quote_rest in
            *\'*)
                quote_done="$quote_done${quote_rest%%\'*}'\\''"
                quote_rest=${quote_rest#*\'}
                ;;
            *)
                quote_done="$quote_done$quote_rest"
                break
                ;;
        esac
    done
    printf "'%s'" "$quote_done"
}

is_number() {
    case $1 in
        '' | *[!0-9]*) return 1 ;;
    esac
}

compose_version_found() {
    docker compose version --short 2>/dev/null | tr -d '\r' || true
}

compose_version_suffices() {
    version=${1#v}
    version=${version%%-*}
    version=${version%%+*}
    case $version in
        *.*.*) ;;
        *) return 1 ;;
    esac
    version_major=${version%%.*}
    version_rest=${version#*.}
    version_minor=${version_rest%%.*}
    version_patch=${version_rest#*.}
    version_patch=${version_patch%%.*}
    is_number "$version_major" && is_number "$version_minor" && is_number "$version_patch" || return 1
    [ "$version_major" -gt 2 ] && return 0
    [ "$version_major" -eq 2 ] || return 1
    [ "$version_minor" -gt 23 ] && return 0
    [ "$version_minor" -eq 23 ] || return 1
    [ "$version_patch" -ge 1 ]
}

require_compose() {
    compose_version=$(compose_version_found)
    compose_version_suffices "$compose_version" ||
        fail "Docker Compose 2.23.1 or newer is required (found ${compose_version:-none})."
}

require_secret() {
    [ -n "$(secret_value "$1")" ] && return 0
    if [ -n "${MAILER_WRAPPED:-}" ]; then
        fail "$1 is not set; the secrets wrapper did not provide it"
    fi
    fail "$1 is not set"
}

require_secrets() {
    for secret_key in $SECRET_KEYS; do
        require_secret "$secret_key"
    done
}

pin_image_tag() {
    pinned_image_tag=$(env_value IMAGE_TAG)
    [ -n "$pinned_image_tag" ] || return 0
    IMAGE_TAG=$pinned_image_tag
    export IMAGE_TAG
}

image_tag_or_latest() {
    configured_tag=$(env_value IMAGE_TAG)
    printf '%s' "${configured_tag:-latest}"
}

mount_source() {
    pwd -W 2>/dev/null || pwd
}

run_cli() {
    cli_tag=$1
    cli_extra_flags=$2
    shift 2
    cli_tty=
    if [ -t 0 ] && [ -t 1 ]; then
        cli_tty=-t
    fi
    docker run --rm -i $cli_tty --user "$(id -u):$(id -g)" -e HOME=/tmp $cli_extra_flags \
        -v "$(mount_source):/project" "$IMAGE:$cli_tag" mailer "$@"
}

unlogged_secret_flags() {
    printf '%s' '--log-driver none'
    for secret_key in $SECRET_KEYS; do
        printf ' -e %s' "$secret_key"
    done
}

pull_if_latest() {
    if [ "$1" = latest ]; then
        docker pull "$IMAGE:latest"
    fi
}

wrapped_command() {
    wrapper=$(env_value MAILER_SECRETS_WRAPPER)
    [ -n "$wrapper" ] || return 0
    self_command="$(shell_quote sh) $(shell_quote "$(pwd)/$(basename "$0")")"
    for argument in "$@"; do
        self_command="$self_command $(shell_quote "$argument")"
    done
    case $wrapper in
        *\{\}*) printf '%s' "${wrapper%%\{\}*}$(shell_quote "$self_command")${wrapper#*\{\}}" ;;
        *) printf '%s %s' "$wrapper" "$self_command" ;;
    esac
}

run_under_wrapper() {
    [ -z "${MAILER_WRAPPED:-}" ] || return 0
    full_command=$(wrapped_command "$@")
    [ -n "$full_command" ] || return 0
    MAILER_WRAPPED=1
    export MAILER_WRAPPED
    wrapped_status=0
    eval "$full_command" || wrapped_status=$?
    exit "$wrapped_status"
}

in_mail() {
    docker compose exec -T mail "$@"
}

mailbox_password_script() {
    cat <<'SCRIPT'
set -eu
account=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
accounts=$2
hash_failed=$3
fail_hash() {
    printf '%s\n' 'could not hash the mailbox password' >&2
    exit "$hash_failed"
}
IFS= read -r password || fail_hash
[ -n "$password" ] || fail_hash
hash=$(printf '%s\n%s\n' "$password" "$password" | doveadm pw -s SHA512-CRYPT) || fail_hash
case $hash in
    '{SHA512-CRYPT}'*) ;;
    *) fail_hash ;;
esac
outcome=created
if [ -f "$accounts" ] &&
    awk -F '|' -v account="$account" 'tolower($1) == account { found = 1 } END { exit !found }' "$accounts"; then
    outcome=updated
fi
{
    [ ! -f "$accounts" ] || awk -F '|' -v account="$account" 'tolower($1) != account' "$accounts"
    printf '%s|%s\n' "$account" "$hash"
} >"$accounts.next"
mv "$accounts.next" "$accounts"
printf '%s\n' "$outcome"
SCRIPT
}

set_mailbox_password() {
    printf '%s\n' "$mail_password" |
        in_mail sh -c "$(mailbox_password_script)" set-mailbox-password "$bounce" "$accounts" "$MAILBOX_HASH_FAILED"
}

ensure_mailbox() {
    in_mail true >/dev/null 2>&1 || return 1
    mailbox_status=0
    mailbox_outcome=$(set_mailbox_password) || mailbox_status=$?
    [ "$mailbox_status" -eq 0 ] || return "$mailbox_status"
    case $mailbox_outcome in
        updated) say "Updated the password of $bounce." ;;
        *) say "Created the mailbox $bounce." ;;
    esac
    if ! in_mail grep -qi "^$postmaster[[:space:]]" "$aliases" 2>/dev/null; then
        in_mail setup alias add "$postmaster" "$bounce" || return 1
        say "Created the alias $postmaster -> $bounce."
    fi
}

wait_for_mailbox() {
    mail_hostname=$(env_value MAIL_HOSTNAME)
    mail_password=$(secret_value MAIL_PASSWORD)
    bounce="bounce@$mail_hostname"
    postmaster="postmaster@$mail_hostname"
    accounts=/tmp/docker-mailserver/postfix-accounts.cf
    aliases=/tmp/docker-mailserver/postfix-virtual.cf
    say "Waiting for the mail service (it restarts until Caddy has the certificate for $mail_hostname)..."
    deadline=$(($(date +%s) + 600))
    while :; do
        mailbox_attempt=0
        ensure_mailbox || mailbox_attempt=$?
        case $mailbox_attempt in
            0) return 0 ;;
            "$MAILBOX_HASH_FAILED") return 1 ;;
        esac
        if [ "$(date +%s)" -ge "$deadline" ]; then
            warn "the mail service did not accept the account within 10 minutes; check: sh mailer.sh compose logs proxy mail"
            return 1
        fi
        sleep 5
    done
}

refuse_image_tag_option() {
    for setup_argument in "$@"; do
        case $setup_argument in
            --image-tag | --image-tag=*)
                fail_usage "set IMAGE_TAG in .env to choose the version; setup does not take --image-tag"
                ;;
        esac
    done
}

command_setup() {
    refuse_image_tag_option "$@"
    require_compose
    setup_tag=$(image_tag_or_latest)
    pull_if_latest "$setup_tag"
    setup_status=0
    run_cli "$setup_tag" "$(unlogged_secret_flags)" setup --image-tag "$setup_tag" "$@" || setup_status=$?
    case $setup_status in
        0) ;;
        4)
            warn "the stack was not started. Move your changes from compose.yml.legacy into compose.override.yml, then run: sh mailer.sh setup --yes"
            exit 4
            ;;
        126 | 127) fail "the image $IMAGE:$setup_tag has no mailer CLI; set IMAGE_TAG=latest in .env and run setup again" ;;
        *) exit "$setup_status" ;;
    esac
    exec sh ./mailer.sh _post-setup
}

command_post_setup() {
    require_compose
    require_secrets
    docker compose up -d --pull missing
    wait_for_mailbox || exit 1
    say "mailer runs at https://$(env_value SITE_ADDRESS). Setup token for the first login: sh mailer.sh token"
}

command_start() {
    require_compose
    require_secrets
    docker compose up -d
}

command_token() {
    token_line=$(docker compose logs --no-color backend | grep 'Setup token: ' | tail -n 1) || true
    token=$(printf '%s\n' "$token_line" | sed -n 's/.*Setup token: \([0-9a-f]\{32\}\).*/\1/p')
    [ -n "$token" ] ||
        fail "No setup token in the backend log; a user already exists or the backend has not started."
    say "$token"
}

require_env_file() {
    [ -f .env ] || fail ".env not found next to mailer.sh; run: sh mailer.sh setup"
}

command_version() {
    require_env_file
    say "mailer $(env_value IMAGE_TAG)"
    say "format $(env_value MAILER_FORMAT_VERSION)"
}

command_doctor() {
    require_compose
    say "ok: Docker Compose $compose_version"
    require_env_file
    say "ok: .env exists"
    for setting_key in $REQUIRED_SETTINGS; do
        [ -n "$(env_value "$setting_key")" ] || fail "$setting_key is empty in .env"
        say "ok: $setting_key is set"
    done
    for secret_key in $SECRET_KEYS; do
        require_secret "$secret_key"
        say "ok: $secret_key is available"
    done
}

command_recovery_kit() {
    kit_tag=$(image_tag_or_latest)
    pull_if_latest "$kit_tag"
    run_cli "$kit_tag" "$(unlogged_secret_flags)" recovery-kit
}

major_of() {
    major_candidate=${1#v}
    case $major_candidate in
        [0-9]*.[0-9]*.[0-9]*) printf '%s' "${major_candidate%%.*}" ;;
    esac
}

pull_update_image() {
    docker pull "$1" && return 0
    docker image inspect "$1" >/dev/null 2>&1 || fail "could not pull $1"
    warn "could not pull $1; using the local image"
}

command_update() {
    allow_major=no
    target=
    while [ $# -gt 0 ]; do
        case $1 in
            major) allow_major=yes ;;
            --to)
                [ $# -ge 2 ] || fail "this version needs a target: sh mailer.sh update --to <version>"
                target=$2
                shift
                ;;
            --to=*) target=${1#--to=} ;;
            *) fail_usage "unknown argument for update: $1" ;;
        esac
        shift
    done
    target=${target#v}
    [ -n "$target" ] || fail "this version needs a target: sh mailer.sh update --to <version>"
    current=$(env_value IMAGE_TAG)
    current=${current:-latest}
    if [ "$target" = "${current#v}" ]; then
        [ ! -e "$UPDATE_LOCK" ] ||
            fail "an update did not finish ($UPDATE_LOCK exists). If no update is running, remove $UPDATE_LOCK and run: sh mailer.sh start"
        say "Already on $target. If the last update did not finish, run: sh mailer.sh start"
        exit 0
    fi
    current_major=$(major_of "$current")
    target_major=$(major_of "$target")
    if [ -n "$current_major" ] && [ -n "$target_major" ] && [ "$current_major" != "$target_major" ] &&
        [ "$allow_major" = no ]; then
        fail "$target is a new major version. Read its release notes, then run: sh mailer.sh update major --to $target"
    fi
    pull_update_image "$IMAGE:$target"
    migrate_status=0
    run_cli "$target" "" migrate-project --image-tag "$target" || migrate_status=$?
    case $migrate_status in
        0) exec sh ./mailer.sh _finish-update "$current" "$target" ;;
        3) exit 3 ;;
        *) fail "the update to $target failed; see the message above" ;;
    esac
}

remove_update_lock() {
    rm -rf "$UPDATE_LOCK"
}

fail_update() {
    fail "the update to $1 did not come up. The previous files are in backups/snapshots/; see the rollback page of the documentation."
}

installed_tag_or() {
    installed_tag=$(env_value IMAGE_TAG)
    printf '%s' "${installed_tag:-$1}"
}

command_finish_update() {
    finished_tag=$(installed_tag_or "$2")
    (require_compose && require_secrets) || fail_update "$finished_tag"
    docker compose up -d --pull missing --wait --wait-timeout 300 backend || fail_update "$finished_tag"
    docker compose up -d --remove-orphans || fail_update "$finished_tag"
    wait_for_mailbox ||
        fail "updated to $finished_tag, but the bounce mailbox could not be set; run: sh mailer.sh setup --yes"
    say "Updated from $1 to $finished_tag."
}

guard_update_lock() {
    trap remove_update_lock EXIT
    trap 'exit 1' HUP INT TERM
}

main() {
    pin_image_tag
    case ${1:-help} in
        start | stop | restart | status | logs | compose | token | doctor | recovery-kit | update | _post-setup)
            run_under_wrapper "$@"
            ;;
        _finish-update)
            [ $# -eq 3 ] || fail_usage "_finish-update needs <from> <to>"
            guard_update_lock
            run_under_wrapper "$@"
            ;;
    esac
    launcher_command=${1:-help}
    [ $# -eq 0 ] || shift
    case $launcher_command in
        setup) command_setup "$@" ;;
        _post-setup) command_post_setup ;;
        start) command_start ;;
        stop) exec docker compose stop "$@" ;;
        restart) exec docker compose restart "$@" ;;
        status) exec docker compose ps "$@" ;;
        logs) exec docker compose logs "$@" ;;
        compose) exec docker compose "$@" ;;
        token) command_token ;;
        version) command_version ;;
        doctor) command_doctor ;;
        recovery-kit) command_recovery_kit ;;
        update) command_update "$@" ;;
        _finish-update) command_finish_update "$@" ;;
        help | -h | --help) usage ;;
        *) fail_usage "unknown command: $launcher_command" ;;
    esac
}

main "$@"
