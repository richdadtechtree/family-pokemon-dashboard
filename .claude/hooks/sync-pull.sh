#!/bin/bash
# 세션 시작 시 최신 동기화. 실패해도 세션은 계속 (오프라인 등)
cd "$CLAUDE_PROJECT_DIR" || exit 0
# git이 정말 쓸 수 있는지 — 없으면 혼자 쓰기 모드(아무것도 안 함)
# macOS에서 개발자 도구가 없으면 /usr/bin/git 은 실행할 때마다 "설치하시겠습니까" 창만 띄우므로 실행 전에 거른다
has_git() {
  command -v git >/dev/null 2>&1 || return 1
  if [ "$(uname)" = "Darwin" ] && [ "$(command -v git)" = "/usr/bin/git" ]; then
    xcode-select -p >/dev/null 2>&1 || return 1
  fi
  return 0
}
if ! has_git; then
  echo "가족 위키: 혼자 쓰기 모드 (git 없음) — 가족과 공유하려면 git을 설치한 뒤 '위키 동기화 켜줘'"
  exit 0
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "가족 위키: 혼자 쓰기 모드 (아직 git 저장소가 아님) — 공유하려면 '위키 동기화 켜줘'"
  exit 0
fi
git remote | grep -q . || exit 0   # 원격이 없으면 받아올 것도 없다

if git pull --rebase --autostash --quiet >/dev/null 2>&1; then
  echo "가족 위키: 최신으로 동기화됨"
elif [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -n "$(git diff --name-only --diff-filter=U 2>/dev/null)" ]; then
  echo "가족 위키: ⚠️ 다른 가족이 고친 내용과 충돌 — 작업은 가능, '위키 커밋해줘'라고 하면 Claude가 풉니다"
else
  echo "가족 위키: ⚠️ 원격에 닿지 못함 (오프라인이거나 저장소 로그인 필요) — 작업은 가능, 나중에 자동 재시도"
fi
exit 0
