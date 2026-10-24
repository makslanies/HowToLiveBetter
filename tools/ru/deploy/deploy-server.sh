#!/usr/bin/env bash
# Деплой русской версии на сервер vm-voly: сборка dist-ru/site синхронизируется в каталог,
# который раздаёт контейнер howtolivebetter (nginx, read-only bind mount).
#   tools/ru/deploy/deploy-server.sh            сборка уже есть в dist-ru/site: только выкладка и проверка
#   tools/ru/deploy/deploy-server.sh --build    сначала node tools/ru/build.mjs, потом выкладка
#   tools/ru/deploy/deploy-server.sh --dry-run  показать, что изменится, ничего не меняя
# Переменные (по умолчанию в скобках): DEPLOY_HOST (vm-voly), DEPLOY_DIR (/home/user1/projects/howtolivebetter/site),
# DEPLOY_CONTAINER (howtolivebetter), LOCAL_PORT (8120), PUBLIC_URL (https://howtolivebetter.ru/).
set -euo pipefail

cd "$(dirname "$0")/../../.."

HOST="${DEPLOY_HOST:-vm-voly}"
DIR="${DEPLOY_DIR:-/home/user1/projects/howtolivebetter/site}"
CONTAINER="${DEPLOY_CONTAINER:-howtolivebetter}"
PORT="${LOCAL_PORT:-8120}"
PUBLIC="${PUBLIC_URL:-https://howtolivebetter.ru/}"
SRC="dist-ru/site/"
# файл подтверждения домена лежит на сервере и не входит в сборку: при --delete его нельзя удалять
KEEP="9ce6be1c87be61d9e769df6f1921395b.txt"

DRY=""
for arg in "$@"; do
  case "$arg" in
    --build) node tools/ru/build.mjs ;;
    --dry-run) DRY="--dry-run" ;;
    *) echo "неизвестный аргумент: $arg" >&2; exit 2 ;;
  esac
done

[ -f "$SRC/index.html" ] || { echo "нет $SRC/index.html: сначала node tools/ru/build.mjs или --build" >&2; exit 1; }

echo "выкладка $SRC -> $HOST:$DIR"
rsync -az --delete $DRY --exclude "$KEEP" "$SRC" "$HOST:$DIR/"

[ -n "$DRY" ] && { echo "сухой прогон, проверки пропущены"; exit 0; }

ssh "$HOST" "docker exec $CONTAINER nginx -t" >/dev/null 2>&1 || { echo "nginx -t в контейнере не прошёл" >&2; exit 1; }
local_code=$(ssh "$HOST" "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/")
public_code=$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC")
echo "локально 127.0.0.1:$PORT -> $local_code, публично $PUBLIC -> $public_code"
[ "$local_code" = "200" ] && [ "$public_code" = "200" ] || { echo "проверка не прошла" >&2; exit 1; }
echo "деплой готов"
