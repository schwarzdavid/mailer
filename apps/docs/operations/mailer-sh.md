# The mailer.sh command

This page describes every command of `mailer.sh`, the launcher in your install directory, with the messages you see. After it you know which command does what, what it prints when something is wrong and what its exit code means. Run the commands in the install directory, or give `sh` the full path: `sh /opt/mailer/mailer.sh status` works from anywhere, because the script changes into its own directory first.

```text
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
```

Messages from the launcher itself start with `mailer.sh:`. A command that is not in the list stops with `mailer.sh: unknown command: <name>`, prints the usage above and exits with `2`.

## Why use mailer.sh instead of docker compose

`sh mailer.sh compose …` is `docker compose …` in the install directory, with two things a typed `docker compose` lacks:

- **The pinned version.** The launcher makes the `IMAGE_TAG` in `.env` win over an `IMAGE_TAG` exported in your shell. A bare `docker compose` lets the shell win, so a stray `export IMAGE_TAG=…` could start another image than the one `.env` pins.
- **The secrets from a secret manager.** With a [secrets wrapper](/installation/advanced-configuration#secrets-from-a-secret-manager), the four secrets are not in `.env`, and a bare `docker compose` fails with `DB_PASSWORD is required`. The launcher runs under the wrapper, so every command below finds them.

The pages of this documentation therefore give `sh mailer.sh compose …` (or the specific command) wherever a command belongs to the install directory.

## setup

```bash
sh mailer.sh setup
```

Sets up the directory and starts mailer: the wizard asks for the settings and the secrets, writes `.env`, `compose.yml` and `mailer.sh`, prints the recovery kit when it generated secrets, starts the stack and creates the bounce mailbox. It runs the wizard from the image `ghcr.io/schwarzdavid/mailer:<IMAGE_TAG>` and pulls it first when the tag is `latest` or unset. [Installation](/installation/) walks through it, including the options for an [unattended installation](/installation/#unattended-installation) (`--yes`, `--site-address`, `--mail-hostname`, `--mail-ipv4`, `--mail-ipv6`, `--secrets` and `--secrets-wrapper`). It is safe to run again: it never overwrites a secret, and it sets the mailbox password from `.env` again.

At the end it prints:

```text
Created the mailbox bounce@mx.example.com.
Created the alias postmaster@mx.example.com -> bounce@mx.example.com.
mailer runs at https://app.example.com. Setup token for the first login: sh mailer.sh token
```

On a repeated run the first line reads `Updated the password of bounce@mx.example.com.`, and the alias line is left out when the alias exists.

| Message                                                                                                           | Meaning                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Missing settings: SITE_ADDRESS, …. Pass them as options or set them in .env.`                                    | A run without a terminal (or with `--yes`) lacks a required setting. Exit code `2`.                                                                |
| `MAIL_HOSTNAME must differ from SITE_ADDRESS.`                                                                    | The two names are equal. Exit code `2`.                                                                                                            |
| `This installation is newer than the image; a downgrade is not supported.`                                        | `.env` records a newer project format than the image knows. Exit code `3`.                                                                         |
| `could not hash the mailbox password`                                                                             | `doveadm` in the `mail` container could not hash `MAIL_PASSWORD`, or it is empty. The launcher stops at once.                                      |
| `mailer.sh: the mail service did not accept the account within 10 minutes; check: docker compose logs proxy mail` | The `mail` service never became ready, usually because Caddy has no certificate for `MAIL_HOSTNAME` yet. Fix the DNS record and run `setup` again. |

## start, stop, restart and status

```bash
sh mailer.sh start
sh mailer.sh status
sh mailer.sh restart
sh mailer.sh stop
```

- `start` checks the Compose version and the four secrets, then runs `docker compose up -d`. Run it after a reboot that did not bring the stack up, or after you changed `.env` or `compose.override.yml`.
- `stop` runs `docker compose stop`, `restart` runs `docker compose restart` and `status` runs `docker compose ps`. Containers and volumes stay; `stop` is not `down`. Extra arguments go to Docker Compose, so `sh mailer.sh restart backend` restarts one service.

`start` can stop with one of these messages (exit code `1`):

| Message                                                                     | Meaning                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `mailer.sh: Docker Compose 2.23.1 or newer is required (found 2.20.0).`     | The Compose plugin is too old, or `none` is printed when `docker compose` does not work at all.              |
| `mailer.sh: DB_PASSWORD is not set`                                         | The secret is neither in the environment nor in `.env`. The same message exists for the other three secrets. |
| `mailer.sh: DB_PASSWORD is not set; the secrets wrapper did not provide it` | The same, with a wrapper configured: the wrapper command did not hand the secret over.                       |

## logs

```bash
sh mailer.sh logs --tail 100 backend
sh mailer.sh logs -f proxy mail
```

Runs `docker compose logs` with your arguments. Without a service name it prints the logs of all services.

## compose

```bash
sh mailer.sh compose exec mail postqueue -p
```

Runs `docker compose` with your arguments in the install directory, so `exec`, `run`, `up`, `pull` and every other Compose command work. This is the command to use wherever you would type `docker compose` by hand; see [above](#why-use-mailer-sh-instead-of-docker-compose).

## token

```bash
sh mailer.sh token
```

Prints the newest setup token from the backend log, the 32 hexadecimal characters you enter in the first-run wizard of the admin UI:

```text
3f9a2c1d7b4e8a6f0c5d2e1b9a8f7c6d
```

If there is none, it stops with `mailer.sh: No setup token in the backend log; a user already exists or the backend has not started.` (exit code `1`). The backend logs a token only while no user exists.

## version

```bash
sh mailer.sh version
```

```text
mailer 1.0.0
format 1
```

The first line is the `IMAGE_TAG` of `.env`, the version that runs. The second is the project format, `MAILER_FORMAT_VERSION`: the layout of the install directory, which only changes when a release has to change something in it. Without a `.env` the command stops with `mailer.sh: .env not found next to mailer.sh; run: sh mailer.sh setup`.

## doctor

```bash
sh mailer.sh doctor
```

Checks what a start needs, without starting anything, and stops at the first problem:

```text
ok: Docker Compose 2.29.7
ok: .env exists
ok: SITE_ADDRESS is set
ok: MAIL_HOSTNAME is set
ok: MAIL_SERVER_IPV4 is set
ok: DB_PASSWORD is available
ok: BACKEND_JWT_SECRET is available
ok: BACKEND_ENCRYPTION_SECRET is available
ok: MAIL_PASSWORD is available
```

A failed check prints a message such as `mailer.sh: MAIL_HOSTNAME is empty in .env` and exits with `1`. The secrets count as available when they are in the environment (the secrets wrapper) or in `.env`.

## recovery-kit

```bash
sh mailer.sh recovery-kit
```

Prints the site, the mail hostname, the version, the four secrets and the fingerprint of the encryption secret, the same lines the setup shows at its end, without its closing reminder to store them in a password manager. Keep it in a password manager; see [Keep the recovery kit](/installation/#keep-the-recovery-kit). A value that is neither in the environment nor in `.env` prints as `(not available)`.

## update

```bash
sh mailer.sh update --to 1.1.0
```

Updates to the given version; a leading `v` is accepted (`--to v1.1.0`). [Update mailer](/operations/updating) explains the steps and what to do before and after. The command needs `--to`; without it, it stops with `mailer.sh: this version needs a target: sh mailer.sh update --to <version>`. Any other argument stops with `unknown argument for update: …`, the usage and exit code `2`.

| Message                                                                                                                                     | Meaning                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Already on 1.1.0.`                                                                                                                         | The version already runs. Exit code `0`, nothing changed.                                                                                                                                                                                                                                                                                                          |
| `mailer.sh: 2.0.0 is a new major version. Read its release notes, then run: sh mailer.sh update major --to 2.0.0`                           | The target has another major version. Read the release notes, then repeat the command with `major`: `sh mailer.sh update major --to 2.0.0`.                                                                                                                                                                                                                        |
| `mailer.sh: could not pull ghcr.io/schwarzdavid/mailer:1.1.0; using the local image`                                                        | A warning: the registry is not reachable, but the image is already on the server.                                                                                                                                                                                                                                                                                  |
| `mailer.sh: could not pull ghcr.io/schwarzdavid/mailer:1.1.0`                                                                               | The image does not exist or the registry is not reachable, and there is no local copy. Nothing was changed.                                                                                                                                                                                                                                                        |
| `Snapshot: backups/snapshots/20261127T101500Z`                                                                                              | The previous `compose.yml`, `.env` and `mailer.sh` were copied there before anything changed.                                                                                                                                                                                                                                                                      |
| `Updated from 1.0.0 to 1.1.0.`                                                                                                              | Done: the new files are in place, the stack runs, the backend is healthy and the bounce mailbox exists.                                                                                                                                                                                                                                                            |
| `mailer.sh: the update to 1.1.0 did not come up. The previous files are in backups/snapshots/; see the rollback page of the documentation.` | The new stack did not start, the backend did not become healthy within five minutes or the mailbox step failed. [Roll back](/operations/rollback).                                                                                                                                                                                                                 |
| `mailer.sh: the update to 1.1.0 failed; see the message above`                                                                              | The project migration stopped, for example because another update holds the lock; the CLI prints the reason above this line. If it had changed files already, it restored them from the snapshot. Exit code `1`.                                                                                                                                                   |
| `Another update is running. If none is, remove .update-lock and try again.`                                                                 | The CLI (`mailer migrate-project`, inside the image) prints this on standard error without the `mailer.sh:` prefix, followed by the launcher's own `mailer.sh: the update to … failed; see the message above`. The directory `.update-lock` exists. Remove it with `rmdir .update-lock` only when you are sure no update runs, for example after a killed session. |

Exit code `3` means the update needs manual action: the CLI printed why (`This installation is newer than the image; a downgrade is not supported.`, `This directory was not set up by mailer.sh; run: sh mailer.sh setup` or `No migration from format N is available; manual action is needed.`) and changed nothing. The release notes name the steps.

## help

```bash
sh mailer.sh help
```

Prints the usage shown at the top of this page; `-h` and `--help` do the same, and so does `mailer.sh` without a command.

## Exit codes

| Code | Meaning                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | The command succeeded.                                                                                                          |
| `1`  | The command failed; the message names the reason.                                                                               |
| `2`  | The command line is wrong: unknown command or argument, or a missing setting.                                                   |
| `3`  | `update` needs manual action and changed nothing; `setup` also exits with it when `.env` records a newer format than the image. |

The commands that pass through to Docker Compose (`stop`, `restart`, `status`, `logs` and `compose`) exit with Docker's own code.

## Commands that run under the secrets wrapper

When `.env` sets `MAILER_SECRETS_WRAPPER`, `start`, `stop`, `restart`, `status`, `logs`, `compose`, `token`, `doctor`, `recovery-kit` and `update` start themselves again under that command, so the secrets exist as environment variables for the launcher and for Docker Compose. `setup`, `version` and `help` do not need them. [Secrets from a secret manager](/installation/advanced-configuration#secrets-from-a-secret-manager) explains the setting.
