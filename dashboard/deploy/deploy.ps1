# 가족 대시보드 배포 — 집 PC에서 한 줄로
#   .\dashboard\deploy\deploy.ps1            코드가 바뀌었을 때만 서버를 다시 켠다
#   .\dashboard\deploy\deploy.ps1 -Restart   바뀐 게 없어도 다시 켠다
#
# 하는 일
#   1. 집 PC: dashboard/ 에 커밋 안 된 수정이 있으면 멈춘다(올라가지 않은 코드가 배포된 줄 착각하지 않게)
#   2. 집 PC: 최신을 받고(git pull) 내 커밋을 GitHub에 올린다(git push)
#   3. 서버: dashboard/ 를 서버에서 직접 고친 흔적이 있으면 멈추고 보여 준다(덮어쓰기 전에 알리기)
#   4. 서버: git pull → dashboard/ 가 바뀌었으면 sudo systemctl restart family-dashboard
#   5. 서버: 켜졌는지(active)와 응답(HTTP 코드)을 보여 준다
param(
  [string]$Server = "richdad-52",                       # ~/.ssh/config 의 Host 이름
  [string]$RemoteDir = "/home/USER/family-pokemon-dashboard",
  [int]$Port = 8787,                                    # 서버의 family-dashboard 가 쓰는 포트(밖에서는 nginx https :8090 → 8787)
  [switch]$Restart
)

$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $repo

function Stop-Deploy($msg) { Write-Host "❌ $msg" -ForegroundColor Red; exit 1 }

Write-Host "① 집 PC 확인" -ForegroundColor Cyan
$dirty = git status --porcelain -- dashboard
if ($dirty) {
  Write-Host $dirty
  Stop-Deploy "dashboard 코드에 커밋 안 된 수정이 있어요. 먼저 커밋한 뒤 다시 실행하세요."
}

git pull --rebase --autostash -q
if ($LASTEXITCODE -ne 0) { Stop-Deploy "최신을 받지 못했어요(git pull). 충돌이면 먼저 풀어 주세요." }
git push -q
if ($LASTEXITCODE -ne 0) { Stop-Deploy "GitHub에 올리지 못했어요(git push)." }
Write-Host ("   올린 코드: " + (git log --oneline -1))

Write-Host "② 서버 반영 ($Server)" -ForegroundColor Cyan
$force = if ($Restart) { "1" } else { "0" }
# 서버에서 돌릴 bash — 영어·작은따옴표만 쓴다(Windows PowerShell 5.1 이 큰따옴표·한글을 ssh 로 넘길 때 깨뜨린다)
$remote = @'
set -e
cd __DIR__
if git status --porcelain -- dashboard | grep -q .; then
  echo SERVER_CODE_CHANGED
  git status --short -- dashboard
  git diff --stat -- dashboard
  exit 3
fi
before=$(git rev-parse HEAD)
git pull --rebase --autostash -q
after=$(git rev-parse HEAD)
echo HEAD $(git log --oneline -1)
if [ __FORCE__ = 1 ] || ! git diff --quiet $before $after -- dashboard; then
  sudo systemctl restart family-dashboard
  echo RESTARTED
  sleep 2
else
  echo NO_CODE_CHANGE
fi
echo STATE $(systemctl is-active family-dashboard || true)
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:__PORT__/ || echo HTTP fail
'@
$remote = $remote.Replace("__DIR__", $RemoteDir).Replace("__FORCE__", $force).Replace("__PORT__", "$Port").Replace("`r", "")

$out = ssh -o ConnectTimeout=15 $Server $remote
$code = $LASTEXITCODE
foreach ($line in $out) {
  switch -Regex ($line) {
    '^SERVER_CODE_CHANGED' { Write-Host "   ⚠️ 서버에서 dashboard 코드를 직접 고친 흔적이 있어요. 덮어쓰지 않고 멈췄어요:" -ForegroundColor Yellow }
    '^HEAD (.*)'           { Write-Host "   서버 코드: $($Matches[1])" }
    '^RESTARTED'           { Write-Host "   서버를 다시 켰어요." }
    '^NO_CODE_CHANGE'      { Write-Host "   dashboard 코드는 그대로라 다시 켜지 않았어요(위키 내용만 받음)." }
    '^STATE (.*)'          { $state = $Matches[1]; Write-Host "   상태: $state" }
    '^HTTP (.*)'           { $http = $Matches[1]; $ok = if ($http -in '200','401') { " (정상 — 401은 로그인 화면)" } else { " (확인 필요)" }; Write-Host "   응답: $http$ok" }
    default                { Write-Host "   $line" }
  }
}

if ($code -eq 3) { Stop-Deploy "서버 쪽 수정을 먼저 GitHub에 합쳐야 해요(작업 계획 0-2)." }
if ($code -ne 0) { Stop-Deploy "서버 반영 중 오류가 났어요(종료 코드 $code)." }
if ($state -ne "active") { Stop-Deploy "서버가 켜져 있지 않아요. 서버에서 'sudo journalctl -u family-dashboard -n 50' 으로 오류를 보세요." }
Write-Host "✅ 배포 끝. 거실 화면은 새로고침(F5) 한 번 해 주세요." -ForegroundColor Green
