#!/usr/bin/env python3
"""
가족 대시보드 서버 — 위키 폴더를 보여 주고, 구글 캘린더를 대신 받아 준다.

왜 필요한가(쉽게):
  - 브라우저는 보안 때문에 파일을 직접 못 읽고, 구글 캘린더 주소도 직접 못 부른다(CORS).
  - 이 작은 서버가 중간에서 (1) 위키 파일을 건네주고 (2) 구글 캘린더를 받아 /calendar.ics 로 건네준다.

쓰는 법:
  python3 dashboard/serve.py            (윈도우는 python dashboard/serve.py)
                                        → 이 컴퓨터에서만: http://localhost:8000/dashboard/
  python3 dashboard/serve.py --lan      → 집 와이파이의 태블릿에서도 보기 (http://<이 컴퓨터 IP>:8000/dashboard/)
  python3 dashboard/serve.py --port 9000

화면에서 체크하기(아이 루틴·할 일):
  - 아이 할 일 화면에서 루틴을 누르면 아이들/포켓몬 기록.md 에 한 줄이 더해진다(= 포켓몬 레벨 +1).
    한 번 더 누르면 오늘 그 줄을 지운다(실수로 누른 것 되돌리기).
  - 아이 할 일을 누르면 장보기·할 일.md 에서 그 줄을 지운다(AGENTS.md §6 "했어 → 바로 지운다").
  - '할 일'·'여행 준비물' 칸의 + 버튼으로 장보기·할 일.md / 여행/다음 여행.md 에 한 줄을 더한다.
  - git이 있으면 고친 파일만 자동으로 커밋·푸시하고, 2분마다 GitHub에서 최신을 받아 온다.
    (끄려면 --no-git)

지수 ATH 대비 하락률:
  /api/indices — ~/index-ath/index_ath.py 의 compute()를 import해 5분에 한 번 받는다(네이버 → KIS → 야후).
  다른 곳에 두었으면 환경변수 INDEX_ATH_PY 로 경로를 알려 준다.

Claude 대화 자동 정리 결과 팝업:
  /api/claude-log — 대화 정리 스크립트가 남긴 ~/.claude-daily-log/last-run.json 을 건네준다.
  다른 곳에 두었으면 환경변수 CLAUDE_LOG_STATUS 로 경로를 알려 준다(스크립트와 같은 값으로).

공휴일(빨간 날):
  구글의 '대한민국의 휴일' 공개 캘린더를 하루 한 번 받아 /holidays.json 으로 건네준다(설정 필요 없음).
  '공휴일'만 고르고 '기념일'(어버이날·스승의날 등)은 뺀다. 대체공휴일·임시공휴일도 들어 있다.

구글 캘린더 연결:
  dashboard/calendar-url.txt 파일에 '우리가족' 캘린더의 "iCal 형식의 비밀 주소"를 한 줄로 넣는다.
  이 파일은 .gitignore에 들어 있어 GitHub에 올라가지 않는다. (비밀 주소 = 캘린더 열쇠. 남에게 보이면 안 된다)

로그인(이 기기 기억하기):
  python3 dashboard/serve.py --set-password   → 가족 비밀번호를 정한다(dashboard/auth.json 에 암호문만 저장).
  처음 여는 기기에서 비밀번호를 한 번 넣으면 그 기기는 1년 동안 다시 묻지 않는다.
  비밀번호를 다시 정하면 모든 기기가 로그아웃된다(잃어버린 기기 막기). 주소 /logout 은 이 기기만 로그아웃.
  auth.json 이 없으면 로그인 없이 열린다(집 안에서만 쓸 때).

필요한 것: 파이썬 3 (추가 설치 없음)
"""
import argparse
import datetime
import getpass
import hashlib
import hmac
import html
import secrets
import urllib.parse
import http.server
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # 위키 폴더(dashboard의 한 칸 위)
URL_FILE = os.path.join(ROOT, "dashboard", "calendar-url.txt")
CACHE_SEC = 300          # 구글에 5분에 한 번만 묻는다
_cache = {"at": 0.0, "body": b"", "err": ""}


def calendar_url():
    """calendar-url.txt 의 첫 줄(주석·빈 줄 제외). 없으면 None."""
    try:
        with open(URL_FILE, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    return line
    except FileNotFoundError:
        pass
    return None


def fetch_calendar():
    """구글에서 .ics를 받아 5분간 기억. 실패하면 직전 성공본을 돌려준다."""
    url = calendar_url()
    if not url:
        return None, "calendar-url.txt 없음"
    if time.time() - _cache["at"] < CACHE_SEC and _cache["body"]:
        return _cache["body"], ""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "family-dashboard"})
        with urllib.request.urlopen(req, timeout=10) as res:
            body = res.read()
        if b"BEGIN:VCALENDAR" not in body[:200]:
            raise ValueError("캘린더 형식이 아님 — 주소를 확인하세요(iCal 비밀 주소인지)")
        _cache.update(at=time.time(), body=body, err="")
        return body, ""
    except Exception as e:  # 인터넷 끊김 등
        _cache["err"] = str(e)
        return (_cache["body"] or None), str(e)


HOLIDAY_URL = "https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics"
_hol = {"at": 0.0, "days": None, "err": ""}


def fetch_holidays():
    """공휴일 {"2026-12-25": "크리스마스", ...} — 하루 동안 기억. 실패하면 직전 성공본(없으면 None)."""
    if _hol["days"] is not None and time.time() - _hol["at"] < 86400:
        return _hol["days"], ""
    try:
        req = urllib.request.Request(HOLIDAY_URL, headers={"User-Agent": "family-dashboard"})
        with urllib.request.urlopen(req, timeout=10) as res:
            text = res.read().decode("utf-8", "replace")
        text = text.replace("\r\n", "\n").replace("\n ", "").replace("\n\t", "")   # 접힌 줄 펴기
        days = {}
        for ev in text.split("BEGIN:VEVENT")[1:]:
            desc = re.search(r"^DESCRIPTION:(.*)$", ev, re.M)
            if not desc or not desc.group(1).startswith("공휴일"):
                continue                                   # '기념일'은 빨간 날이 아니다
            a = re.search(r"^DTSTART;VALUE=DATE:(\d{8})", ev, re.M)
            b = re.search(r"^DTEND;VALUE=DATE:(\d{8})", ev, re.M)
            name = re.search(r"^SUMMARY:(.*)$", ev, re.M)
            if not a:
                continue
            d = datetime.datetime.strptime(a.group(1), "%Y%m%d").date()
            end = datetime.datetime.strptime(b.group(1), "%Y%m%d").date() if b else d + datetime.timedelta(days=1)
            while d < end:
                title = (name.group(1).strip() if name else "공휴일").replace("\\,", ",")
                if title.startswith("쉬는 날 "):
                    title = title[5:] + " 대체공휴일"          # 구글 표기 '쉬는 날 개천절' → '개천절 대체공휴일'
                days[d.isoformat()] = title
                d += datetime.timedelta(days=1)
        if not days:
            raise ValueError("공휴일을 찾지 못함")
        _hol.update(at=time.time(), days=days, err="")
        return days, ""
    except Exception as e:  # 인터넷 끊김 등
        _hol["err"] = str(e)
        return _hol["days"], str(e)


# ─────────────────────────────────────────────
#  Claude Code 대화 자동 정리 결과 — 팝업용
#  대화 정리 스크립트가 실행될 때마다 이 JSON 파일에 결과를 남긴다.
#  서버는 그 파일을 읽어서 /api/claude-log 로 그대로 건네주기만 한다(판단은 화면이 한다).
#  스크립트가 도는 컴퓨터에서 serve.py 를 켰을 때만 파일이 있다 — 없으면 팝업도 없다.
# ─────────────────────────────────────────────
CLAUDE_LOG_STATUS = os.path.expanduser(os.environ.get("CLAUDE_LOG_STATUS", "~/.claude-daily-log/last-run.json"))


def read_claude_log():
    """(응답 코드, 내용) — 파일이 없으면 missing, 깨졌으면 오류로 알려 준다."""
    if not os.path.exists(CLAUDE_LOG_STATUS):
        return 404, {"ok": False, "missing": True}
    try:
        with open(CLAUDE_LOG_STATUS, encoding="utf-8") as f:
            runs = json.load(f).get("runs", [])
        return 200, {"ok": True, "runs": runs[:10]}   # 화면에는 최근 10개면 충분하다
    except (OSError, ValueError, AttributeError) as e:
        return 500, {"ok": False, "error": str(e)[:200]}


# ─────────────────────────────────────────────
#  지수 ATH 대비 하락률 — ~/index-ath/index_ath.py 를 그대로 import 한다
#  (ATH 고정값·네이버→KIS→야후 순서는 그 파일 한 곳에만 있다. 여기서 숫자를 새로 만들지 않는다)
#  그 파일이 없으면(공개 버전) 아래 DEFAULT_ATH만으로 예시 화면이 돌아가고,
#  실제 지수는 "지수를 불러오지 못했어요"로 뜬다 — 503은 안 낸다.
# ─────────────────────────────────────────────
# index_ath.py가 없을 때 쓰는 ATH 기본값 (예시 화면의 역대 최고가).
# 자기 지수의 ATH를 바꾸려면 INDEX_ATH_PY 환경변수로 index_ath.py 경로를 알려 준다.
DEFAULT_ATH = {"KOSPI": 9385.59, "KOSDAQ": 1229.42, "S&P": 7844.52, "NASDAQ": 27722.75}


class _FallbackIndexAth:
    """index_ath.py가 없을 때 쓰는 최소 대체품 — ATH 기본값만 제공하고, 가격은 받아오지 못한다."""
    ATH = DEFAULT_ATH

    def compute(self):
        raise RuntimeError("index_ath.py가 없어 지수를 받아올 수 없어요 (INDEX_ATH_PY 환경변수로 경로를 알려 주세요)")
INDEX_ATH_PY = os.path.expanduser(os.environ.get("INDEX_ATH_PY", "~/index-ath/index_ath.py"))
_idx = {"at": 0.0, "data": None, "err": "", "mod": None}
_idx_lock = threading.Lock()


def _index_module():
    if _idx["mod"] is None:
        if not os.path.exists(INDEX_ATH_PY):
            _idx["mod"] = _FallbackIndexAth()
            return _idx["mod"]
        spec = importlib.util.spec_from_file_location("index_ath", INDEX_ATH_PY)
        if not spec or not spec.loader:
            raise FileNotFoundError(INDEX_ATH_PY)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _idx["mod"] = mod
    return _idx["mod"]


def fetch_indices():
    """5분에 한 번만 묻는다. 실패하면 직전 성공본(stale)을, 그것도 없으면 None."""
    with _idx_lock:                               # 여러 화면이 동시에 열어도 한 번만 받는다
        if _idx["data"] and time.time() - _idx["at"] < CACHE_SEC:
            return _idx["data"], ""
        try:
            data = _index_module().compute()     # KIS 키가 없으면 compute()가 KIS를 조용히 건너뛴다
            _idx.update(at=time.time(), data=data, err="")
            return data, ""
        except Exception as e:                   # 인터넷 끊김·네이버 형식 변경 등
            _idx["err"] = str(e)[:300]
            return _idx["data"], _idx["err"]


# ─────────────────────────────────────────────
#  로그인 — 비밀번호 한 번 → 1년짜리 '이 기기 기억하기' 쿠키
# ─────────────────────────────────────────────
AUTH_FILE = os.path.join(ROOT, "dashboard", "auth.json")
SETUP_FILE = os.path.join(ROOT, "dashboard", "setup-key.txt")   # 브라우저에서 비밀번호 정하기용 한 번짜리 열쇠
COOKIE = "family_auth"
REMEMBER_SEC = 365 * 86400
_fails = {}                      # 아이피별 틀린 횟수 (막 넣어 보기 막기)


def load_auth():
    try:
        with open(AUTH_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), bytes.fromhex(salt), 200_000).hex()


def set_password():
    if not sys.stdin.isatty():
        make_setup_key()
        return
    pw = getpass.getpass("새 가족 비밀번호: ")
    if len(pw) < 4:
        sys.exit("4글자 이상으로 정해 주세요.")
    if pw != getpass.getpass("한 번 더: "):
        sys.exit("두 번 넣은 비밀번호가 달라요.")
    save_password(pw)
    print("저장했어요. 서버를 다시 켜지 않아도 바로 적용되고, 모든 기기는 다시 로그인해야 해요.")


def make_setup_key():
    """터미널이 없을 때: 브라우저에서 한 번만 쓸 수 있는 비밀번호 정하기 주소를 만든다"""
    key = secrets.token_urlsafe(24)
    fd = os.open(SETUP_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(key)
    print("브라우저에서 아래 주소 뒤쪽을 대시보드 주소에 붙여 열면 비밀번호를 정할 수 있어요(한 번만 쓸 수 있음):")
    print(f"  /setup?key={key}")


def save_password(pw):
    salt = secrets.token_hex(16)
    data = {"salt": salt, "hash": hash_pw(pw, salt), "secret": secrets.token_hex(32)}  # secret이 바뀌면 모든 기기 로그아웃
    fd = os.open(AUTH_FILE + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(AUTH_FILE + ".tmp", AUTH_FILE)
    try:
        os.remove(SETUP_FILE)                 # 한 번짜리 열쇠는 쓰면 버린다
    except FileNotFoundError:
        pass
    return data


def setup_key_ok(key):
    try:
        with open(SETUP_FILE) as f:
            good = f.read().strip()
    except FileNotFoundError:
        return False
    return bool(good) and hmac.compare_digest(key, good)




def make_token(auth):
    ts = str(int(time.time()))
    return ts + "." + hmac.new(auth["secret"].encode(), ts.encode(), hashlib.sha256).hexdigest()


def token_ok(auth, token):
    try:
        ts, sig = token.split(".", 1)
        good = hmac.new(auth["secret"].encode(), ts.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, good) and time.time() - int(ts) < REMEMBER_SEC
    except Exception:
        return False


LOGIN_PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>우리가족 포켓몬 월드</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(#7cc4ff,#cfeaff 45%,#eaf6dc 45%);
font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#26324a}
form{background:#fff;border:3px solid #26324a;border-radius:14px;box-shadow:0 5px 0 rgba(38,50,74,.25);padding:28px 26px;width:min(340px,calc(100vw - 32px));box-sizing:border-box}
h1{margin:0 0 4px;font-size:22px}p{margin:0 0 16px;font-size:14px;color:#5b6680}
input{width:100%;box-sizing:border-box;font-size:20px;padding:12px;border:3px solid #26324a;border-radius:10px;margin-bottom:12px}
button{width:100%;font-size:18px;font-weight:700;padding:12px;border:3px solid #26324a;border-radius:10px;background:#ffcf3f;color:#26324a}
.err{color:#e5484d;font-weight:700}
</style></head><body><form method="post" action="/login">
<h1>우리가족 포켓몬 월드</h1><p>가족 비밀번호를 넣어 주세요.<br>이 기기는 1년 동안 기억해요.</p>
{err}<input type="password" name="pw" autocomplete="current-password" autofocus required>
<input type="hidden" name="next" value="{next}"><button>들어가기</button></form>
<script>document.forms[0].onsubmit=function(){if(location.hash)this.next.value+=location.hash};</script></body></html>"""


SETUP_PAGE = (LOGIN_PAGE.replace('<form method="post" action="/login">', '<form method="post" action="/setup">')
              .replace("가족 비밀번호를 넣어 주세요.<br>이 기기는 1년 동안 기억해요.", "새 가족 비밀번호를 정해 주세요.<br>4글자 이상, 두 번 똑같이.")
              .replace('<input type="hidden" name="next" value="{next}">',
                       '<input type="password" name="pw2" autocomplete="new-password" required placeholder="한 번 더">'
                       '<input type="hidden" name="key" value="{next}">')
              .replace('autocomplete="current-password"', 'autocomplete="new-password"')
              .replace("<button>들어가기</button>", "<button>정하기</button>"))


def safe_next(n):
    """로그인 뒤 돌아갈 주소 — 이 사이트 안의 경로만 허용"""
    return n if n.startswith("/") and not n.startswith("//") and "\\" not in n else "/dashboard/"


# ─────────────────────────────────────────────
#  위키 파일 고치기 (화면에서 체크할 때)
# ─────────────────────────────────────────────
LOCK = threading.Lock()          # 동시에 두 명이 눌러도 파일이 꼬이지 않게
GIT = {"on": False}
USAGE_TOTALS_FILE = os.path.join(ROOT, "아빠", "토큰-합계.json")   # PC UsageSender가 보낸 토큰 합계(숫자만) — usage_fetch가 스냅샷에 합친다
KID_LOG = os.path.join(ROOT, "아이들", "포켓몬 기록.md")
KID_ROUTINE = os.path.join(ROOT, "아이들", "루틴.md")
FAMILY = os.path.join(ROOT, "가족 구성원.md")
TODO = os.path.join(ROOT, "장보기·할 일.md")
TRIP = os.path.join(ROOT, "여행", "다음 여행.md")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)          # 반쯤 쓰다 꺼져도 원본이 깨지지 않게


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def section_rows(text, title):
    """'## 제목' 아래 표의 줄들(머리줄·구분줄 제외)"""
    out, inside = [], False
    for line in text.splitlines():
        if re.match(r"^#{1,2}\s", line):
            inside = title in line
            continue
        if inside and line.strip().startswith("|") and not re.match(r"^\|\s*:?-{2,}", line.strip()):
            out.append(cells(line))
    return out[1:] if out else []


# ── 아이 프로필: 이름 → 성별. 자기 가족에 맞게 고친다 (config.js의 KID_PROFILES와 같은 내용).
#    성별은 상점·옷 구분에만 쓴다: "boy"는 코디(상의·하의 묶음)를, "girl"은 상의·하의·머리·원피스를 따로 고른다.
#    아이 이름은 가족 구성원.md ## 아이 표에서 오고, 여기는 성별만 정한다. 이름을 바꾸면 여기도 함께 바꾼다.
KID_PROFILES = {"첫째": "boy", "둘째": "girl"}


def kid_gender(kid):
    return KID_PROFILES.get(kid, "boy")


def kid_is_girl(kid):
    return kid_gender(kid) == "girl"


def kid_names():
    try:
        return [r[0] for r in section_rows(read(FAMILY), "아이") if r and r[0] and not r[0].startswith("(")]
    except FileNotFoundError:
        return []


def routine_names():
    try:
        t = read(KID_ROUTINE)
    except FileNotFoundError:
        return []
    return [r[0] for sec in ("아침", "점심", "오후", "저녁", "주말") for r in section_rows(t, sec) if r and r[0]]


def clean(s):
    return re.sub(r"[|\r\n]", " ", str(s or "")).strip()[:60]


def today():
    return datetime.date.today().isoformat()


def set_routine(kid, routine, done):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if routine not in routine_names():
        raise ValueError("아이들/루틴.md 에 없는 루틴")
    return log_row(kid, routine, done)


# ── 하루 완료 보너스: 그날 해야 할 루틴(주말·빨간 날엔 '평일만' 루틴 제외)을 모두 하면 🎁 두 줄(레벨 +2).
#    하나라도 취소하면 두 줄도 함께 빠진다. 봇·사람은 이 줄을 쓰지 않는다 — 서버가 계산해서 넣고 뺀다.
BONUS_DAY = "🎁 하루 완료 보너스"
BONUS_DAY_N = 2
BONUS_MARKS = ("⭐", "🎁", "🤝")                 # 루틴이 아닌 줄(스티커·보너스) — 루틴 완료로 치지 않는다


def is_bonus(s):
    return str(s).lstrip().startswith(BONUS_MARKS)


def same_routine(a, b):
    """'영어 복습' 과 '영어 복습 10분'처럼 조금 달라도 같은 루틴으로 본다(화면 sameRoutine 과 같은 규칙)"""
    x, y = re.sub(r"\s", "", a), re.sub(r"\s", "", b)
    return bool(x and y and (x in y or y in x))


def routines_due(day):
    """그날 해야 할 루틴 이름들. 주말·공휴일엔 시간 칸에 '평일'이 있는 루틴을, 평일엔 '주말'·'빨간'만 있는 루틴을 뺀다."""
    try:
        t = read(KID_ROUTINE)
    except FileNotFoundError:
        return []
    off = day.weekday() >= 5 or day.isoformat() in (fetch_holidays()[0] or {})
    def skip(when):
        if "평일" in when:
            return off
        return (not off) and ("주말" in when or "빨간" in when)
    return [r[0] for sec in ("아침", "점심", "오후", "저녁", "주말") for r in section_rows(t, sec)
            if r and r[0] and not skip(r[1] if len(r) > 1 else "")]


def apply_day_bonus(kid):
    """오늘 이 아이의 하루 완료 보너스를 맞춘다. 늘어난(+)·줄어든(-) 줄 수를 돌려준다."""
    td = today()
    need = routines_due(datetime.date.today())
    text = read(KID_LOG)
    lines = text.rstrip("\n").split("\n")
    mine = [(i, cells(l)) for i, l in enumerate(lines) if l.strip().startswith("|")]
    mine = [(i, c) for i, c in mine if len(c) >= 3 and c[0] == td and c[1] == kid]
    done = [c[2] for _, c in mine if not is_bonus(c[2])]
    all_done = bool(need) and all(any(same_routine(d, n) for d in done) for n in need)
    have = [i for i, c in mine if c[2] == BONUS_DAY]
    delta = (BONUS_DAY_N if all_done else 0) - len(have)
    if delta > 0:
        lines += [f"| {td} | {kid} | {BONUS_DAY} |"] * delta
    elif delta < 0:
        for i in sorted(have[delta:], reverse=True):     # 뒤에서부터 남는 만큼만
            del lines[i]
    else:
        return 0
    text = "\n".join(lines) + "\n"
    text = re.sub(r"^updated: .*$", f"updated: {td}", text, count=1, flags=re.M)
    write(KID_LOG, text)
    return delta


# ── 형제 보너스: 아이들이 그날 모두 '하루 완료'면 각자 🤝 한 줄(레벨 +1). 한 명이라도 깨지면 모두 뺀다.
#    역시 서버만 넣고 뺀다. 아이가 한 명뿐이면 주지 않는다.
BONUS_TEAM = "🤝 형제 보너스"


def apply_team_bonus():
    """{아이: 늘어난(+)·줄어든(-) 줄 수} — 바뀐 아이만"""
    td = today()
    kids = kid_names()
    need = routines_due(datetime.date.today())
    text = read(KID_LOG)
    lines = text.rstrip("\n").split("\n")
    rows = [(i, cells(l)) for i, l in enumerate(lines) if l.strip().startswith("|")]
    rows = [(i, c) for i, c in rows if len(c) >= 3 and c[0] == td]

    def day_done(kid):
        done = [c[2] for _, c in rows if c[1] == kid and not is_bonus(c[2])]
        return bool(need) and all(any(same_routine(d, n) for d in done) for n in need)

    team = len(kids) >= 2 and all(day_done(k) for k in kids)
    out, drop = {}, []
    for k in kids:
        have = [i for i, c in rows if c[1] == k and c[2] == BONUS_TEAM]
        delta = (1 if team else 0) - len(have)
        if delta > 0:
            lines += [f"| {td} | {k} | {BONUS_TEAM} |"] * delta
        elif delta < 0:
            drop += have[delta:]
        if delta:
            out[k] = delta
    if not out:
        return out
    for i in sorted(drop, reverse=True):
        del lines[i]
    text = "\n".join(lines) + "\n"
    text = re.sub(r"^updated: .*$", f"updated: {td}", text, count=1, flags=re.M)
    write(KID_LOG, text)
    return out


# ── 쿠폰 (아이들/쿠폰.md): | 받은 날 | 아이 | 쿠폰 | 까닭 | 쓴 날 |  — 서버가 적고, 쓰면 '쓴 날'만 채운다(줄은 지우지 않음)
COUPON = os.path.join(ROOT, "아이들", "쿠폰.md")
COUPON_WEEK = "🏪 다이소·편의점 자유 이용권 (5,000원까지)"
COUPON_TEMPLATE = """---
title: 쿠폰
type: 아이
updated: {d}
---

# 쿠폰

> 아이가 받은 쿠폰. 대시보드(서버)가 적는다. 아이가 화면에서 '사용'을 누르면 '쓴 날'이 채워진다 — 줄은 지우지 않는다.
> - 🏪 주간 보상: 월~금(빨간 날 빼고)을 모두 하루 완료하면 1장. 그 주 마지막 등교일에 준다.
> - 💗 엄마와 데이트 · 💙 아빠와 데이트: 동산 포켓몬이 5마리 늘 때마다 사다리타기로.
> 형식: `| 받은 날 | 아이 | 쿠폰 | 까닭 | 쓴 날 |` (날짜는 YYYY-MM-DD)

| 받은 날 | 아이 | 쿠폰 | 까닭 | 쓴 날 |
|---|---|---|---|---|
"""


def log_cells():
    """포켓몬 기록 표의 줄들 → [날짜, 아이, 루틴]"""
    return [c for c in (cells(l) for l in read(KID_LOG).splitlines() if l.strip().startswith("|")) if len(c) >= 3]


def day_done(rows, kid, day):
    """그날 해야 할 루틴을 모두 했나 (루틴 줄로 판단 — 🎁 줄이 없던 날도 같은 규칙)"""
    need = routines_due(day)
    done = [c[2] for c in rows if c[0] == day.isoformat() and c[1] == kid and not is_bonus(c[2])]
    return bool(need) and all(any(same_routine(d, n) for d in done) for n in need)


def school_days(day):
    """그 주 월~금 중 빨간 날이 아닌 날들"""
    mon = day - datetime.timedelta(days=day.weekday())
    hol = fetch_holidays()[0] or {}
    return [d for d in (mon + datetime.timedelta(days=i) for i in range(5)) if d.isoformat() not in hol]


def coupon_rows():
    """쿠폰 표 → (줄 번호, [받은 날, 아이, 쿠폰, 까닭, 쓴 날]) 목록과 전체 줄"""
    try:
        text = read(COUPON)
    except FileNotFoundError:
        text = COUPON_TEMPLATE.format(d=today())
    lines = text.rstrip("\n").split("\n")
    rows = []
    for i, l in enumerate(lines):
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 4 and re.match(r"\d{4}-\d{2}-\d{2}$", c[0]):
            rows.append((i, (c + [""] * 5)[:5]))
    return rows, lines


def save_coupons(lines):
    text = "\n".join(lines) + "\n"
    text = re.sub(r"^updated: .*$", f"updated: {today()}", text, count=1, flags=re.M)
    write(COUPON, text)


def apply_week_reward(kid):
    """그 주 마지막 등교일이면: 월~금(빨간 날 제외) 모두 하루 완료 → 🏪 쿠폰 +1. 그날 취소로 깨지면 안 쓴 쿠폰 -1."""
    day = datetime.date.today()
    days = school_days(day)
    if not days or day != days[-1]:
        return 0
    why = f"주간 보상 {days[0].month}/{days[0].day}~{days[-1].month}/{days[-1].day} 모두 하루 완료"
    log = log_cells()
    ok = all(day_done(log, kid, d) for d in days)
    rows, lines = coupon_rows()
    have = [(i, c) for i, c in rows if c[1] == kid and c[3] == why]
    if ok and not have:
        lines.append(f"| {today()} | {kid} | {COUPON_WEEK} | {why} | |")
        save_coupons(lines)
        return 1
    if not ok and have:
        unused = [i for i, c in have if not c[4]]
        if unused:                                    # 이미 쓴 쿠폰은 그대로 둔다
            del lines[unused[-1]]
            save_coupons(lines)
            return -1
    return 0


def use_coupon(kid, got, name, why):
    """아이가 쿠폰을 씀 → 맞는 안 쓴 줄 하나의 '쓴 날'을 오늘로"""
    rows, lines = coupon_rows()
    for i, c in rows:
        if c[0] == got and c[1] == kid and c[2] == name and c[3] == why and not c[4]:
            lines[i] = f"| {c[0]} | {c[1]} | {c[2]} | {c[3]} | {today()} |"
            save_coupons(lines)
            return True
    return False


# ── 7. 엄마·아빠 응원 한마디 (일정/응원.md): | 날짜 | 받는 아이 | 보낸 사람 | 한마디 |  — 받는 아이는 이름 또는 '모두'
CHEER = os.path.join(ROOT, "일정", "응원.md")
CHEER_TEMPLATE = """---
title: 응원
type: 일정
updated: {d}
---

# 응원

> 엄마·아빠가 아이에게 보내는 그날의 한마디. 대시보드 '아빠는 지금' 칸과 아이 동산의 포켓몬 말풍선으로 보인다. 날짜가 지나면 화면에서 사라진다.
> 형식: `| 날짜 | 받는 아이 | 보낸 사람 | 한마디 |` — 받는 아이는 이름 또는 `모두`. 엄마·아빠 메뉴에서 적는다.

| 날짜 | 받는 아이 | 보낸 사람 | 한마디 |
|---|---|---|---|
"""


def set_cheer(giver, to, text, day, add):
    # 받는 아이 '가족' = 오늘의 한마디(대시보드 '아빠는 지금' 장면 말풍선, 동산엔 안 나옴)
    if to not in ("모두", "가족") and to not in kid_names():
        raise ValueError("받는 아이를 골라 주세요")
    text = clean(text)[:40]
    if not text:
        raise ValueError("한마디를 적어 주세요")
    if not re.match(r"\d{4}-\d{2}-\d{2}$", day or ""):
        raise ValueError("날짜 형식이 달라요")
    try:
        t = read(CHEER)
    except FileNotFoundError:
        t = CHEER_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    row = f"| {day} | {to} | {giver} | {text} |"
    if add:
        lines.append(row)
    else:                                              # 내가 보낸 그 줄 하나만 지운다
        for i in range(len(lines) - 1, -1, -1):
            if lines[i].strip().startswith("|") and cells(lines[i])[:4] == [day, to, giver, text]:
                del lines[i]
                break
        else:
            return False
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(CHEER, t)
    return True


# ── 8. 성장 기록 (아이들/성장 기록.md): | 날짜 | 아이 | 키(cm) | 몸무게(kg) |  — 같은 날 같은 아이는 한 줄에 모은다
#    키는 엄마·아빠 메뉴에서만, 몸무게는 아이도(동산 화면 숫자 패드). 백분위는 계산하지 않는다(AGENTS.md 아이 기록 규칙).
GROWTH = os.path.join(ROOT, "아이들", "성장 기록.md")
GROWTH_TEMPLATE = """---
title: 성장 기록
type: 아이
updated: {d}
---

# 성장 기록

> 아이 키·몸무게를 한 표에 모은다. 대시보드 동산의 '키 나무'가 읽는다(키가 기록될 때마다 한 칸 자람).
> 키는 엄마·아빠 메뉴에서, 몸무게는 아이가 동산 화면에서 적는다. 같은 날 같은 아이는 한 줄. 모르는 칸은 비워 둔다.
> 성장 백분위는 어림하지 않는다. 외부에 공유하지 않는다.
> 형식: `| 날짜 | 아이 | 키(cm) | 몸무게(kg) |`

| 날짜 | 아이 | 키(cm) | 몸무게(kg) |
|---|---|---|---|
"""


# ── 8-3. 캐릭터 코디 (아이들/캐릭터.md): | 아이 | 코디 | 바꾼 날 | — 아이마다 한 줄. 코디 1(기본)·2·3
#    아이 할 일 화면의 '👕 옷 갈아입기'에서 고른다.
#    코디 4·5는 남자 아이만 상점에서 사는 옷 — 4번 농구 유니폼·5번 공룡 후드티, 5토큰. 가진 코디는 아이들/코디.md.
OUTFIT = os.path.join(ROOT, "아이들", "캐릭터.md")
OUTFIT_MAX = 5
OUTFIT_SHOP = (4, 5)
OUTFIT_TEMPLATE = """---
title: 캐릭터
type: 아이
updated: {d}
---

# 캐릭터 코디

> 아이가 대시보드 '○○ 할 일' 화면의 캐릭터에서 '👕 옷 갈아입기'로 고른 코디. 아이마다 한 줄. 코디 1 = 기본 옷.
> 형식: `| 아이 | 코디 | 바꾼 날 |`

| 아이 | 코디 | 바꾼 날 |
|---|---|---|
"""

# ── 14-7. 🛍️ 상점 남자 코디 (아이들/코디.md): | 아이 | 코디 | 산 날 | — 남자 아이만 사는 코디 4·5.
#    코디 1~3은 무료(기본·LG 트윈스·축구 유니폼), 4번 농구 유니폼·5번 공룡 후드티는 5토큰.
BOUGHT_OUTFIT = os.path.join(ROOT, "아이들", "코디.md")
BOUGHT_OUTFIT_TEMPLATE = """---
title: 산 코디
type: 아이
updated: {d}
---

# 산 코디

> 남자 아이가 대시보드 상점에서 산 코디. 코디 4 = 농구 유니폼, 5 = 공룡 후드티. 5토큰.
> 형식: 가진 코디 `| 아이 | 코디 | 산 날 |`

## 가진 코디

| 아이 | 코디 | 산 날 |
|---|---|---|
"""


def outfits_owned(kid):
    if kid_is_girl(kid):
        return {1, 2, 3}
    t = _read_or_template(BOUGHT_OUTFIT, BOUGHT_OUTFIT_TEMPLATE)
    owned = {1, 2, 3}
    for l in t.split("\n"):
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 2 and c[0] == kid:
            try:
                owned.add(int(c[1]))
            except ValueError:
                pass
    return owned


def buy_outfit(kid, n):
    if kid_is_girl(kid):
        raise ValueError("코디는 남자 아이만 살 수 있어요")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("코디 번호가 이상해요")
    if n not in OUTFIT_SHOP:
        raise ValueError("상점에서 파는 코디가 아니에요")
    t = _read_or_template(BOUGHT_OUTFIT, BOUGHT_OUTFIT_TEMPLATE)
    lines = t.rstrip("\n").split("\n")
    if _section_has(lines, "가진 코디", kid, n):
        return False
    price = _shop_price(SHOP_OUTFIT_PRICE)
    if price > 0:
        if token_balance(kid) < price:
            raise ValueError(f"토큰이 부족해요 ({token_balance(kid)}토큰, {price}토큰 필요)")
        token_add(kid, -price, f"🛍️ 상점 {SHOP_OUTFIT_NAMES[n - 4]}")
    lines, _ = _section_add(lines, "가진 코디", kid, n)
    _shop_save(BOUGHT_OUTFIT, "\n".join(lines) + "\n")
    return True


def set_outfit(kid, n):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("코디 번호가 이상해요")
    if not 1 <= n <= OUTFIT_MAX:
        raise ValueError("없는 코디예요")
    if n in OUTFIT_SHOP and n not in outfits_owned(kid):
        raise ValueError("아직 안 산 코디예요. 상점에서 먼저 사세요")
    try:
        t = read(OUTFIT)
    except FileNotFoundError:
        t = OUTFIT_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    row = f"| {kid} | {n} | {today()} |"
    for i, l in enumerate(lines):
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 2 and c[0] == kid:
            if c[1] == str(n):
                return False
            lines[i] = row
            break
    else:
        lines.append(row)
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(OUTFIT, t)
    return True


# ── 14-3. 캐릭터 머리 (아이들/머리.md): | 아이 | 머리 | 바꾼 날 | — 여자 아이만 따로 고른다.
#    머리 1(기본 단발)·2(똥머리).
HAIR = os.path.join(ROOT, "아이들", "머리.md")
HAIR_MAX = 2
HAIR_TEMPLATE = """---
title: 머리
type: 아이
updated: {d}
---

# 캐릭터 머리

> 여자 아이가 대시보드 '○○ 할 일' 화면의 캐릭터에서 '👕 옷 갈아입기'로 고른 머리. 머리 1 = 기본 단발.
> 형식: `| 아이 | 머리 | 바꾼 날 |`

| 아이 | 머리 | 바꾼 날 |
|---|---|---|
"""


def set_hair(kid, h):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if not kid_is_girl(kid):
        raise ValueError("머리는 여자 아이만 바꿀 수 있어요")
    try:
        h = int(h)
    except (TypeError, ValueError):
        raise ValueError("머리 번호가 이상해요")
    if not 1 <= h <= HAIR_MAX:
        raise ValueError("없는 머리예요")
    try:
        t = read(HAIR)
    except FileNotFoundError:
        t = HAIR_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    row = f"| {kid} | {h} | {today()} |"
    for i, l in enumerate(lines):
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 2 and c[0] == kid:
            if c[1] == str(h):
                return False
            lines[i] = row
            break
    else:
        lines.append(row)
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(HAIR, t)
    return True


# ── 14-5. 캐릭터 상의·하의 (아이들/상의.md · 아이들/하의.md): | 아이 | 상의/하의 | 바꾼 날 | — 여자 아이만 따로 고른다(모자 대신 옷만).
#    상의 1(분홍 가디건)·2(흰 하트 티)·3(노란 줄무늬 티), 하의 1(연보라 치마)·2(분홍 치마)·3(파란 데님 반바지), 모두 무료.
#    (1,1)은 기본 옷, (2,2)는 티+치마, 나머지 7조합은 상의·하의 조합.
TOP = os.path.join(ROOT, "아이들", "상의.md")
TOP_MAX = 3
TOP_TEMPLATE = """---
title: 상의
type: 아이
updated: {d}
---

# 캐릭터 상의

> 여자 아이가 대시보드 '○○ 할 일' 화면의 캐릭터에서 '👕 옷 갈아입기'로 고른 상의. 상의 1 = 분홍 가디건. 모두 무료.
> 형식: `| 아이 | 상의 | 바꾼 날 |`

| 아이 | 상의 | 바꾼 날 |
|---|---|---|
"""


def set_top(kid, n):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if not kid_is_girl(kid):
        raise ValueError("상의는 여자 아이만 바꿀 수 있어요")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("상의 번호가 이상해요")
    if not 1 <= n <= TOP_MAX:
        raise ValueError("없는 상의예요")
    try:
        t = read(TOP)
    except FileNotFoundError:
        t = TOP_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    row = f"| {kid} | {n} | {today()} |"
    for i, l in enumerate(lines):
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 2 and c[0] == kid:
            if c[1] == str(n):
                return False
            lines[i] = row
            break
    else:
        lines.append(row)
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(TOP, t)
    # 상의를 고르면 원피스는 벗는다 (원피스와 상의·하의는 같이 못 입는다)
    set_dress(kid, 0)
    return True


BOTTOM = os.path.join(ROOT, "아이들", "하의.md")
BOTTOM_MAX = 3
BOTTOM_TEMPLATE = """---
title: 하의
type: 아이
updated: {d}
---

# 캐릭터 하의

> 여자 아이가 대시보드 '○○ 할 일' 화면의 캐릭터에서 '👕 옷 갈아입기'로 고른 하의. 하의 1 = 연보라 치마. 모두 무료.
> 형식: `| 아이 | 하의 | 바꾼 날 |`

| 아이 | 하의 | 바꾼 날 |
|---|---|---|
"""


def set_bottom(kid, n):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if not kid_is_girl(kid):
        raise ValueError("하의는 여자 아이만 바꿀 수 있어요")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("하의 번호가 이상해요")
    if not 1 <= n <= BOTTOM_MAX:
        raise ValueError("없는 하의예요")
    try:
        t = read(BOTTOM)
    except FileNotFoundError:
        t = BOTTOM_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    row = f"| {kid} | {n} | {today()} |"
    for i, l in enumerate(lines):
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 2 and c[0] == kid:
            if c[1] == str(n):
                return False
            lines[i] = row
            break
    else:
        lines.append(row)
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(BOTTOM, t)
    # 하의를 고르면 원피스는 벗는다 (원피스와 상의·하의는 같이 못 입는다)
    set_dress(kid, 0)
    return True


# ── 14-4. 토큰 (아이들/토큰.md) — 2026-11-15 아빠 요청. 모자 상점은 2026-11-15에 뺌(모자가 어색하게 보여서).
#    토큰 벌기: 루틴을 해도 토큰이 안 생긴다. 토큰은 동산 풀어주기(등급별 D50·C60·B70·A80·S90·SS100)와 놀이방 게임 시간(10분마다 1토큰)으로만 생긴다. 퀴즈는 토큰이 안 된다.
#    잔액은 토큰 장부의 변화 합계. 지금은 쓸 곳이 없어서 쌓이기만 한다.
TOKEN = os.path.join(ROOT, "아이들", "토큰.md")
TOKEN_TEMPLATE = """---
title: 토큰
type: 아이
updated: {d}
---

# 토큰

> 아이 토큰 장부. 대시보드가 적는다. 토큰은 동산 풀어주기(등급별)와 놀이방 게임 시간(10분마다 1토큰)으로만 생긴다. 루틴을 해도 토큰이 안 생긴다. 잔액은 변화 합계.
> 형식: `| 날짜 | 아이 | 변화 | 까닭 |`

## 토큰 장부

| 날짜 | 아이 | 변화 | 까닭 |
|---|---|---|---|
"""

TOKEN_EARN_DAY = "🎁 하루 완료 보너스"
TOKEN_EARN_TEAM = "🤝 형제 보너스"


def token_balance(kid):
    """그 아이의 토큰 잔액 = 토큰 장부 변화 합계"""
    try:
        rows = section_rows(read(TOKEN), "토큰 장부")
    except FileNotFoundError:
        return 0
    total = 0
    for r in rows:
        if len(r) >= 3 and r[1] == kid:
            try:
                total += int(r[2])
            except ValueError:
                pass
    return total


def token_add(kid, delta, why):
    """토큰 장부에 한 줄 더한다. delta는 정수(+1·-5·0)"""
    try:
        t = read(TOKEN)
    except FileNotFoundError:
        t = TOKEN_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    lines.append(f"| {today()} | {kid} | {delta:+d} | {why} |" if delta else f"| {today()} | {kid} | 0 | {why} |")
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(TOKEN, t)


def sync_tokens():
    """루틴 토큰 적립은 2026-11-15 아빠 결정으로 없앴다(루틴을 해도 토큰이 안 생긴다).
    토큰은 동산 풀어주기(등급별)와 놀이방 게임 시간(10분마다 1토큰)으로만 생긴다. 그래서 맞출 게 없어서 항상 False.
    (예전 루틴 적립 줄이 남아 있으면 손으로 빼야 한다 — 이 함수는 안 건드린다.)"""
    return False


# ── 14-6. 🛍️ 상점 (아이들/원피스.md · 아이들/신발.md · 아이들/패딩.md · 아이들/코디.md) — 2026-11-15 아빠 요청.
#    원피스(여자 아이만) 4색 — 1번 분홍만 무료, 나머지 2~4번은 5토큰 (한 개만 무료, 나머지 5토큰).
#    신발 5토큰 — 여자 아이(빨간 운동화·검정 구두), 남자 아이(파란 운동화·노란 운동화). 검정 패딩(남자·여자 다) 6토큰.
#    남자 코디(남자 아이만) 2벌 — 4번 농구 유니폼·5번 공룡 후드티, 5토큰 (1~3번은 무료).
#    SHOP_TEST = True 동안은 전부 무료. 2026-11-15 아빠 요청으로 테스트를 끝내고 False로 바꿨다 — 가진 옷은 그대로, 새로 사는 것만 유료.
SHOP_TEST = False
SHOP_DRESS_PRICE = 5
SHOP_DRESS_FREE = 1
SHOP_SHOE_PRICE = 5
SHOP_PADDING_PRICE = 6
SHOP_OUTFIT_PRICE = 5
SHOP_DRESS_NAMES = ["분홍 원피스", "노랑 원피스", "파랑 원피스", "초록 원피스"]
SHOP_SHOE_NAMES = ["빨간 운동화", "검정 구두"]           # 여자 아이 신발
SHOP_SHOE_NAMES_BOY = ["파란 운동화", "노란 운동화"]   # 남자 아이 신발
SHOP_OUTFIT_NAMES = ["농구 유니폼", "공룡 후드티"]
SHOP_PADDING_NAME = "검정 패딩"


def _shop_shoe_name(kid, n):
    return (SHOP_SHOE_NAMES if kid_is_girl(kid) else SHOP_SHOE_NAMES_BOY)[n - 1]


def _shop_price(base):
    return 0 if SHOP_TEST else base


def _read_or_template(path, template):
    try:
        return read(path)
    except FileNotFoundError:
        return template.format(d=today())


def _shop_save(path, t):
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(path, t)


def _section_upsert(lines, section, kid, n):
    """'## section' 표에서 그 아이 줄을 n으로 바꾸거나 없으면 더한다. (줄 목록, 바뀜 여부)"""
    sec_i = None
    for i, l in enumerate(lines):
        if re.match(r"^#{1,2}\s", l) and section in l:
            sec_i = i
            break
    if sec_i is None:
        raise ValueError("파일에 그 칸이 없어요")
    insert_at = sec_i + 1
    j = sec_i + 1
    while j < len(lines):
        l = lines[j]
        if re.match(r"^#{1,2}\s", l):
            break
        if l.strip().startswith("|"):
            c = cells(l)
            insert_at = j + 1
            if len(c) >= 2 and c[0] == kid and c[0] != "아이":
                if c[1] == str(n):
                    return lines, False
                lines[j] = f"| {kid} | {n} | {today()} |"
                return lines, True
        j += 1
    lines.insert(insert_at, f"| {kid} | {n} | {today()} |")
    return lines, True


def _section_add(lines, section, kid, n):
    """'## section' 표에 (아이, n) 줄을 더한다. 이미 있으면 안 더한다. (줄 목록, 바뀜 여부)
    가진 원피스·가진 신발처럼 한 아이가 여러 개를 가질 수 있는 칸용. 한 아이가 한 줄만 갖는 칸(쓰는 원피스 등)은 _section_upsert를 쓴다."""
    sec_i = None
    for i, l in enumerate(lines):
        if re.match(r"^#{1,2}\s", l) and section in l:
            sec_i = i
            break
    if sec_i is None:
        raise ValueError("파일에 그 칸이 없어요")
    insert_at = sec_i + 1
    j = sec_i + 1
    while j < len(lines):
        l = lines[j]
        if re.match(r"^#{1,2}\s", l):
            break
        if l.strip().startswith("|"):
            c = cells(l)
            insert_at = j + 1
            if len(c) >= 2 and c[0] == kid and c[1] == str(n):
                return lines, False
        j += 1
    lines.insert(insert_at, f"| {kid} | {n} | {today()} |")
    return lines, True


def _section_has(lines, section, kid, n):
    """'## section' 표에 그 아이의 n 줄이 있는지"""
    in_sec = False
    for l in lines:
        if re.match(r"^#{1,2}\s", l):
            in_sec = section in l
            continue
        if in_sec and l.strip().startswith("|"):
            c = cells(l)
            if len(c) >= 2 and c[0] == kid and c[1] == str(n):
                return True
    return False


DRESS = os.path.join(ROOT, "아이들", "원피스.md")
DRESS_MAX = 4
DRESS_TEMPLATE = """---
title: 원피스
type: 아이
updated: {d}
---

# 캐릭터 원피스

> 여자 아이가 대시보드 상점에서 산 원피스. 원피스 1 = 분홍(무료), 2 = 노랑, 3 = 파랑, 4 = 초록 (2~4번은 5토큰).
> 형식: 가진 원피스 `| 아이 | 원피스 | 산 날 |`, 쓰는 원피스 `| 아이 | 원피스 | 바꾼 날 |` (0 = 안 입음, 상의·하의로 입음)

## 가진 원피스

| 아이 | 원피스 | 산 날 |
|---|---|---|

## 쓰는 원피스

| 아이 | 원피스 | 바꾼 날 |
|---|---|---|
"""


def _dress_migrate(t):
    """옛 원피스 파일(표 하나)을 새 형식(가진 원피스·쓰는 원피스)으로 바꾼다. 옛날에 입고 있던 원피스는 산 것으로 친다(그때는 전부 무료였다)."""
    if "## 쓰는 원피스" in t:
        return t
    worn = {}
    for l in t.split("\n"):
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 2 and c[0] and c[0] != "아이" and c[1].isdigit():
            worn[c[0]] = int(c[1])
    lines = DRESS_TEMPLATE.format(d=today()).rstrip("\n").split("\n")
    for k, n in worn.items():
        if n >= 1:
            if n != SHOP_DRESS_FREE:
                lines, _ = _section_add(lines, "가진 원피스", k, n)
            lines, _ = _section_upsert(lines, "쓰는 원피스", k, n)
    return "\n".join(lines) + "\n"


def dress_owned(kid):
    """그 아이가 가진 원피스 번호들. 1번(분홍)은 무료라서 언제나 가진 것으로 친다."""
    try:
        t = read(DRESS)
    except FileNotFoundError:
        return {SHOP_DRESS_FREE}
    owned = {SHOP_DRESS_FREE}
    for r in section_rows(t, "가진 원피스"):
        if len(r) >= 2 and r[0] == kid and r[1].isdigit():
            owned.add(int(r[1]))
    # 옛 형식(표 하나) 파일이면 입고 있던 원피스는 산 것으로 친다(그때는 전부 무료였다)
    if "## 쓰는 원피스" not in t:
        for l in t.splitlines():
            c = cells(l) if l.strip().startswith("|") else []
            if len(c) >= 2 and c[0] == kid and c[1].isdigit() and int(c[1]) >= 1:
                owned.add(int(c[1]))
    return owned


def buy_dress(kid, n):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if not kid_is_girl(kid):
        raise ValueError("원피스는 여자 아이만 살 수 있어요")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("원피스 번호가 이상해요")
    if not 1 <= n <= DRESS_MAX:
        raise ValueError("없는 원피스예요")
    if n == SHOP_DRESS_FREE:
        return False
    t = _dress_migrate(_read_or_template(DRESS, DRESS_TEMPLATE))
    lines = t.rstrip("\n").split("\n")
    if _section_has(lines, "가진 원피스", kid, n):
        return False
    price = _shop_price(SHOP_DRESS_PRICE)
    if price > 0:
        if token_balance(kid) < price:
            raise ValueError(f"토큰이 부족해요 ({token_balance(kid)}토큰, {price}토큰 필요)")
        token_add(kid, -price, f"🛍️ 상점 {SHOP_DRESS_NAMES[n - 1]}")
    lines, _ = _section_add(lines, "가진 원피스", kid, n)
    _shop_save(DRESS, "\n".join(lines) + "\n")
    return True


def set_dress(kid, n):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if not kid_is_girl(kid):
        raise ValueError("원피스는 여자 아이만 입을 수 있어요")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("원피스 번호가 이상해요")
    if not 0 <= n <= DRESS_MAX:
        raise ValueError("없는 원피스예요")
    t = _dress_migrate(_read_or_template(DRESS, DRESS_TEMPLATE))
    lines = t.rstrip("\n").split("\n")
    if n > 0 and n != SHOP_DRESS_FREE and not _section_has(lines, "가진 원피스", kid, n):
        raise ValueError("아직 안 산 원피스예요. 상점에서 먼저 사세요")
    lines, changed = _section_upsert(lines, "쓰는 원피스", kid, n)
    if not changed:
        return False
    _shop_save(DRESS, "\n".join(lines) + "\n")
    return True


SHOES = os.path.join(ROOT, "아이들", "신발.md")
SHOES_MAX = 2
SHOES_TEMPLATE = """---
title: 신발
type: 아이
updated: {d}
---

# 캐릭터 신발

> 대시보드 상점에서 산 신발. 여자 아이 1 = 빨간 운동화, 2 = 검정 구두. 남자 아이 1 = 파란 운동화, 2 = 노란 운동화. 5토큰.
> 형식: 가진 신발 `| 아이 | 신발 | 산 날 |`, 쓰는 신발 `| 아이 | 신발 | 바꾼 날 |`

## 가진 신발

| 아이 | 신발 | 산 날 |
|---|---|---|

## 쓰는 신발

| 아이 | 신발 | 바꾼 날 |
|---|---|---|
"""


def buy_shoes(kid, n):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("신발 번호가 이상해요")
    if not 1 <= n <= SHOES_MAX:
        raise ValueError("없는 신발이에요")
    t = _read_or_template(SHOES, SHOES_TEMPLATE)
    lines = t.rstrip("\n").split("\n")
    if _section_has(lines, "가진 신발", kid, n):
        return False
    price = _shop_price(SHOP_SHOE_PRICE)
    if price > 0:
        if token_balance(kid) < price:
            raise ValueError(f"토큰이 부족해요 ({token_balance(kid)}토큰, {price}토큰 필요)")
        token_add(kid, -price, f"🛍️ 상점 {_shop_shoe_name(kid, n)}")
    lines, _ = _section_add(lines, "가진 신발", kid, n)
    _shop_save(SHOES, "\n".join(lines) + "\n")
    return True


def set_shoes(kid, n):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    try:
        n = int(n)
    except (TypeError, ValueError):
        raise ValueError("신발 번호가 이상해요")
    if not 0 <= n <= SHOES_MAX:
        raise ValueError("없는 신발이에요")
    t = _read_or_template(SHOES, SHOES_TEMPLATE)
    lines = t.rstrip("\n").split("\n")
    if n > 0 and not _section_has(lines, "가진 신발", kid, n):
        raise ValueError("아직 안 산 신발이에요. 상점에서 먼저 사세요")
    lines, changed = _section_upsert(lines, "쓰는 신발", kid, n)
    if not changed:
        return False
    _shop_save(SHOES, "\n".join(lines) + "\n")
    return True


PADDING = os.path.join(ROOT, "아이들", "패딩.md")
PADDING_TEMPLATE = """---
title: 패딩
type: 아이
updated: {d}
---

# 캐릭터 패딩

> 아이가 대시보드 상점에서 산 검정 패딩. 남자·여자 다 입을 수 있다. 6토큰 (테스트 동안 무료).
> 형식: 가진 패딩 `| 아이 | 패딩 | 산 날 |`, 쓰는 패딩 `| 아이 | 패딩 | 바꾼 날 |` (1 = 입음, 0 = 안 입음)

## 가진 패딩

| 아이 | 패딩 | 산 날 |
|---|---|---|

## 쓰는 패딩

| 아이 | 패딩 | 바꾼 날 |
|---|---|---|
"""


def buy_padding(kid):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    t = _read_or_template(PADDING, PADDING_TEMPLATE)
    lines = t.rstrip("\n").split("\n")
    if _section_has(lines, "가진 패딩", kid, 1):
        return False
    price = _shop_price(SHOP_PADDING_PRICE)
    if price > 0:
        if token_balance(kid) < price:
            raise ValueError(f"토큰이 부족해요 ({token_balance(kid)}토큰, {price}토큰 필요)")
        token_add(kid, -price, f"🛍️ 상점 {SHOP_PADDING_NAME}")
    lines, _ = _section_upsert(lines, "가진 패딩", kid, 1)
    _shop_save(PADDING, "\n".join(lines) + "\n")
    return True


def set_padding(kid, on):
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    try:
        on = int(on)
    except (TypeError, ValueError):
        raise ValueError("패딩 번호가 이상해요")
    if on not in (0, 1):
        raise ValueError("패딩은 입거나(1) 벗거나(0)예요")
    t = _read_or_template(PADDING, PADDING_TEMPLATE)
    lines = t.rstrip("\n").split("\n")
    if on == 1 and not _section_has(lines, "가진 패딩", kid, 1):
        raise ValueError("아직 안 산 패딩이에요. 상점에서 먼저 사세요")
    lines, changed = _section_upsert(lines, "쓰는 패딩", kid, on)
    if not changed:
        return False
    _shop_save(PADDING, "\n".join(lines) + "\n")
    return True


# ── 14-8. 🕊️ 동산에서 풀어주기 → 등급별 토큰 (2026-11-15 아빠 요청)
#    동산 포켓몬을 풀어주면 등급별 토큰을 받는다. 도감에는 그대로 남는다(도감 met은 들어온 적 있으면 유지 — pokeState가 - 장부 줄을 동산에서만 빼고 met에서는 안 뺀다).
#    등급은 dashboard/js/pokemon.js POKE_TIER와 같은 기준(종족값) — 바꾸면 여기도 같이 바꾼다.
RELEASE_TIER_DEX = {
    "SS": {150, 249, 250, 384, 483, 484, 487, 643, 644},
    "S": {149, 151, 248, 373, 376, 445, 635},
    "A": {3, 6, 9, 134, 135, 136, 143, 154, 157, 160, 196, 197, 254, 257, 260, 282, 289, 306, 330, 389, 392, 395, 468, 470, 471, 473, 497, 612, 700},
    "B": {26, 36, 45, 55, 62, 65, 68, 71, 76, 94, 181, 272, 275},
    "C": {2, 5, 8, 18, 20, 40, 53, 64, 67, 93, 148, 153, 156, 159, 164, 176, 184, 221, 247, 253, 256, 259, 288, 305, 372, 375, 388, 391, 394, 417, 444, 496, 611, 634, 945},
}
# 등급별 풀어주기 토큰 (2026-11-15 아빠 요청: 차이가 너무 크지 않게, 50부터 10씩)
TIER_TOKEN = {"SS": 100, "S": 90, "A": 80, "B": 70, "C": 60, "D": 50}


def release_tier(dex):
    for t, s in RELEASE_TIER_DEX.items():
        if dex in s:
            return t
    return "D"


def release_token(tier):
    return TIER_TOKEN.get(tier, 50)


def release_pokemon(kid, dex, name):
    """동산 포켓몬 한 마리를 풀어준다. 동산 장부에 - 줄을 적고 등급별 토큰을 준다. 도감에는 남는다.
    (dex, tier, tokens)를 돌려준다."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    try:
        dex = int(dex)
    except (TypeError, ValueError):
        raise ValueError("도감번호가 이상해요")
    if not 1 <= dex <= 1100:
        raise ValueError("없는 포켓몬이에요")
    name = clean(name) or f"#{dex}"
    if garden_count(kid) <= 0:
        raise ValueError("동산에 포켓몬이 없어요")
    # 동산에 있는지: 장부(찾아옴·교환)로 들어온 친구면 장부에 +가 남아 있고, 졸업한 친구는 프론트(pokeState)가 안다.
    # 서버는 장부로 확인되는 친구가 아니면 졸업한 친구로 본다(졸업 주기가 있으면 풀어준다).
    if friend_in_garden(kid, dex) is None:
        grads = sum(1 for c in log_cells() if c[1] == kid and re.match(r"\d{4}-\d{2}-\d{2}$", c[0])) // POKE_CYCLE
        if grads <= 0:
            raise ValueError("동산에 그 포켓몬이 없어요")
    tier = release_tier(dex)
    tokens = release_token(tier)
    ledger_add(kid, "-", dex, name, "풀어줌")
    token_add(kid, tokens, f"🌳 동산 {name} 풀어줌 ({tier}등급)")
    return dex, tier, tokens


# ── 14-7. 스티커 팝업(예전 칭찬 스티커 보기): 아이가 자기 할 일 화면(#todo-N)에 들어오면, 아직 안 본 예전 칭찬 스티커를
#    스티커 내용 → 그 스티커가 올린 포켓몬 레벨업 순으로 보여준다. 누가 접속했는지는 할 일 화면이 안다
#    (할 일 화면은 아이마다 따로 #todo-0·1·2 — 아이가 자기 이름을 눌러 들어오면 그 아이 거다. 따로 로그인 안 한다).
#    본 표시는 위키 밖 sticker-shown.json 에(아이마다, 스티커 내용마다 본 횟수) — 거실 화면·폰 어디서 봐도 한 번만.
STICKER_SHOWN = os.environ.get("FAMILY_STICKER_SHOWN_FILE") or os.path.join(os.path.expanduser("~"), ".config", "family-dashboard", "sticker-shown.json")

_STICKER_RE = re.compile(r"^⭐ 칭찬 (.+) \((.+)\)$")


def _sticker_shown_load():
    try:
        with open(STICKER_SHOWN, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def _sticker_shown_save(data):
    os.makedirs(os.path.dirname(STICKER_SHOWN), mode=0o700, exist_ok=True)
    with open(STICKER_SHOWN + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(STICKER_SHOWN + ".tmp", STICKER_SHOWN)


def sticker_pending(kid):
    """아직 안 본 예전 칭찬 스티커들 [{id, date, reason, giver, before}] — 오래된 것부터.
    id = 날짜|스티커 줄. 같은 내용을 같은 날 두 번 받으면 두 번 보여준다(본 횟수로 센다).
    before = 그 스티커 줄이 아이 기록에서 몇 번째인지(그 스티커가 올리기 전 줄 수) — 화면이
    pokeEvent(kid, before)로 그 스티커가 올린 레벨업을 그대로 다시 보여준다."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    shown = _sticker_shown_load().get(kid, {})
    rows = [c for c in log_cells() if c[1] == kid]
    seen_n = {}
    out = []
    for i, c in enumerate(rows):
        m = _STICKER_RE.match((c[2] or "").strip())
        if not m:
            continue
        sid = f"{c[0]}|{c[2].strip()}"
        n = seen_n.get(sid, 0)
        seen_n[sid] = n + 1
        if n < shown.get(sid, 0):
            continue
        out.append({"id": sid, "date": c[0], "reason": m.group(1), "giver": m.group(2), "before": i})
    return out


def sticker_mark_shown(kid, ids):
    """본 스티커 표시: id마다 본 횟수 +1. 기록에 없는(지워진) 스티커는 안 센다."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    live = {f"{c[0]}|{c[2].strip()}" for c in log_cells() if c[1] == kid and _STICKER_RE.match((c[2] or "").strip())}
    data = _sticker_shown_load()
    mine = data.get(kid, {})
    changed = False
    for sid in ids or []:
        if not isinstance(sid, str) or sid not in live:
            continue
        mine[sid] = mine.get(sid, 0) + 1
        changed = True
    if changed:
        data[kid] = mine
        _sticker_shown_save(data)
    return changed


# ── 9-1. 영어 '들었어요' 미루기 (2026-11-17 아빠 요청): 엄마·아빠가 '들었어요'로 준 영어 스티커는
#    부모 화면에서 바로 축하하지 않고, 아이가 자기 동산(#garden-N)에 들어갈 때 스티커 내용 → 레벨업 순으로
#    보여준다. 로그 줄(`⭐ 영어 퀴즈 <단어>`)만으로는 직접 읽은 건지 '들었어요'인지 구분이 안 돼서,
#    '들었어요'로 줄 때만 이 파일(quiz-heard-pending.json, 위키 밖)에 미룰 항목을 따로 적는다.
#    아이가 직접 🎤 따라 읽기로 성공한 건 미루지 않는다(그 자리에서 바로 축하).
#    본 표시는 sticker-shown.json / friend-shown.json 과 같은 방식 — 거실·폰 어디서 봐도 한 번만.
QUIZ_HEARD_FILE = os.environ.get("FAMILY_QUIZ_HEARD_FILE") or os.path.join(os.path.expanduser("~"), ".config", "family-dashboard", "quiz-heard-pending.json")


def _quiz_heard_load():
    try:
        with open(QUIZ_HEARD_FILE, encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (FileNotFoundError, ValueError):
        return {}


def _quiz_heard_save(data):
    os.makedirs(os.path.dirname(QUIZ_HEARD_FILE), mode=0o700, exist_ok=True)
    with open(QUIZ_HEARD_FILE + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(QUIZ_HEARD_FILE + ".tmp", QUIZ_HEARD_FILE)


def quiz_heard_add(kid, word, giver, before):
    """'들었어요'로 준 영어 스티커를 미룰 목록에 추가. [{id, date, word, giver, before}]
    id = 날짜|⭐ 영어 퀴즈 <단어> — 하루 아이당 1장이라 날짜+단어로 유일하다.
    before = 그 스티커 줄이 아이 기록에서 몇 번째인지(올리기 전 줄 수)."""
    data = _quiz_heard_load()
    mine = data.get(kid, [])
    qid = f"{today()}|{QUIZ} {word}"
    if any((q.get("id") == qid) for q in mine):
        return
    mine.append({"id": qid, "date": today(), "word": word, "giver": giver or "엄마·아빠", "before": before})
    data[kid] = mine
    _quiz_heard_save(data)


def quiz_heard_pending(kid):
    """아직 안 본 '들었어요' 영어 스티커들 — 오래된 것부터."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    return list(_quiz_heard_load().get(kid, []))


def quiz_heard_mark_shown(kid, ids):
    """본 '들었어요' 영어 스티커 표시: 본 것은 미룰 목록에서 지운다(다시 안 뜬다)."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    data = _quiz_heard_load()
    mine = data.get(kid, [])
    keep = [q for q in mine if q.get("id") not in (ids or [])]
    if len(keep) != len(mine):
        data[kid] = keep
        _quiz_heard_save(data)
        return True
    return False


# ── 14-9. 🏦 은행 (아이들/은행.md) — 2026-11-15 아빠 요청. 각 아이 할 일 창에 은행을 만들고 토큰을 맡긴다.
#    기간은 7·14·21·28일만(기본 7일, 최대 28일). 일 금리: 7일 10% · 14일 15% · 21일 20% · 28일 25%.
#    일 금리라 매일 원금의 금리만큼 이자가 붙는다(단리 — 이자에 이자가 안 붙는다). 만기가 되면 원금+이자를 찾는다.
BANK = os.path.join(ROOT, "아이들", "은행.md")
BANK_RATES = {7: 10, 14: 15, 21: 20, 28: 25}   # 기간(일) → 일 금리(%)
BANK_TEMPLATE = """---
title: 아이 은행
type: 메모
updated: {d}
---

# 아이 은행

> 은행에 토큰을 맡기면 매일 이자가 붙어요. 기간이 길수록 일 금리가 높아요. 7일 10% · 14일 15% · 21일 20% · 28일 25% (일 금리, 단리 — 매일 원금의 금리만큼 이자가 붙어요). 만기가 되면 원금+이자를 찾을 수 있어요.

## 예금

| 날짜 | 아이 | 원금 | 기간 | 일금리 | 만기일 | 상태 |
|---|---|---|---|---|---|---|
"""


def bank_deposits():
    """은행 예금 목록 — [{id, date, kid, principal, term, rate, maturity, status}] (id = 표 줄 번호, 1부터). 파일이 없으면 빈 목록."""
    try:
        rows = section_rows(read(BANK), "예금")
    except FileNotFoundError:
        return []
    out = []
    for i, r in enumerate(rows, 1):
        if len(r) < 7 or not r[1]:
            continue
        try:
            principal, term = int(r[2] or 0), int(r[3] or 0)
            rate = int((r[4] or "0%").replace("%", "") or 0)
        except ValueError:
            continue
        if principal <= 0:
            continue
        out.append({"id": i, "date": r[0], "kid": r[1], "principal": principal, "term": term, "rate": rate, "maturity": r[5], "status": r[6]})
    return out


def bank_interest(principal, rate, days):
    """단리 이자 — days일 동안 매일 원금의 rate%씩 (소수점 버림)."""
    return (principal * rate * max(0, days)) // 100


def bank_deposit(kid, amount, term):
    """은행에 맡긴다 — 토큰을 빼고 예금 줄을 적는다. amount>0, 잔액 안, term은 7·14·21·28일만."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if term not in BANK_RATES:
        raise ValueError("7·14·21·28일 중에서 골라 주세요")
    if amount <= 0:
        raise ValueError("맡길 토큰을 적어 주세요")
    bal = token_balance(kid)
    if bal < amount:
        raise ValueError(f"토큰이 모자라요 (지금 {bal}토큰)")
    rate = BANK_RATES[term]
    start = datetime.date.today()
    maturity = start + datetime.timedelta(days=term)
    token_add(kid, -amount, f"🏦 은행 예금 {amount}토큰 ({term}일, 일 {rate}%)")
    try:
        t = read(BANK)
    except FileNotFoundError:
        t = BANK_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    lines.append(f"| {start.isoformat()} | {kid} | {amount} | {term} | {rate}% | {maturity.isoformat()} | 예금중 |")
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(BANK, t)
    return True


def _bank_row_line(t, dep_id):
    """예금 표에서 dep_id번째 줄(데이터 줄, 1부터)의 줄 번호. 없으면 None.
    section_rows와 같은 규칙(구분줄 제외, 첫 줄=머리줄)으로 센다."""
    lines = t.split("\n")
    inside = False
    collected = []
    for i, line in enumerate(lines):
        if re.match(r"^#{1,2}\s", line):
            inside = "예금" in line
            continue
        if inside and line.strip().startswith("|") and not re.match(r"^\|\s*:?-{2,}", line.strip()):
            collected.append(i)
    if 1 <= dep_id < len(collected):
        return collected[dep_id]
    return None


def bank_withdraw(kid, dep_id):
    """만기된 예금을 찾는다 — 원금+이자(단리, 기간 전체)를 토큰으로 돌려주고 상태를 '찾음'으로 바꾼다. 돌려준 토큰을 돌려준다."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    deps = bank_deposits()
    dep = next((d for d in deps if d["id"] == dep_id and d["kid"] == kid), None)
    if not dep:
        raise ValueError("예금을 찾을 수 없어요")
    if dep["status"] != "예금중":
        raise ValueError("이미 찾은 예금이에요")
    if datetime.date.today() < datetime.date.fromisoformat(dep["maturity"]):
        raise ValueError(f"아직 만기가 아니에요 ({dep['maturity']}에 찾을 수 있어요)")
    interest = bank_interest(dep["principal"], dep["rate"], dep["term"])
    total = dep["principal"] + interest
    token_add(kid, total, f"🏦 은행 만기 {dep['principal']}토큰 + 이자 {interest}토큰 ({dep['term']}일)")
    t = read(BANK)
    li = _bank_row_line(t, dep_id)
    if li is None:
        raise ValueError("예금 줄을 찾을 수 없어요")
    lines = t.split("\n")
    lines[li] = re.sub(r"\|\s*예금중\s*\|?\s*$", "| 찾음 |", lines[li])
    t = "\n".join(lines)
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(BANK, t)
    return total


def set_growth(kid, height, weight):
    """오늘 그 아이 줄에 키·몸무게를 적는다(None 이면 그 칸은 그대로). 숫자 범위를 벗어나면 거절."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")

    def num(v, lo, hi, what):
        if v is None or v == "":
            return None
        try:
            x = round(float(v), 1)
        except (TypeError, ValueError):
            raise ValueError(f"{what}는 숫자로 적어 주세요")
        if not lo <= x <= hi:
            raise ValueError(f"{what}가 이상해요 ({lo}~{hi})")
        return f"{x:g}"
    h, w = num(height, 40, 200, "키"), num(weight, 2, 150, "몸무게")
    if h is None and w is None:
        raise ValueError("키나 몸무게를 적어 주세요")
    try:
        t = read(GROWTH)
    except FileNotFoundError:
        t = GROWTH_TEMPLATE.format(d=today())
    lines = t.rstrip("\n").split("\n")
    td = today()
    for i in range(len(lines) - 1, -1, -1):
        c = cells(lines[i]) if lines[i].strip().startswith("|") else []
        if len(c) >= 2 and c[0] == td and c[1] == kid:
            c = (c + ["", ""])[:4]
            lines[i] = f"| {td} | {kid} | {h if h is not None else c[2]} | {w if w is not None else c[3]} |"
            break
    else:
        lines.append(f"| {td} | {kid} | {h or ''} | {w or ''} |")
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {td}", t, count=1, flags=re.M)
    write(GROWTH, t)
    return True


# ── 9. 영어 단어 퀴즈: 맞히고 따라 읽으면 ⭐ 한 줄(레벨 1) — 포켓몬 기록에 | 오늘 | 첫째 | ⭐ 영어 퀴즈 cat |
#    하루 아이당 1장. 음성 인식이 안 되는 기기는 엄마·아빠 메뉴의 '들었어요'(메뉴 쿠키 필요)로 대신 준다.
WORDS = os.path.join(ROOT, "아이들", "영어 단어.md")
QUIZ = "⭐ 영어 퀴즈"


def word_list():
    try:
        return [r[1].strip() for r in section_rows(read(WORDS), "단어") if len(r) >= 2 and r[1].strip()]
    except FileNotFoundError:
        return []


def quiz_done_today(kid):
    td = today()
    return any(c[0] == td and c[1] == kid and c[2].startswith(QUIZ) for c in log_cells())


def give_quiz(kid, word, heard=False, giver=None):
    """{"all": 아이들이 모두 오늘 퀴즈를 했는지}
    heard=True(엄마·아빠 '들었어요')면 그 자리에서 축하하지 않고 동산에서 볼 미룰 목록에 적는다(9-1)."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    words = {w.lower(): w for w in word_list()}
    if word.lower() not in words:
        raise ValueError("단어장에 없는 단어예요")
    if quiz_done_today(kid):
        raise ValueError("오늘 영어 스티커는 벌써 받았어요")
    before = sum(1 for c in log_cells() if c[1] == kid)   # 이 줄을 적기 전 아이 기록 줄 수
    log_row(kid, f"{QUIZ} {words[word.lower()]}", True)
    if heard:
        quiz_heard_add(kid, words[word.lower()], giver, before)
    return all(quiz_done_today(k) for k in kid_names())


# ── 동산 사다리: 동산 포켓몬이 5마리 늘 때마다(5·10·15…) 사다리타기 한 번 → 데이트 쿠폰.
#    동산 마릿수 = 포켓몬 기록 줄 수 ÷ 28(한 마리 졸업까지 줄 수). 같은 단계는 한 번만(쿠폰 '까닭'으로 확인).
POKE_CYCLE = 28
LADDER_STEP = 5
LADDER_PRIZES = ("💗 엄마와 데이트", "💙 아빠와 데이트")


def ladder_why(m):
    return f"동산 {m}마리 사다리"


LEDGER = os.path.join(ROOT, "아이들", "동산 장부.md")      # 10-1. 동산에 들어오고 나간 포켓몬 | 날짜 | 아이 | 들고남 | 도감번호 | 이름 | 까닭 |


def ledger_rows():
    try:
        t = read(LEDGER)
    except FileNotFoundError:
        return []
    out = []
    for l in t.splitlines():
        c = cells(l) if l.strip().startswith("|") else []
        if len(c) >= 4 and re.match(r"\d{4}-\d{2}-\d{2}$", c[0]) and c[2][:1] in "+-" and c[3].isdigit():
            out.append((c + [""] * 6)[:6])
    return out


def garden_count(kid):
    """동산 마릿수 = 졸업(기록 줄 수 ÷ 28) + 동산 장부(+ 찾아옴·교환으로 들어옴, - 나감)"""
    grads = sum(1 for c in log_cells() if c[1] == kid and re.match(r"\d{4}-\d{2}-\d{2}$", c[0])) // POKE_CYCLE
    return max(0, grads + sum(1 if c[2].startswith("+") else -1 for c in ledger_rows() if c[1] == kid))


# ── 10-3. 찾아오는 몬스터: 아침 7시 이후 그 아이 화면이 처음 열릴 때 그날 한 번 뽑는다.
#    확률 = 2% + 동산 수 × 0.1% (최대 5%). 당첨이면 화면이 보낸 '아직 못 만난 포켓몬' 후보 중 하나 → 동산 장부 + 줄(찾아옴).
#    그날 뽑은 결과는 위키 밖 visits.json 에(그날 것만) — 하루 한 번만 뽑게.
VISITS = os.environ.get("FAMILY_VISITS_FILE") or os.path.join(os.path.expanduser("~"), ".config", "family-dashboard", "visits.json")
LEDGER_TEMPLATE = """---
title: 동산 장부
type: 아이
updated: {d}
---

# 동산 장부

> 동산(다 키운 포켓몬이 사는 곳)에 졸업 말고 다른 길로 들어오고 나간 포켓몬. 대시보드 서버가 적는다(찾아오는 몬스터 · 교환).
> 동산 = 졸업한 포켓몬(포켓몬 기록 줄 수 ÷ 28) + 이 장부(+ 들어옴, - 나감). 사다리·도감도 이 기준이다.
> 적힌 줄은 고치거나 지우지 않는다. 형식: `| 날짜 | 아이 | 들고남(+/-) | 도감번호 | 이름 | 까닭 |`

| 날짜 | 아이 | 들고남 | 도감번호 | 이름 | 까닭 |
|---|---|---|---|---|---|
"""


def visit_chance(kid):
    return min(0.05, 0.02 + 0.001 * garden_count(kid))


def ledger_add(kid, sign, dex, name, why):
    try:
        t = read(LEDGER)
    except FileNotFoundError:
        t = LEDGER_TEMPLATE.format(d=today())
    t = t.rstrip("\n") + f"\n| {today()} | {kid} | {sign} | {dex} | {name} | {why} |\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(LEDGER, t)


def visit_today(kid, cands, rnd=None, bringer=""):
    """그날 뽑은 결과 {dex, name} / 꽝·아직 7시 전이면 None. 두 번째부터는 처음 결과를 그대로 돌려준다."""
    import random
    rnd = rnd or random.random
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    td = today()
    try:
        with open(VISITS, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, ValueError):
        data = {}
    day = data.get(td, {})
    if kid in day:
        return day[kid], False
    if datetime.datetime.now().hour < 7:
        return None, False
    ok = []
    for c in cands[:400]:
        try:
            d, n = int(c.get("dex")), clean(c.get("name"))[:20]
        except (TypeError, ValueError, AttributeError):
            continue
        if 1 <= d <= 1100 and n:
            ok.append((d, n))
    res = None
    if ok and rnd() < visit_chance(kid):
        d, n = ok[int(rnd() * len(ok)) % len(ok)]
        res = {"dex": d, "name": n}
        # 10-3. 동산 포켓몬(없으면 키우는 포켓몬)이 친구를 데려왔다 — 화면이 보낸 이름(한글만), 없으면 '찾아옴'
        b = bringer if re.fullmatch(r"[가-힣]{1,12}", bringer or "") else ""
        ledger_add(kid, "+", d, n, f"{b}{'이' if (ord(b[-1]) - 0xAC00) % 28 else '가'} 데려옴" if b else "찾아옴")
    day[kid] = res
    os.makedirs(os.path.dirname(VISITS), mode=0o700, exist_ok=True)
    with open(VISITS + ".tmp", "w", encoding="utf-8") as f:
        json.dump({td: day}, f, ensure_ascii=False)                 # 지난날 것은 버린다
    os.replace(VISITS + ".tmp", VISITS)
    return res, res is not None


# ── 10-3b. 데려온 친구 팝업 — 한 번 뜨면 안 뜬다 (2026-11-17 버그 고침: 땃쭈르가 11-15 찾아오고 11-16 풀어줬는데도
#    아침마다 팝업이 떴다. 까닭 두 가지: ① 본 표시가 기기마다 따로(localStorage)라 다른 기기·저장소가 지워지면 다시 떴고,
#    ② 동산을 떠난(풀어줌·교환) 친구의 들어온 줄도 14일 안이면 팝업 대상이었다. 그래서 스티커 팝업처럼 본 표시는 서버에
#    (위키 밖 friend-shown.json, 아이마다 친구마다 본 횟수 — 거실 화면·폰 어디서 봐도 한 번만) 두고, 동산을 떠난 친구는 안 보인다.
FRIEND_SHOWN = os.environ.get("FAMILY_FRIEND_SHOWN_FILE") or os.path.join(os.path.expanduser("~"), ".config", "family-dashboard", "friend-shown.json")


def _friend_shown_load():
    try:
        with open(FRIEND_SHOWN, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def _friend_shown_save(data):
    os.makedirs(os.path.dirname(FRIEND_SHOWN), mode=0o700, exist_ok=True)
    with open(FRIEND_SHOWN + ".tmp", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(FRIEND_SHOWN + ".tmp", FRIEND_SHOWN)


def friend_pending(kid):
    """아직 안 본 데려온 친구들 [{id, date, dex, name, why}] — 오래된 것부터.
    id = 날짜|아이|도감번호. 들어온 지 14일이 지난 친구, 이미 본 친구, 동산을 떠난(나중에 같은 도감번호로 - 줄이 있는) 친구는 안 보인다."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    shown = _friend_shown_load().get(kid, {})
    rows = [c for c in ledger_rows() if c[1] == kid]
    since = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
    out = []
    for i, c in enumerate(rows):
        if c[2][:1] != "+" or not re.search(r"데려옴|찾아옴", c[5] or ""):
            continue
        if c[0] < since:
            continue
        if any(r[2][:1] == "-" and r[3] == c[3] for r in rows[i + 1:]):
            continue                                             # 동산을 떠난 친구 — 들어온 팝업은 안 뜬다
        fid = f"{c[0]}|{kid}|{c[3]}"
        if shown.get(fid, 0) > 0:
            continue
        out.append({"id": fid, "date": c[0], "dex": int(c[3]), "name": c[4] or f"#{c[3]}", "why": c[5] or ""})
    return out


def friend_mark_shown(kid, ids):
    """본 친구 표시: id마다 본 횟수 +1. 장부에 없는(지워진) 친구는 안 센다."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    live = {f"{c[0]}|{kid}|{c[3]}" for c in ledger_rows() if c[1] == kid and c[2][:1] == "+" and re.search(r"데려옴|찾아옴", c[5] or "")}
    data = _friend_shown_load()
    mine = data.get(kid, {})
    changed = False
    for fid in ids or []:
        if not isinstance(fid, str) or fid not in live:
            continue
        mine[fid] = mine.get(fid, 0) + 1
        changed = True
    if changed:
        data[kid] = mine
        _friend_shown_save(data)
    return changed


# ── 10-4. 교환: 동산 포켓몬끼리. 아이 A 제안 → 아이 B 좋아요 → 엄마·아빠 승인 → 장부에 네 줄(각자 -1 +1, 까닭 '교환').
#    대기 중인 제안은 위키 밖 trades.json. 승인 전에는 동산이 바뀌지 않는다. (어떤 포켓몬이 동산에 있는지는 화면이 고른다 —
#    졸업 포켓몬의 정체는 화면의 포켓몬 목록으로 정해지므로, 승인하는 엄마·아빠가 이름을 보고 확인한다.)
TRADES = os.environ.get("FAMILY_TRADES_FILE") or os.path.join(os.path.expanduser("~"), ".config", "family-dashboard", "trades.json")


def load_trades():
    try:
        with open(TRADES, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return []


def save_trades(ts):
    os.makedirs(os.path.dirname(TRADES), mode=0o700, exist_ok=True)
    with open(TRADES + ".tmp", "w", encoding="utf-8") as f:
        json.dump(ts[-60:], f, ensure_ascii=False)                  # 오래된 것은 버린다
    os.replace(TRADES + ".tmp", TRADES)


def trade_act(act, data, parent):
    """act: propose(누구나) · like/no(받는 아이 화면) · cancel(제안한 아이 화면) · approve/reject(엄마·아빠). 바뀐 거래를 돌려준다."""
    ts = load_trades()
    kids = kid_names()
    if act == "propose":
        a, b = clean(data.get("a")), clean(data.get("b"))
        try:
            ad, bd = int(data.get("a_dex")), int(data.get("b_dex"))
        except (TypeError, ValueError):
            raise ValueError("포켓몬을 골라 주세요")
        if a not in kids or b not in kids or a == b:
            raise ValueError("바꿀 형제를 골라 주세요")
        if any(t["status"] in ("제안", "좋아요") and a in (t["a"], t["b"]) and b in (t["a"], t["b"]) for t in ts):
            raise ValueError("이미 기다리는 교환이 있어요")
        t = {"id": secrets.token_hex(4), "date": today(), "a": a, "a_dex": ad, "a_name": clean(data.get("a_name"))[:20],
             "b": b, "b_dex": bd, "b_name": clean(data.get("b_name"))[:20], "status": "제안"}
        ts.append(t)
        save_trades(ts)
        return t
    t = next((x for x in ts if x["id"] == clean(data.get("id"))), None)
    if not t:
        raise ValueError("없는 교환이에요")
    want = {"like": ("제안",), "no": ("제안",), "cancel": ("제안", "좋아요"), "approve": ("좋아요",), "reject": ("제안", "좋아요")}
    if act not in want:
        raise ValueError("없는 기능")
    if t["status"] not in want[act]:
        raise ValueError("지금은 할 수 없어요")
    if act in ("approve", "reject") and not parent:
        raise PermissionError("엄마·아빠 메뉴에서 승인해 주세요")
    if act == "approve":
        ledger_add(t["a"], "-", t["a_dex"], t["a_name"], "교환")
        ledger_add(t["a"], "+", t["b_dex"], t["b_name"], "교환")
        ledger_add(t["b"], "-", t["b_dex"], t["b_name"], "교환")
        ledger_add(t["b"], "+", t["a_dex"], t["a_name"], "교환")
        t["by"] = parent
    t["status"] = {"like": "좋아요", "no": "싫어요", "cancel": "취소", "approve": "승인", "reject": "거절"}[act]
    save_trades(ts)
    return t


# ── 11. 가족회의록 (가족회의/YYYY-MM-DD.md): ## 주제 · ## 의견(- 첫째: …) · ## 정한 것 · ## 할 일(- 내용 (누구))
#    누구나 쓴다(아이도). 지우기는 엄마·아빠만. 할 일은 '할 일로 보내기'로 장보기·할 일.md 에.
MEET_DIR = os.path.join(ROOT, "가족회의")
MEET_SECTIONS = ("주제", "의견", "정한 것", "할 일")
MEET_TEMPLATE = """---
title: 가족회의 {d}
type: 일정
updated: {u}
---

# 가족회의 {d}

> 대시보드 '🗣️ 가족회의' 메뉴가 적는다. 의견은 `- 이름: 내용`, 할 일은 `- 내용 (누구)`. 지우기는 엄마·아빠만.

## 주제

## 의견

## 정한 것

## 할 일
"""


def meeting_path(day):
    if not re.match(r"\d{4}-\d{2}-\d{2}$", day or ""):
        raise ValueError("날짜 형식이 달라요")
    return os.path.join(MEET_DIR, f"{day}.md")


def meeting_list():
    try:
        return sorted((f[:-3] for f in os.listdir(MEET_DIR) if re.match(r"\d{4}-\d{2}-\d{2}\.md$", f)), reverse=True)
    except FileNotFoundError:
        return []


def meeting_summaries():
    """지난 회의 목록용 — 날짜마다 주제 앞 2줄과 적힌 줄 수(최근이 위)"""
    out = []
    for day in meeting_list():
        topics, n, sec = [], 0, ""
        try:
            for line in read(meeting_path(day)).splitlines():
                h = re.match(r"^##\s+(.+?)\s*$", line)
                if h:
                    sec = h.group(1)
                    continue
                m = re.match(r"^\s*-\s+(.+)$", line)
                if m:
                    n += 1
                    if sec == "주제" and len(topics) < 2:
                        topics.append(m.group(1).strip()[:60])
        except OSError:
            continue
        out.append({"date": day, "topics": topics, "n": n})
    return out


def meeting_edit(day, section, line_text, add):
    """그 칸에 '- …' 한 줄 더하기 / 같은 줄 하나 지우기"""
    if section not in MEET_SECTIONS:
        raise ValueError("없는 칸이에요")
    line_text = clean(line_text)[:80]
    if not line_text:
        raise ValueError("내용을 적어 주세요")
    path = meeting_path(day)
    try:
        t = read(path)
    except FileNotFoundError:
        if not add:
            return False
        os.makedirs(MEET_DIR, exist_ok=True)
        t = MEET_TEMPLATE.format(d=day, u=today())
    lines = t.rstrip("\n").split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(rf"^##\s+{re.escape(section)}\s*$", l)), None)
    if start is None:
        lines += ["", f"## {section}"]
        start = len(lines) - 1
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    if add:
        last = max([i for i in range(start + 1, end) if lines[i].startswith("- ")] or [start])
        lines.insert(last + 1, f"- {line_text}")
    else:
        hit = next((i for i in range(start + 1, end) if lines[i].strip() == f"- {line_text}"), None)
        if hit is None:
            return False
        del lines[hit]
    t = "\n".join(lines) + "\n"
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(path, t)
    return True


# ─────────────────────────────────────────────
#  11-2. 가족회의 아이디어 (아래 메뉴 '💡 회의 아이디어', 2026-11-15 아빠 요청)
#  위키 가족회의/아이디어.md — ## 이번 주 주제 · ## 이번 주 의견 · ## 아이디어 · ## 지난 주제
#  누구나 아이디어·의견을 적는다. 이번 주 주제 고르기·회의 끝·지우기는 엄마·아빠만.
#  주제를 바꾸거나 '회의 끝'이면 그 주제와 의견을 ## 지난 주제 한 줄로 옮긴다.
# ─────────────────────────────────────────────
IDEAS = os.path.join(MEET_DIR, "아이디어.md")
IDEA_SECTIONS = ("이번 주 주제", "이번 주 의견", "아이디어", "지난 주제")
IDEAS_TEMPLATE = """---
title: 가족회의 아이디어
type: 일정
updated: {u}
---

# 가족회의 아이디어

> 가족회의에서 이야기하고 싶은 주제를 미리 적어 두는 곳. 대시보드 '💡 회의 아이디어'가 적는다.
> 아이디어는 `- 주제 (적은 사람) · 날짜`, 의견은 `- 이름: 내용`. 이번 주 주제는 하나만 — 엄마·아빠가 고른다.
> 이번 주 주제는 대시보드 화이트보드에 의견과 함께 보인다. 주제를 바꾸거나 회의를 마치면 '지난 주제'로 옮겨진다.

## 이번 주 주제

## 이번 주 의견

## 아이디어

## 지난 주제
"""


def ideas_read():
    """{섹션: ['- ' 뒤 글자', ...]} 와 원문 줄들"""
    try:
        t = read(IDEAS)
    except FileNotFoundError:
        os.makedirs(MEET_DIR, exist_ok=True)
        t = IDEAS_TEMPLATE.format(u=today())
    lines = t.rstrip("\n").split("\n")
    for s in IDEA_SECTIONS:                          # 칸이 없으면 끝에 더한다
        if not any(re.match(rf"^##\s+{re.escape(s)}\s*$", l) for l in lines):
            lines += ["", f"## {s}"]
    return lines


def ideas_items(lines, section):
    start = next(i for i, l in enumerate(lines) if re.match(rf"^##\s+{re.escape(section)}\s*$", l))
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return start, end, [lines[i][2:].strip() for i in range(start + 1, end) if lines[i].startswith("- ")]


def ideas_set(lines, section, items):
    start, end, _ = ideas_items(lines, section)
    keep = [l for l in lines[start + 1:end] if not l.startswith("- ") and l.strip()]
    body = keep + [f"- {x}" for x in items]
    lines[start + 1:end] = body + [""]
    return lines


def ideas_write(lines):
    t = re.sub(r"\n{3,}", "\n\n", "\n".join(lines).rstrip("\n") + "\n")
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(IDEAS, t)


def idea_topic_text(item):
    """'용돈 올리기 (첫째) · 2026-11-15' → '용돈 올리기 (첫째)'"""
    return re.sub(r"\s*·\s*\d{4}-\d{2}-\d{2}\s*$", "", item).strip()


def ideas_archive(lines):
    """이번 주 주제 + 의견 → 지난 주제 맨 위 한 줄, 두 칸은 비운다"""
    _, _, topic = ideas_items(lines, "이번 주 주제")
    _, _, ops = ideas_items(lines, "이번 주 의견")
    if topic:
        _, _, past = ideas_items(lines, "지난 주제")
        line = f"{today()} {idea_topic_text(topic[0])}" + (f" — {' / '.join(ops)}" if ops else "")
        lines = ideas_set(lines, "지난 주제", [line[:400]] + past[:49])
    lines = ideas_set(lines, "이번 주 주제", [])
    return ideas_set(lines, "이번 주 의견", [])


def ideas_act(act, data, giver):
    """act: add(아이디어) · del · pick(이번 주 주제로) · opinion · opdel · done(회의 끝). 바뀌면 True"""
    who = clean(data.get("who")) or "가족"
    if act in ("del", "pick", "opdel"):                 # 이미 있는 줄을 가리킬 때는 자르지 않고 그대로 맞춘다
        text = re.sub(r"[|\r\n]", " ", str(data.get("text") or "")).strip()[:400]
    else:
        text = clean(data.get("text"))
    if act in ("del", "pick", "opdel", "done") and not giver:
        raise PermissionError("엄마·아빠 메뉴에 들어간 뒤에 할 수 있어요")
    lines = ideas_read()
    if act == "add":
        if not text:
            raise ValueError("주제를 적어 주세요")
        _, _, items = ideas_items(lines, "아이디어")
        if any(idea_topic_text(x).startswith(text + " (") for x in items):
            raise ValueError("이미 적힌 주제예요")
        lines = ideas_set(lines, "아이디어", items + [f"{text} ({who}) · {today()}"])
    elif act == "del":
        _, _, items = ideas_items(lines, "아이디어")
        if text not in items:
            return False
        lines = ideas_set(lines, "아이디어", [x for x in items if x != text])
    elif act == "pick":
        _, _, items = ideas_items(lines, "아이디어")
        if text not in items:
            raise ValueError("아이디어 목록에 없는 주제예요")
        lines = ideas_archive(lines)
        _, _, items = ideas_items(lines, "아이디어")
        lines = ideas_set(lines, "아이디어", [x for x in items if x != text])
        lines = ideas_set(lines, "이번 주 주제", [f"{idea_topic_text(text)} · {today()}"])
    elif act == "opinion":
        _, _, topic = ideas_items(lines, "이번 주 주제")
        if not topic:
            raise ValueError("아직 이번 주 주제가 없어요")
        if not text:
            raise ValueError("의견을 적어 주세요")
        _, _, ops = ideas_items(lines, "이번 주 의견")
        if len(ops) >= 30:
            raise ValueError("의견이 너무 많아요")
        lines = ideas_set(lines, "이번 주 의견", ops + [f"{who}: {text}"])
    elif act == "opdel":
        _, _, ops = ideas_items(lines, "이번 주 의견")
        if text not in ops:
            return False
        lines = ideas_set(lines, "이번 주 의견", [x for x in ops if x != text])
    elif act == "done":
        _, _, topic = ideas_items(lines, "이번 주 주제")
        if not topic:
            return False
        lines = ideas_archive(lines)
    else:
        raise ValueError("모르는 동작이에요")
    ideas_write(lines)
    return True


def take_ladder(kid, m, prize):
    """사다리 결과 → 쿠폰 한 줄. 이미 탄 단계면 False"""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if prize not in LADDER_PRIZES:
        raise ValueError("없는 상품")
    if m <= 0 or m % LADDER_STEP or garden_count(kid) < m:
        raise ValueError("아직 사다리를 탈 수 없어요")
    rows, lines = coupon_rows()
    if any(c[1] == kid and c[3] == ladder_why(m) for _, c in rows):
        return False
    lines.append(f"| {today()} | {kid} | {prize} | {ladder_why(m)} | |")
    save_coupons(lines)
    return True


def sync_bonuses():
    """봇·사람이 적은 루틴 줄도 보너스에 반영한다(2분마다). 바뀌었으면 그 파일만 올린다."""
    try:
        changed = [(k, d) for k in kid_names() if (d := apply_day_bonus(k))]
        team = apply_team_bonus()
        week = [(k, d) for k in kid_names() if (d := apply_week_reward(k))]
        tok = sync_tokens()                                            # 14-4. 루틴 토큰 적립은 없앴다(항상 False) — 토큰은 풀어주기·스티커로만
    except FileNotFoundError:
        return
    parts = [f"하루 완료 보너스 {k} {d:+d}" for k, d in changed] + [f"형제 보너스 {k} {d:+d}" for k, d in team.items()]
    if parts:
        git_save(KID_LOG, "docs: 포켓몬 기록 — " + ", ".join(parts) + " (대시보드)")
    if tok:
        git_save(TOKEN, "docs: 토큰 — 루틴 토큰 적립 (대시보드)")
    if week:
        git_save(COUPON, "docs: 쿠폰 — 주간 보상 " + ", ".join(f"{k} {d:+d}" for k, d in week) + " (대시보드)")


def log_row(kid, routine, done):
    text = read(KID_LOG)
    row = f"| {today()} | {kid} | {routine} |"
    lines = text.rstrip("\n").split("\n")
    if done:
        lines.append(row)
    else:
        for i in range(len(lines) - 1, -1, -1):        # 오늘 그 루틴의 마지막 줄 하나만 지운다
            c = cells(lines[i]) if lines[i].strip().startswith("|") else []
            if c[:3] == [today(), kid, routine]:
                del lines[i]
                break
        else:
            return False
    text = "\n".join(lines) + "\n"
    text = re.sub(r"^updated: .*$", f"updated: {today()}", text, count=1, flags=re.M)
    write(KID_LOG, text)
    return True


KID_EGG = os.path.join(ROOT, "아이들", "포켓몬 알.md")
EGG_TEMPLATE = """---
title: 포켓몬 알
type: 아이
updated: {d}
---

# 포켓몬 알

> 아이가 몇 번째로 키우는 포켓몬이 어떤 알이었는지 대시보드가 적는다. 첫 알은 부화할 때, 두 번째부터는 알 3개 중 고를 때.
> 한 번 적힌 줄은 고치지 않는다 — 고치면 키우던 포켓몬이 바뀐다. 알인 동안 아이에게 도감번호를 알려 주지 않는다.
> 비고가 `친구`면 알 대신 동산의 데려온 친구(그 도감번호)를 골라 진화시키는 차례다.

| 날짜 | 아이 | 몇 번째 | 도감번호 | 비고 |
|---|---|---|---|---|
"""


def friend_in_garden(kid, dex):
    """동산 장부로 이 아이 동산에 그 도감번호 친구가 지금 있는지 — 있으면 이름, 없으면 None"""
    have, name = 0, None
    for c in ledger_rows():
        if c[1] == kid and c[3] == str(dex):
            have += 1 if c[2].startswith("+") else -1
            name = (c[4] if len(c) > 4 else "") or name
    return (name or f"#{dex}") if have > 0 else None


def pick_egg(kid, n, dex, friend=False):
    """아이의 n번째 포켓몬을 도감번호 dex로 적는다. 이미 적혀 있으면 그대로 둔다(False).
    friend=True 면 비고 '친구' — 동산의 데려온 친구를 알 대신 키운다(10-4, 동산에 그 친구가 있어야 한다)."""
    if kid not in kid_names():
        raise ValueError("가족 구성원.md 에 없는 아이")
    if not (1 <= n <= 999 and 1 <= dex <= 1100):
        raise ValueError("잘못된 알 번호")
    try:
        text = read(KID_EGG)
    except FileNotFoundError:
        text = EGG_TEMPLATE.format(d=today())
    for line in text.split("\n"):
        c = cells(line) if line.strip().startswith("|") else []
        if len(c) >= 3 and c[1] == kid and c[2] == str(n):
            return False
    text = text.rstrip("\n") + f"\n| {today()} | {kid} | {n} | {dex} |{' 친구 |' if friend else ''}\n"
    text = re.sub(r"^updated: .*$", f"updated: {today()}", text, count=1, flags=re.M)
    write(KID_EGG, text)
    return True


def finish_todo(text_, who, section="할 일"):
    """장보기·할 일.md '## 할 일'(또는 '## 장보기')에서 '- 내용 ... (이름)' 한 줄을 지운다"""
    t = read(TODO)
    lines, inside = t.split("\n"), False
    for i, line in enumerate(lines):
        if re.match(r"^#{1,2}\s", line):
            inside = (section in line) and not (section == "할 일" and "장보기" in line)
            continue
        if not inside or not re.match(r"^\s*[-*]\s+", line):
            continue
        body = re.sub(r"^\s*[-*]\s+(\[[ xX]\]\s*)?", "", line)
        m = re.search(r"\(([^()]+)\)\s*$", body)
        w = m.group(1).strip() if m else ""
        body = body[: m.start()].strip() if m else body.strip()
        body = re.sub(r"~\s*\d{1,2}/\d{1,2}", "", body).strip()
        if body == text_ and w == who:
            del lines[i]
            t = "\n".join(lines)
            t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
            write(TODO, t)
            return True
    return False


def insert_under(text, section, line, match=lambda h, sec: sec in h):
    """'## section' 칸의 마지막 항목 바로 아래에 한 줄을 넣는다. 칸이 없으면 맨 끝에 새로 만든다."""
    lines = text.rstrip("\n").split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(r"^##\s", l) and match(l, section)), None)
    if start is None:
        return "\n".join(lines) + f"\n\n## {section}\n{line}\n"
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^#{1,2}\s", lines[i])), len(lines))
    at = start + 1
    for i in range(start + 1, end):              # 칸 안의 마지막 목록 줄 다음
        if re.match(r"^\s*[-*]\s+", lines[i]):
            at = i + 1
    lines.insert(at, line)
    return "\n".join(lines) + "\n"


def due_text(due):
    """'2026-11-25' 또는 '11/25' → '~11/25'. 없으면 ''"""
    due = clean(due)
    if not due:
        return ""
    m = re.fullmatch(r"(?:\d{4}-)?(\d{1,2})[-/](\d{1,2})", due)
    if not m or not (1 <= int(m.group(1)) <= 12 and 1 <= int(m.group(2)) <= 31):
        raise ValueError("날짜 형식이 이상해요")
    return f" ~{int(m.group(1))}/{int(m.group(2))}"


def supply_date(md):
    """준비물 날짜 '11/14' → date. 연말·연초를 넘나들어도 오늘과 가까운 해로 본다"""
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})", md or "")
    if not m:
        return None
    t = datetime.date.today()
    best = None
    for y in (t.year - 1, t.year, t.year + 1):
        try:
            d = datetime.date(y, int(m.group(1)), int(m.group(2)))
        except ValueError:
            continue
        if best is None or abs((d - t).days) < abs((best - t).days):
            best = d
    return best


def supply_parts(line):
    """'- [x] 실내화 ~11/14 (첫째)' → (챙김?, '실내화', '11/14', '첫째'). 목록 줄이 아니면 None"""
    m = re.match(r"^\s*[-*]\s+(?:\[([ xX])\]\s*)?(.*)$", line)
    if not m:
        return None
    body = m.group(2)
    w = re.search(r"\(([^()]+)\)\s*$", body)
    who = w.group(1).strip() if w else ""
    body = body[: w.start()].strip() if w else body.strip()
    d = re.search(r"~\s*(\d{1,2}/\d{1,2})", body)
    due = d.group(1) if d else ""
    body = re.sub(r"~\s*\d{1,2}/\d{1,2}", "", body).strip()
    return (m.group(1) or " ").lower() == "x", body, due, who


def supply_section(lines):
    """'## 준비물' 칸의 줄 번호 범위 (start, end). 없으면 None"""
    start = next((i for i, l in enumerate(lines) if re.match(r"^##\s", l) and "준비물" in l), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^#{1,2}\s", lines[i])), len(lines))
    return start, end


def check_supply(text_, who, due, done):
    """준비물 한 줄의 '- [ ]' ↔ '- [x]'를 바꾼다 (지우지 않는다 — 잘못 누르면 다시 누르면 된다)"""
    t = read(TODO)
    lines = t.split("\n")
    rng = supply_section(lines)
    if not rng:
        return False
    for i in range(*rng):
        p = supply_parts(lines[i])
        if p and p[1] == text_ and p[3] == who and p[2] == due:
            if p[0] == done:
                return False
            lines[i] = f"- [{'x' if done else ' '}] {text_}{f' ~{due}' if due else ''} ({who})"
            t = "\n".join(lines)
            t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
            write(TODO, t)
            return True
    return False


def check_trip(group, text_, done):
    """여행 준비물 한 줄의 '- [ ]' ↔ '- [x]'를 바꾼다 (지우지 않는다 — 잘못 누르면 다시 누르면 된다)"""
    t = read(TRIP)
    lines = t.split("\n")
    start = next((i for i, l in enumerate(lines) if re.match(r"^##\s", l) and l.lstrip("#").strip() == group), None)
    if start is None:
        return False
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^#{1,2}\s", lines[i])), len(lines))
    for i in range(start + 1, end):
        p = supply_parts(lines[i])
        if p and p[1] == text_:
            if p[0] == done:
                return False
            lines[i] = f"- [{'x' if done else ' '}] {text_}"
            t = "\n".join(lines)
            t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
            write(TRIP, t)
            return True
    return False


def prune_supplies(t):
    """날짜가 지난 준비물 줄은 지운다 — 그날이 지나면 필요 없다 (장보기처럼 기록하지 않는다)"""
    lines = t.split("\n")
    rng = supply_section(lines)
    if not rng:
        return t
    now = datetime.date.today()
    keep = []
    for i, l in enumerate(lines):
        if rng[0] < i < rng[1]:
            p = supply_parts(l)
            d = p and supply_date(p[2])
            if d and d < now:
                continue
        keep.append(l)
    return "\n".join(keep)


def shopping_section(lines):
    """'## 장보기' 칸의 줄 번호 범위 (start, end). 없으면 None ('## 할 일 · 장보기' 같은 합친 제목은 제외)"""
    start = next((i for i, l in enumerate(lines) if re.match(r"^##\s", l) and "장보기" in l and "할 일" not in l), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if re.match(r"^#{1,2}\s", lines[i])), len(lines))
    return start, end


def check_shopping(text_, who, done):
    """장보기 한 줄의 체크박스를 바꾼다 (지우지 않는다 — 잘못 누르면 다시 누르면 된다).
    체크하면 '- [x] 내용 ~오늘날짜 (이름)' — ~날짜는 체크한 날. 프론트가 체크한 지 하루 지난 줄은 안 보여준다."""
    t = read(TODO)
    lines = t.split("\n")
    rng = shopping_section(lines)
    if not rng:
        return False
    d = datetime.date.today()
    md = f"{d.month}/{d.day}"
    for i in range(*rng):
        p = supply_parts(lines[i])
        if p and p[1] == text_ and p[3] == who:
            if p[0] == done:
                return False
            who_s = f" ({who})" if who else ""
            lines[i] = f"- [{'x' if done else ' '}] {text_}{f' ~{md}' if done else ''}{who_s}"
            t = "\n".join(lines)
            t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
            write(TODO, t)
            return True
    return False


def prune_shopping(t):
    """체크한 지 하루 지난 장보기 줄은 지운다 — 체크한 당일은 보여주고(샀다는 표시), 다음 날부터 안 뜬다"""
    lines = t.split("\n")
    rng = shopping_section(lines)
    if not rng:
        return t
    now = datetime.date.today()
    keep = []
    for i, l in enumerate(lines):
        if rng[0] < i < rng[1]:
            p = supply_parts(l)
            d = p and supply_date(p[2])
            if p and p[0] and d and d < now:
                continue
        keep.append(l)
    return "\n".join(keep)


def add_todo(kind, text_, who, due):
    """장보기·할 일.md 에 '- 내용 ~11/25 (이름)' 한 줄 (AGENTS.md §6)
    준비물은 '- [ ] 실내화 ~11/14 (첫째)' — 날짜가 없으면 오늘"""
    if kind not in ("할 일", "장보기", "준비물"):
        raise ValueError("할 일·장보기·준비물만 돼요")
    if kind == "준비물":
        if not text_:
            raise ValueError("준비물을 적어 주세요")
        if who not in ["아빠", "엄마", "가족", *kid_names()]:
            raise ValueError("누구 것인지 골라 주세요")
        d = datetime.date.today()
        line = f"- [ ] {text_}{due_text(due) or f' ~{d.month}/{d.day}'} ({who})"
        t = insert_under(prune_supplies(read(TODO)), "준비물", line, lambda h, sec: "준비물" in h)
        t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
        write(TODO, t)
        return
    if not text_:
        raise ValueError("내용을 적어 주세요")
    if who not in ["아빠", "엄마", "가족", *kid_names()]:
        raise ValueError("누구 것인지 골라 주세요")
    line = f"- {text_}{due_text(due) if kind == '할 일' else ''} ({who})"
    match = (lambda h, sec: "할 일" in h and "장보기" not in h) if kind == "할 일" else (lambda h, sec: "장보기" in h and "할 일" not in h)
    t = insert_under(prune_shopping(read(TODO)) if kind == "장보기" else read(TODO), kind, line, match)
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(TODO, t)


def add_trip(group, text_, title, start):
    """여행/다음 여행.md 에 '- [ ] 물건'. 여행 이름·출발일이 비어 있으면 함께 채운다"""
    if not text_:
        raise ValueError("물건 이름을 적어 주세요")
    group = clean(group) or "챙길 물품"
    if start and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start):
        raise ValueError("출발일 형식이 이상해요")
    t = insert_under(read(TRIP), group, f"- [ ] {text_}", lambda h, sec: h.lstrip("#").strip() == sec)
    if title:
        t = re.sub(r"^여행:[ \t]*$", f"여행: {title}", t, count=1, flags=re.M)
    if start:
        t = re.sub(r"^출발:[ \t]*$", f"출발: {start}", t, count=1, flags=re.M)
    t = re.sub(r"^updated: .*$", f"updated: {today()}", t, count=1, flags=re.M)
    write(TRIP, t)


# ─────────────────────────────────────────────
#  GitHub 자동 동기화 (git이 있을 때만)
# ─────────────────────────────────────────────
def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=60)


def git_ready():
    if not shutil.which("git"):
        return False
    try:
        return git("rev-parse", "--is-inside-work-tree").returncode == 0 and bool(git("remote").stdout.strip())
    except Exception:
        return False


def git_save(path, msg):
    """고친 파일 하나만 커밋하고 푸시 (뒤에서 조용히)"""
    if not GIT["on"]:
        return

    def run():
        with LOCK:
            try:
                rel = os.path.relpath(path, ROOT)
                git("add", "--", rel)
                git("commit", "-q", "-m", msg, "--", rel)
                if git("push", "-q").returncode != 0:
                    git("pull", "--rebase", "--autostash", "-q")
                    git("push", "-q")
            except Exception as e:
                print("  (GitHub 올리기 실패 — 다음에 다시 시도:", e, ")")
    threading.Thread(target=run, daemon=True).start()


# ─────────────────────────────────────────────
#  아빠 포켓몬 — 토큰 사용량이 경험치 (2026-11-14 아빠 결정)
#  PC UsageSender → /api/usage-totals → 아빠/토큰-합계.json(오늘 Claude·Codex 토큰) 을 받을 때마다
#  날짜별 최댓값을 장부(~/.config/family-dashboard/dad-pokemon.json, 위키 밖)에 쌓는다.
#  경험치 = 장부 합계 − 알을 받을 때의 경험치. 기준은 dashboard/deploy/dad-growth.json(부화·진화·졸업),
#  새 알은 dashboard/deploy/dad-catalog.json(PokeTokenBar와 같은 뽑기). PC 앱·로그 파일이 지워져도 줄지 않는다.
#  결과는 아빠/포켓몬-동료.json(서버에서만 씀, GitHub에 안 올림)으로 — 화면(dad.js·board.js)이 읽는다.
# ─────────────────────────────────────────────
DAD_POKE_FILE = os.environ.get("FAMILY_DAD_POKE_FILE") or os.path.join(os.path.expanduser("~"), ".config", "family-dashboard", "dad-pokemon.json")
DAD_COMPANION_FILE = os.path.join(ROOT, "아빠", "포켓몬-동료.json")
DAD_DEPLOY = os.path.join(ROOT, "dashboard", "deploy")


def _dad_json(path, default=None):
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _dad_write(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + f".tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    os.replace(tmp, path)


def dad_hatch(rng=None):
    """새 알 — PokeTokenBar hatchCompanion 과 같은 가중치(흔함 70·드묾 25·전설 5, 이로치 1/128)"""
    import random
    rng = rng or random.random
    cat = _dad_json(os.path.join(DAD_DEPLOY, "dad-catalog.json"), {})
    w = cat.get("rarityWeight") or {"common": 70, "rare": 25, "legendary": 5}
    lines, legs = cat.get("lines") or [], cat.get("legendaries") or []
    pool = []
    for r in ("common", "rare"):
        same = [l for l in lines if l.get("rarity") == r]
        pool += [(w.get(r, 0) / len(same), "line", l) for l in same] if same else []
    pool += [(w.get("legendary", 5) / len(legs), "legendary", s) for s in legs] if legs else []
    total = sum(p[0] for p in pool)
    pick = rng() * total
    chosen = pool[-1]
    for p in pool:
        pick -= p[0]
        if pick <= 0:
            chosen = p
            break
    shiny = rng() < float(cat.get("shinyOdds") or 1 / 128)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
    if chosen[1] == "legendary":
        return {"line": [dict(chosen[2])], "rarity": "legendary", "shiny": shiny, "hatchedAt": now}
    return {"line": [dict(s) for s in chosen[2]["chain"]], "rarity": chosen[2].get("rarity", "common"), "shiny": shiny, "hatchedAt": now}


def dad_status(companion, since):
    """PokeTokenBar companionStatus 와 같은 계산 — since = 알을 받은 뒤 쌓인 경험치(토큰)"""
    g = _dad_json(os.path.join(DAD_DEPLOY, "dad-growth.json"), {}) or {}
    hatch, evolve, grad = int(g.get("hatchAt", 156000000)), int(g.get("evolveAt", 312000000)), int(g.get("graduateAt", 468000000))
    line = companion.get("line") or []
    n = len(line)
    th = [hatch, grad] if n <= 2 else [hatch, evolve, grad]
    stage = 0
    for i, t in enumerate(th):
        if since >= t:
            stage = i + 1
        else:
            break
    done = since >= th[-1]
    next_at = None if done else th[stage]
    base = 0 if stage == 0 else th[stage - 1]
    span = (next_at if next_at is not None else since) - base
    progress = 1 if next_at is None else min(1, max(0, (since - base) / (span or 1)))
    return {"stage": n if done else stage, "graduated": done, "current": None if stage == 0 else line[min(stage, n) - 1],
            "nextAt": next_at, "nextLabel": None if done else "부화" if stage == 0 else "졸업" if next_at == grad else "진화",
            "progress": progress}


def dad_tick():
    """토큰 합계를 장부에 넣고 → 졸업이면 도감에 넣고 새 알 → 아빠/포켓몬-동료.json 다시 쓰기.
    장부가 아직 없으면(처음) 아무것도 하지 않는다 — dashboard/deploy/dad-pokemon-init.cjs 로 한 번 옮겨 온다."""
    st = _dad_json(DAD_POKE_FILE)
    if not isinstance(st, dict) or not isinstance(st.get("companion"), dict):
        return None
    totals = _dad_json(USAGE_TOTALS_FILE, {}) or {}
    date = totals.get("date") if isinstance(totals.get("date"), str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", totals.get("date") or "") else None
    today_tokens = sum(int((totals.get(s) or {}).get("todayTokens") or 0) for s in ("claude", "codex"))
    days = st.setdefault("days", {})
    if date:
        days[date] = max(int(days.get(date) or 0), today_tokens)        # 같은 날은 커지기만 한다
    exp = sum(int(v) for v in days.values())
    if "initSinceStart" in st:                                          # 옮겨 온 첫날: 지금까지 키운 만큼 이어서
        if not date:
            return None
        st["startExp"] = exp - int(st.pop("initSinceStart"))
    since = max(0, exp - int(st.get("startExp") or 0))
    stt = dad_status(st["companion"], since)
    if stt["graduated"]:
        cur = stt["current"] or {}
        st.setdefault("pokedex", []).append({"dex": cur.get("dex"), "ko": cur.get("ko"), "en": cur.get("en", ""),
                                             "shiny": bool(st["companion"].get("shiny")), "rarity": st["companion"].get("rarity"),
                                             "graduatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                                             "tokensUsed": since})
        st["companion"] = dad_hatch()
        st["startExp"] = exp
        since, stt = 0, dad_status(st["companion"], 0)
    _dad_write(DAD_POKE_FILE, st)
    c, cur = st["companion"], stt["current"]
    n = len(c.get("line") or [])
    label = "졸업" if stt["graduated"] else "알" if stt["stage"] == 0 else "최종" if n <= 1 else "1단계" if stt["stage"] == 1 else "2단계"
    dex = [p for p in st.get("pokedex", []) if isinstance(p.get("dex"), int) and p["dex"] > 0 and p.get("ko")]
    snap = {"version": 1, "source": "server-usage",
            "updatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
            "sinceStartTokens": since, "todayTokens": int(days.get(datetime.date.today().isoformat()) or 0),
            "totalTokens": exp, "pokedexCount": len(dex),
            "pokedex": [{"dex": p["dex"], "ko": p["ko"], "en": p.get("en", ""), "shiny": bool(p.get("shiny")), "graduatedAt": p.get("graduatedAt", "")} for p in dex],
            # 알인 동안은 무엇인지 드러내지 않는다(dex·이름 비움)
            "companion": {"dex": cur.get("dex") if cur else None, "ko": cur.get("ko") if cur else "알", "en": cur.get("en", "") if cur else "",
                          "stageIndex": stt["stage"], "stageLabel": label, "shiny": bool(c.get("shiny")),
                          "rarity": c.get("rarity", "common"), "hatchedAt": c.get("hatchedAt", "")},
            "nextAt": stt["nextAt"], "nextLabel": stt["nextLabel"], "progress": stt["progress"],
            "met": [{"dex": p.get("dex"), "ko": p.get("ko"), "shiny": bool(c.get("shiny"))} for p in (c.get("line") or [])[:stt["stage"]]]}
    _dad_write(DAD_COMPANION_FILE, snap)
    return snap


def dad_tick_safe():
    try:
        with LOCK:
            return dad_tick()
    except Exception as e:
        print("  (아빠 포켓몬 경험치 계산 실패:", e, ")")


def bonus_loop():
    """2분마다 보너스 다시 계산 — 봇·사람이 포켓몬 기록.md 에 루틴을 직접 적었을 때도 보너스가 붙고 빠지게"""
    while True:
        time.sleep(120)
        with LOCK:
            try:
                sync_bonuses()
            except Exception as e:
                print("  (보너스 계산 실패:", e, ")")


def git_loop():
    """2분마다 GitHub 최신 받기 + 못 올린 커밋 다시 올리기"""
    while True:
        time.sleep(120)
        with LOCK:
            try:
                git("pull", "--rebase", "--autostash", "-q")
                if "ahead" in git("status", "-sb").stdout.split("\n")[0]:
                    git("push", "-q")
            except Exception:
                pass


# ─────────────────────────────────────────────
#  엄마·아빠 메뉴 — 각자 숫자 비밀번호(4~6자리). 가족 로그인과 별개로 한 번 더 잠근다.
#  위키 폴더 밖(~/.config/family-dashboard/parents.json)에 암호문(소금+PBKDF2)만 저장한다 — 위키는 GitHub에 올라가므로.
#  5번 틀리면 10분 잠금. 들어가면 그 기기에서 30분 유지(쿠키). 잊어버리면 서버에서
#    python3 dashboard/serve.py --reset-parent 아빠   → 다음에 들어갈 때 새로 정한다
# ─────────────────────────────────────────────
PARENTS = ("아빠", "엄마")
PARENT_FILE = os.environ.get("FAMILY_PARENT_FILE") or os.path.join(os.path.expanduser("~"), ".config", "family-dashboard", "parents.json")
PARENT_COOKIE = "family_parent"
PARENT_SEC = 30 * 60
PARENT_MAX_FAILS = 5
PARENT_LOCK_SEC = 10 * 60
_pfails = {}                     # 이름 → [틀린 횟수, 잠금이 풀리는 시각]


def load_parents():
    try:
        with open(PARENT_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_parents(data):
    os.makedirs(os.path.dirname(PARENT_FILE), mode=0o700, exist_ok=True)
    fd = os.open(PARENT_FILE + ".tmp", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(PARENT_FILE + ".tmp", PARENT_FILE)


def pin_ok(pin):
    return isinstance(pin, str) and re.fullmatch(r"\d{4,6}", pin) is not None


def parent_sig(data, who, ts):
    # 그 사람의 소금까지 넣어 서명 → 비밀번호를 다시 정하면 예전 30분 쿠키도 바로 무효
    msg = f"{who}.{ts}.{data[who]['salt']}".encode("utf-8")
    return hmac.new(data["secret"].encode(), msg, hashlib.sha256).hexdigest()


def parent_token(data, who):
    ts = str(int(time.time()))
    return urllib.parse.quote(who) + "." + ts + "." + parent_sig(data, who, ts)


def parent_from_token(token):
    """쿠키 → (누구, 남은 초). 아니면 (None, 0)"""
    try:
        q, ts, sig = token.split(".")
        who = urllib.parse.unquote(q)
        data = load_parents()
        if who not in PARENTS or who not in data:
            return None, 0
        left = PARENT_SEC - (time.time() - int(ts))
        if left > 0 and hmac.compare_digest(sig, parent_sig(data, who, ts)):
            return who, int(left)
    except Exception:
        pass
    return None, 0


def parent_locked(who):
    cnt, until = _pfails.get(who, (0, 0))
    return max(0, int(until - time.time()))


def reset_parent(who):
    if who not in PARENTS:
        sys.exit(f"{'·'.join(PARENTS)} 중 하나를 적어 주세요.")
    data = load_parents()
    if data.pop(who, None) is None:
        print(f"{who} 비밀번호는 아직 정해져 있지 않아요.")
        return
    save_parents(data)
    print(f"{who} 비밀번호를 지웠어요. 대시보드 '{who} 할 일'에 들어가면 새로 정할 수 있어요.")


# ─────────────────────────────────────────────
#  대시보드 설정 (소리·저녁 음악) — 모든 기기가 같이 쓴다. 엄마·아빠 메뉴에서만 바꾼다.
#  위키 밖 ~/.config/family-dashboard/settings.json (재생목록 주소는 가족 기록이 아니라서 위키에 두지 않는다)
# ─────────────────────────────────────────────
SETTINGS_FILE = os.environ.get("FAMILY_SETTINGS_FILE") or os.path.join(os.path.dirname(PARENT_FILE), "settings.json")
SETTINGS_DEFAULT = {"sound": True, "volume": 0.7,
                    "music": {"from": "19:00", "to": "21:00", "ambient": True, "lists": [], "dance": []}}
YT_HOSTS = ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be")


def load_settings():
    s = json.loads(json.dumps(SETTINGS_DEFAULT))
    try:
        with open(SETTINGS_FILE, encoding="utf-8") as f:
            saved = json.load(f)
        s.update({k: v for k, v in saved.items() if k != "music"})
        s["music"].update(saved.get("music") or {})
    except (FileNotFoundError, ValueError):
        pass
    return s


def yt_ok(url):
    """유튜브 재생목록·영상 주소만 받는다"""
    try:
        u = urllib.parse.urlsplit(url)
        q = urllib.parse.parse_qs(u.query)
        return u.scheme == "https" and u.hostname in YT_HOSTS and bool(q.get("list") or q.get("v") or (u.hostname == "youtu.be" and len(u.path) > 1))
    except Exception:
        return False


def clean_settings(new):
    """화면에서 보낸 설정을 검사해서 저장할 모양으로"""
    hm = lambda v, d: v if isinstance(v, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v) else d
    m = new.get("music") or {}

    def yt_list(items, default_title):                # 저녁 음악(lists)·춤 음악(dance) 공통 검사
        out = []
        for it in (items or [])[:20]:
            url = str((it or {}).get("url") or "").strip()[:300]
            if not yt_ok(url):
                raise ValueError(f"유튜브 주소가 아니에요: {url[:60]}")
            out.append({"url": url, "title": clean((it or {}).get("title"))[:30] or default_title})
        return out
    lists, dance = yt_list(m.get("lists"), "유튜브 음악"), yt_list(m.get("dance"), "춤 음악")
    vol = new.get("volume", 0.7)
    return {"sound": bool(new.get("sound", True)),
            "volume": min(1.0, max(0.0, float(vol if isinstance(vol, (int, float)) else 0.7))),
            "music": {"from": hm(m.get("from"), "19:00"), "to": hm(m.get("to"), "21:00"),
                      "ambient": bool(m.get("ambient", True)), "lists": lists, "dance": dance}}


_yts_cache = {}                                   # 검색어 → (시각, 결과) 10분


def yt_search(q, n=6):
    """🎵 듣고 싶은 노래 찾기 — 유튜브 검색 결과 앞쪽 영상 n개 [{id, title, channel, length}].
    API 키 없이 검색 화면을 읽는다. 제한 모드(PREF f2=8000000)를 켜서 아이에게 맞지 않는 영상은 덜 나오게.
    라이브(길이 없음)는 뺀다."""
    q = re.sub(r"\s+", " ", str(q or "")).strip()[:80]
    if not q:
        return []
    hit = _yts_cache.get(q)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    url = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": q, "hl": "ko", "gl": "KR"})
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9", "Cookie": "PREF=f2=8000000&hl=ko; CONSENT=YES+1"})
    with urllib.request.urlopen(req, timeout=10) as res:
        html = res.read().decode("utf-8", "replace")
    m = re.search(r"var ytInitialData\s*=\s*(\{.*?\});</script>", html, re.S)
    if not m:
        raise ValueError("유튜브 검색 결과를 읽지 못했어요")
    out = []

    def walk(o):
        if len(out) >= n:
            return
        if isinstance(o, dict):
            v = o.get("videoRenderer")
            if isinstance(v, dict) and re.fullmatch(r"[\w-]{11}", str(v.get("videoId") or "")):
                length = (v.get("lengthText") or {}).get("simpleText", "")
                if length:
                    out.append({"id": v["videoId"],
                                "title": "".join(r.get("text", "") for r in (v.get("title") or {}).get("runs", []))[:100],
                                "channel": "".join(r.get("text", "") for r in (v.get("ownerText") or {}).get("runs", []))[:60],
                                "length": length[:10]})
                return
            for x in o.values():
                walk(x)
        elif isinstance(o, list):
            for x in o:
                walk(x)
    walk(json.loads(m.group(1)))
    if len(_yts_cache) > 100:
        _yts_cache.clear()
    _yts_cache[q] = (time.time(), out)
    return out


def save_settings(s):
    os.makedirs(os.path.dirname(SETTINGS_FILE), mode=0o700, exist_ok=True)
    with open(SETTINGS_FILE + ".tmp", "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=1)
    os.replace(SETTINGS_FILE + ".tmp", SETTINGS_FILE)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # 늘 최신 위키를 읽게
        super().end_headers()

    # ── 로그인 ──
    def _authed(self):
        auth = load_auth()
        if not auth:
            return True                       # 비밀번호를 정하지 않았으면 열어 둔다
        jar = {}
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            jar[k] = v
        return token_ok(auth, jar.get(COOKIE, ""))

    def _jar(self):
        jar = {}
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            jar[k] = v
        return jar

    # ── 엄마·아빠 메뉴 ──
    # 틀린 비밀번호는 401이 아니라 403으로 답한다(화면은 401을 받으면 가족 로그인 화면으로 넘어가기 때문)
    def _parent_cookie(self, value, max_age):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        return f"{PARENT_COOKIE}={value}; Max-Age={max_age}; Path=/; HttpOnly; SameSite=Strict{secure}"

    def _parent_state(self):
        data = load_parents()
        me, left = parent_from_token(self._jar().get(PARENT_COOKIE, ""))
        return {"ok": True, "me": me, "left_sec": left,
                "parents": {p: {"set": p in data, "locked_sec": parent_locked(p)} for p in PARENTS}}

    def _parent_post(self, path):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(min(n, 4096)) or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"ok": False, "error": "형식이 달라요"})
        act = path.rsplit("/", 1)[-1]
        if act == "logout":
            return self._json(200, {"ok": True}, self._parent_cookie("", 0))
        who, pin = body.get("who"), body.get("pin")
        if who not in PARENTS:
            return self._json(400, {"ok": False, "error": "누구인지 모르겠어요"})
        if not pin_ok(pin):
            return self._json(400, {"ok": False, "error": "숫자 4~6자리로 넣어 주세요"})
        with LOCK:
            data = load_parents()
            if act == "setup":                        # 처음 한 번: 아직 안 정한 사람만
                if who in data:
                    return self._json(409, {"ok": False, "error": "이미 비밀번호가 있어요"})
                data.setdefault("secret", secrets.token_hex(32))
                salt = secrets.token_hex(16)
                data[who] = {"salt": salt, "hash": hash_pw(pin, salt)}
                save_parents(data)
                return self._json(200, {"ok": True, "me": who, "left_sec": PARENT_SEC},
                                  self._parent_cookie(parent_token(data, who), PARENT_SEC))
            if act != "login":
                return self._json(404, {"ok": False, "error": "없는 기능"})
            locked = parent_locked(who)
            if locked:
                return self._json(423, {"ok": False, "locked_sec": locked, "error": "잠겨 있어요"})
            if who not in data:
                return self._json(409, {"ok": False, "need_setup": True, "error": "먼저 비밀번호를 정해 주세요"})
            if hmac.compare_digest(hash_pw(pin, data[who]["salt"]), data[who]["hash"]):
                _pfails.pop(who, None)
                return self._json(200, {"ok": True, "me": who, "left_sec": PARENT_SEC},
                                  self._parent_cookie(parent_token(data, who), PARENT_SEC))
            cnt = _pfails.get(who, (0, 0))[0] + 1
            if cnt >= PARENT_MAX_FAILS:
                _pfails[who] = (0, time.time() + PARENT_LOCK_SEC)
                return self._json(423, {"ok": False, "locked_sec": PARENT_LOCK_SEC, "error": "5번 틀려서 10분 동안 잠겼어요"})
            _pfails[who] = (cnt, 0)
        time.sleep(0.5)
        self._json(403, {"ok": False, "tries_left": PARENT_MAX_FAILS - cnt, "error": "비밀번호가 달라요"})

    def _need_login(self):
        """로그인 안 된 요청: 화면 이동이면 로그인 화면으로, 데이터 요청이면 401"""
        if self.command == "GET" and (self.headers.get("Sec-Fetch-Mode") == "navigate"
                                      or "text/html" in (self.headers.get("Accept") or "")):
            return self._redirect("/login?next=" + urllib.parse.quote(self.path, safe=""))
        self._json(401, {"ok": False, "error": "로그인이 필요해요"})

    def _redirect(self, to, cookie=None):
        self.send_response(302)
        self.send_header("Location", to)
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _cookie(self, value, max_age):
        secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
        return f"{COOKIE}={value}; Max-Age={max_age}; Path=/; HttpOnly; SameSite=Lax{secure}"

    def _login_page(self, nxt, err=""):
        body = (LOGIN_PAGE.replace("{next}", html.escape(safe_next(nxt)))
                .replace("{err}", f'<p class="err">{html.escape(err)}</p>' if err else "")).encode("utf-8")
        self.send_response(401 if err else 200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _do_login(self):
        auth = load_auth()
        n = int(self.headers.get("Content-Length") or 0)
        form = urllib.parse.parse_qs(self.rfile.read(min(n, 4096)).decode("utf-8", "replace"))
        nxt = safe_next((form.get("next") or ["/dashboard/"])[0])
        if not auth:
            return self._redirect(nxt)
        ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[-1].strip()
        cnt, since = _fails.get(ip, (0, time.time()))
        if time.time() - since > 900:
            cnt, since = 0, time.time()
        if cnt >= 10:
            return self._login_page(nxt, "너무 많이 틀렸어요. 15분 뒤에 다시 해 주세요.")
        pw = (form.get("pw") or [""])[0]
        if hmac.compare_digest(hash_pw(pw, auth["salt"]), auth["hash"]):
            _fails.pop(ip, None)
            return self._redirect(nxt, self._cookie(make_token(auth), REMEMBER_SEC))
        _fails[ip] = (cnt + 1, since)
        time.sleep(1)
        self._login_page(nxt, "비밀번호가 달라요.")

    def _setup_page(self, key, err="", code=200):
        if not setup_key_ok(key):
            return self.send_error(404)
        body = (SETUP_PAGE.replace("{next}", html.escape(key))
                .replace("{err}", f'<p class="err">{html.escape(err)}</p>' if err else "")).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _do_setup(self):
        n = int(self.headers.get("Content-Length") or 0)
        form = urllib.parse.parse_qs(self.rfile.read(min(n, 4096)).decode("utf-8", "replace"))
        key = (form.get("key") or [""])[0]
        pw, pw2 = (form.get("pw") or [""])[0], (form.get("pw2") or [""])[0]
        if not setup_key_ok(key):
            return self.send_error(404)
        if len(pw) < 4:
            return self._setup_page(key, "4글자 이상으로 정해 주세요.", 400)
        if pw != pw2:
            return self._setup_page(key, "두 번 넣은 비밀번호가 달라요.", 400)
        with LOCK:
            auth = save_password(pw)
        self._redirect("/dashboard/", self._cookie(make_token(auth), REMEMBER_SEC))   # 정한 기기는 바로 로그인

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/login":
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            nxt = safe_next((q.get("next") or ["/dashboard/"])[0])
            return self._redirect(nxt) if self._authed() else self._login_page(nxt)
        if path == "/logout":
            return self._redirect("/login", self._cookie("", 0))
        if path == "/setup":
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            return self._setup_page((q.get("key") or [""])[0])
        if not self._authed():
            return self._need_login()
        if path == "/":
            return self._redirect("/dashboard/")
        if path == "/calendar.ics":
            body, err = fetch_calendar()
            if body is None:
                self.send_response(404)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(err.encode("utf-8"))
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/calendar; charset=utf-8")
            if err:
                self.send_header("X-Calendar-Stale", "1")   # 예전 것을 보여 주는 중
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/indices":
            if "demo=1" in self.path:                # 예시 화면: 샘플 가격 + index_ath.py 의 ATH로 계산
                try:
                    ath = _index_module().ATH
                except Exception as e:
                    return self._json(200, {"ok": False, "error": str(e)[:200]})
                sample = {"KOSPI": (5342.73, 0.83, 44.10), "KOSDAQ": (696.53, -0.42, -2.95), "S&P": (7589.32, 1.12, 84.20), "NASDAQ": (25323.29, -0.65, -165.40)}
                return self._json(200, {"ok": True, "demo": True, "stale": False,
                                        "as_of_kst": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                                        "indices": {k: {"price": v[0], "ath": ath[k], "decline_pct": round((v[0] - ath[k]) / ath[k] * 100, 2),
                                                        "source": "예시", "new_ath": v[0] > ath[k], "today_pct": v[1], "today_diff": v[2]} for k, v in sample.items()}})
            data, err = fetch_indices()
            if data is None:
                self._json(200, {"ok": False, "error": err or "지수를 받지 못함"})
            else:
                self._json(200, {"ok": True, "as_of_kst": data["as_of_kst"], "stale": bool(err),
                                 "indices": data["indices"]})
            return
        if path == "/api/parent":                   # 엄마·아빠 메뉴: 정해 뒀는지·잠겼는지·지금 들어와 있는 사람
            return self._json(200, self._parent_state())
        if path == "/api/photos":                   # 13. 사진 액자 — 위키 폴더 안 사진액자/ (GitHub엔 안 올림, .gitignore)
            try:
                names = sorted(f for f in os.listdir(os.path.join(ROOT, "사진액자")) if re.search(r"\.(jpe?g|png|webp|gif)$", f, re.I))
            except FileNotFoundError:
                names = []
            return self._json(200, {"ok": True, "photos": names[-300:]})
        if path == "/api/meetings":                 # 11. 가족회의 날짜 목록(최근이 위)
            items = meeting_summaries()
            return self._json(200, {"ok": True, "dates": [i["date"] for i in items], "items": items})
        if path == "/api/trades":                   # 10-4. 기다리는 교환 + 최근 것
            ts = load_trades()
            return self._json(200, {"ok": True, "trades": [t for t in ts if t["status"] in ("제안", "좋아요")] + [t for t in ts if t["status"] not in ("제안", "좋아요")][-6:]})
        if path == "/api/settings":                 # 소리·저녁 음악 설정 (모든 기기 공통)
            return self._json(200, {"ok": True, "settings": load_settings()})
        if path == "/api/yt-search":                # 🎵 듣고 싶은 노래 찾기 (유튜브 검색 앞쪽 몇 개)
            q = (urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("q") or [""])[0]
            try:
                return self._json(200, {"ok": True, "items": yt_search(q)})
            except Exception as e:
                return self._json(502, {"ok": False, "error": "노래를 찾지 못했어요 (" + str(e)[:80] + ")"})
        if path == "/api/claude-log":               # Claude 대화 자동 정리 결과 (팝업용)
            return self._json(*read_claude_log())
        if path == "/holidays.json":
            days, err = fetch_holidays()
            if days is None:
                self._json(503, {"ok": False, "error": err})
            else:
                self._json(200, {"ok": True, "stale": bool(err), "days": days})
            return
        if self._blocked():
            self.send_error(403)
            return
        super().do_GET()

    def _usage_totals_post(self):
        """PC UsageSender가 보낸 토큰 합계(오늘/최근 7일, 숫자만)를 받아
        아빠/토큰-합계.json 에 저장한다. usage_fetch가 3분마다 읽어
        아빠/토큰-사용량.json 의 local 로 합친다.
        인증은 ~/usage-tokens/receiver-secret 값과 X-Usage-Secret 헤더 대조
        (브라우저 로그인 불필요). 토큰·비밀번호는 받지 않는다."""
        secret = ""
        try:
            with open(os.path.join(os.path.expanduser("~"), "usage-tokens", "receiver-secret"), encoding="utf-8") as f:
                secret = f.read().strip()
        except OSError:
            return self._json(503, {"ok": False, "error": "서버에 수신 비밀값이 없어요"})
        got = self.headers.get("X-Usage-Secret") or ""
        if not secret or not hmac.compare_digest(secret, got):
            return self._json(403, {"ok": False, "error": "비밀값이 달라요"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 16384:
                raise ValueError("너무 큼")
            data = json.loads(self.rfile.read(n) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"ok": False, "error": "형식이 달라요"})
        totals = {}
        for svc in ("claude", "codex"):
            part = data.get(svc)
            if not isinstance(part, dict):
                return self._json(400, {"ok": False, "error": "claude·codex 합계가 필요해요"})
            row = {}
            for key in ("todayTokens", "weekTokens", "todayCount", "weekCount"):
                v = part.get(key)
                if not isinstance(v, int) or isinstance(v, bool) or v < 0 or v > 10**12:
                    return self._json(400, {"ok": False, "error": f"{svc}.{key} 숫자가 이상해요"})
                row[key] = v
            totals[svc] = row
        sidecar = {"version": 1,
                   "receivedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
                   "date": data.get("date") if isinstance(data.get("date"), str) else None,
                   "claude": totals["claude"], "codex": totals["codex"]}
        # Claude 사용량 % — PC가 자기 로그인으로 조회한 숫자(2026-11-14). 서버는 Claude 토큰을 갱신하지 않는다
        # (갱신 열쇠가 1회용이라 PC 로그인이 풀릴 수 있음). 실패한 회차엔 직전 성공값을 남기고 오류만 적는다.
        cu = data.get("claudeUsage")
        prev = {}
        try:
            with open(USAGE_TOTALS_FILE, encoding="utf-8") as f:
                prev = json.load(f)
        except (OSError, ValueError):
            pass
        if isinstance(cu, dict) and isinstance(cu.get("usage"), dict) and len(json.dumps(cu)) < 12000:
            sidecar["claudeUsage"] = {"usage": cu["usage"],
                                      "fetchedAt": str(cu.get("fetchedAt") or "")[:40],
                                      "plan": str(cu.get("plan") or "")[:20] or None}
        else:
            if isinstance(prev.get("claudeUsage"), dict):
                sidecar["claudeUsage"] = prev["claudeUsage"]
            if isinstance(cu, dict) and cu.get("error"):
                sidecar["claudeUsageError"] = str(cu["error"])[:120]
        try:
            with LOCK:
                os.makedirs(os.path.dirname(USAGE_TOTALS_FILE), exist_ok=True)
                tmp = USAGE_TOTALS_FILE + f".tmp-{os.getpid()}"
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write(json.dumps(sidecar, ensure_ascii=False) + "\n")
                os.rename(tmp, USAGE_TOTALS_FILE)
        except OSError as e:
            return self._json(500, {"ok": False, "error": f"저장에 실패했어요 ({e})"})
        dad_tick_safe()                       # 받은 토큰을 아빠 포켓몬 경험치로
        return self._json(200, {"ok": True})

    def do_POST(self):
        """화면에서 체크·추가: /api/routine {kid, routine, done} · /api/todo-done {text, who} · /api/shop-check {text, who, done} · /api/trip-check {group, text, done}
        · /api/todo-add {kind: 할 일|장보기, text, who, due} · /api/trip-add {group, text, title, start}"""
        path = self.path.split("?")[0]
        if path == "/login":
            return self._do_login()
        if path == "/setup":
            return self._do_setup()
        if path == "/api/usage-totals":      # PC UsageSender — 비밀값 헤더로만 인증 (브라우저 로그인 불필요)
            return self._usage_totals_post()
        if not self._authed():
            return self._need_login()
        if path.startswith("/api/parent/"):          # /api/parent/setup · login · logout
            return self._parent_post(path)
        if path == "/api/settings":                   # 설정 바꾸기는 엄마·아빠 메뉴에 들어와 있는 사람만
            if not parent_from_token(self._jar().get(PARENT_COOKIE, ""))[0]:
                return self._json(403, {"ok": False, "need_parent": True, "error": "엄마·아빠 메뉴에 다시 들어가 주세요"})
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if n > 16384:
                    raise ValueError("너무 큼")
                s = clean_settings(json.loads(self.rfile.read(n) or b"{}"))
                with LOCK:
                    save_settings(s)
                return self._json(200, {"ok": True, "settings": s})
            except (ValueError, TypeError, json.JSONDecodeError) as e:
                return self._json(400, {"ok": False, "error": str(e)})
        giver = parent_from_token(self._jar().get(PARENT_COOKIE, ""))[0] if path in ("/api/growth", "/api/quiz", "/api/trade", "/api/meeting", "/api/ideas") else None   # 키·'들었어요'·교환 승인은 엄마·아빠만
        if path == "/api/cheer":    # 응원 한마디는 엄마·아빠 메뉴에 들어와 있는 사람만
            giver = parent_from_token(self._jar().get(PARENT_COOKIE, ""))[0]
            if not giver:
                return self._json(403, {"ok": False, "need_parent": True, "error": "엄마·아빠 메뉴에 다시 들어가 주세요"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > (16384 if path == "/api/visit" else 4096):    # 찾아오는 몬스터는 후보 목록을 함께 보낸다
                raise ValueError("너무 큼")
            data = json.loads(self.rfile.read(n) or b"{}")
            extra = {}
            with LOCK:
                if path == "/api/routine":
                    kid, routine, done = clean(data.get("kid")), clean(data.get("routine")), bool(data.get("done"))
                    changed = set_routine(kid, routine, done)
                    bonus = apply_day_bonus(kid) if changed else 0      # 다 했으면 🎁 +2, 취소로 깨지면 -2
                    team = apply_team_bonus() if changed else {}        # 모두 다 했으면 각자 🤝 +1, 깨지면 모두 -1
                    extra["bonus"], extra["team"] = bonus, team.get(kid, 0)
                    extra["team_all"] = team                            # 형제들 것도 바뀐다
                    coupon = apply_week_reward(kid) if changed else 0   # 그 주 마지막 등교일: 🏪 쿠폰 +1 / 깨지면 -1
                    extra["coupon"] = coupon
                    if coupon:
                        git_save(COUPON, f"docs: 쿠폰 — {kid} 주간 보상 {coupon:+d} (대시보드)")
                    if changed and sync_tokens():                        # 14-4. 루틴 토큰 적립은 없앴다(항상 False)
                        git_save(TOKEN, "docs: 토큰 — 루틴 토큰 적립 (대시보드)")
                    msg = f"docs: 포켓몬 기록 — {kid} {routine} {'완료' if done else '취소'}"
                    msg += (f" · 하루 완료 보너스 {bonus:+d}" if bonus else "")
                    msg += (" · 형제 보너스 " + ", ".join(f"{k} {d:+d}" for k, d in team.items()) if team else "") + " (대시보드)"
                    target = KID_LOG
                elif path == "/api/sticker-pending":    # {kid} — 14-7. 아직 안 본 예전 칭찬 스티커들 (읽기만, 위키 안 바꿈)
                    kid = clean(data.get("kid"))
                    extra["stickers"] = sticker_pending(kid)
                    changed = False
                elif path == "/api/sticker-shown":      # {kid, ids:[...]} — 14-7. 본 스티커 표시 (sticker-shown.json만, 위키 안 바꿈)
                    kid = clean(data.get("kid"))
                    sticker_mark_shown(kid, data.get("ids") or [])
                    changed = False
                elif path == "/api/quiz-heard-pending":  # {kid} — 9-1. 아직 안 본 '들었어요' 영어 스티커들 (읽기만, 위키 안 바꿈)
                    kid = clean(data.get("kid"))
                    extra["quizzes"] = quiz_heard_pending(kid)
                    changed = False
                elif path == "/api/quiz-heard-shown":    # {kid, ids:[...]} — 9-1. 본 '들었어요' 영어 스티커 표시 (quiz-heard-pending.json만, 위키 안 바꿈)
                    kid = clean(data.get("kid"))
                    quiz_heard_mark_shown(kid, data.get("ids") or [])
                    changed = False
                elif path == "/api/meeting":             # {date, section, text, del?} · {act:'send', text, who} — 11. 가족회의록
                    if data.get("act") == "send":            # 할 일 → 장보기·할 일.md
                        text_, who = clean(data.get("text")), clean(data.get("who")) or "가족"
                        add_todo("할 일", text_, who, None)
                        changed, target, msg = True, TODO, f"docs: 할 일 추가 — {text_} ({who}, 가족회의)"
                    else:
                        day, sec, add = clean(data.get("date")), clean(data.get("section")), not data.get("del")
                        if not add and not giver:
                            self._json(403, {"ok": False, "need_parent": True, "error": "지우기는 엄마·아빠 메뉴에 들어간 뒤에 할 수 있어요"})
                            return
                        changed = meeting_edit(day, sec, data.get("text"), add)
                        target, msg = meeting_path(day), f"docs: 가족회의 {day} — {sec} {'추가' if add else '지움'} (대시보드)"
                elif path == "/api/ideas":               # {act: add|del|pick|opinion|opdel|done, text, who} — 11-2. 가족회의 아이디어
                    act = clean(data.get("act"))
                    try:
                        changed = ideas_act(act, data, giver)
                    except PermissionError as e:
                        self._json(403, {"ok": False, "need_parent": True, "error": str(e)})
                        return
                    names = {"add": "아이디어 추가", "del": "아이디어 지움", "pick": "이번 주 주제 고름", "opinion": "의견 추가", "opdel": "의견 지움", "done": "회의 끝"}
                    target, msg = IDEAS, f"docs: 가족회의 아이디어 — {names.get(act, act)} (대시보드)"
                elif path == "/api/trade":               # {act, ...} — 10-4 교환 (approve 일 때만 장부가 바뀐다)
                    act = clean(data.get("act"))
                    try:
                        t = trade_act(act, data, giver)
                    except PermissionError as e:
                        self._json(403, {"ok": False, "need_parent": True, "error": str(e)})
                        return
                    extra["trade"] = t
                    changed = act == "approve"
                    msg, target = f"docs: 동산 장부 — {t['a']} {t['a_name']} ↔ {t['b']} {t['b_name']} 교환 ({giver} 승인, 대시보드)", LEDGER
                elif path == "/api/visit":               # {kid, candidates:[{dex,name}]} — 오늘 찾아온 몬스터(하루 한 번 뽑기)
                    kid = clean(data.get("kid"))
                    res, changed = visit_today(kid, data.get("candidates") or [], bringer=clean(data.get("bringer")))
                    extra["visit"] = res
                    msg, target = f"docs: 동산 장부 — {kid}에게 친구 {res['name'] if res else ''} 옴 (대시보드)", LEDGER
                elif path == "/api/friend-pending":      # {kid} — 10-3b. 아직 안 본 데려온 친구들 (읽기만, 위키 안 바꿈)
                    extra["friends"] = friend_pending(clean(data.get("kid")))
                    changed = False
                elif path == "/api/friend-shown":        # {kid, ids:[...]} — 10-3b. 본 친구 표시 (friend-shown.json만, 위키 안 바꿈)
                    kid = clean(data.get("kid"))
                    friend_mark_shown(kid, data.get("ids") or [])
                    changed = False
                elif path == "/api/quiz":                # {kid, word, heard?} — 영어 퀴즈 스티커 (heard 는 엄마·아빠 '들었어요')
                    kid, word = clean(data.get("kid")), clean(data.get("word"))
                    if data.get("heard") and not giver:
                        self._json(403, {"ok": False, "need_parent": True, "error": "엄마·아빠 메뉴에서 '들었어요'를 눌러 주세요"})
                        return
                    extra["all"] = give_quiz(kid, word, heard=bool(data.get("heard")), giver=giver)
                    changed = True
                    msg, target = f"docs: 포켓몬 기록 — {kid} {QUIZ} {word}{' (' + giver + ' 들음)' if data.get('heard') else ''} (대시보드)", KID_LOG
                elif path == "/api/outfit":              # {kid, n} — 8-3. 캐릭터 코디 (👕 옷 갈아입기)
                    kid = clean(data.get("kid"))
                    changed = set_outfit(kid, data.get("n"))
                    msg, target = f"docs: 캐릭터 — {kid} 코디 {data.get('n')} (대시보드)", OUTFIT
                elif path == "/api/buy-outfit":          # {kid, n} — 14-7. 🛍️ 상점 남자 코디 사기 (남자 아이만, 5토큰)
                    kid = clean(data.get("kid"))
                    changed = buy_outfit(kid, data.get("n"))
                    msg, target = f"docs: 산 코디 — {kid} 코디 {data.get('n')} (대시보드)", BOUGHT_OUTFIT
                elif path == "/api/hair":                # {kid, h} — 14-3. 캐릭터 머리 (여자 아이만)
                    kid = clean(data.get("kid"))
                    changed = set_hair(kid, data.get("h"))
                    msg, target = f"docs: 머리 — {kid} 머리 {data.get('h')} (대시보드)", HAIR
                elif path == "/api/top":                 # {kid, n} — 14-5. 캐릭터 상의 (여자 아이만, 모두 무료)
                    kid = clean(data.get("kid"))
                    changed = set_top(kid, data.get("n"))
                    msg, target = f"docs: 상의 — {kid} 상의 {data.get('n')} (대시보드)", TOP
                elif path == "/api/bottom":              # {kid, n} — 14-5. 캐릭터 하의 (여자 아이만, 모두 무료)
                    kid = clean(data.get("kid"))
                    changed = set_bottom(kid, data.get("n"))
                    msg, target = f"docs: 하의 — {kid} 하의 {data.get('n')} (대시보드)", BOTTOM
                elif path == "/api/dress":               # {kid, n} — 14-6. 🛍️ 상점 원피스 입기 (여자 아이만, 0=안 입음, 1번 분홍 무료·2~4번은 산 것만)
                    kid = clean(data.get("kid"))
                    changed = set_dress(kid, data.get("n"))
                    msg, target = f"docs: 원피스 — {kid} 원피스 {data.get('n')} (대시보드)", DRESS
                elif path == "/api/buy-dress":           # {kid, n} — 14-6. 🛍️ 상점 원피스 사기 (여자 아이만, 2~4번 5토큰, 1번은 무료라 살 필요 없음)
                    kid = clean(data.get("kid"))
                    changed = buy_dress(kid, data.get("n"))
                    msg, target = f"docs: 원피스 — {kid} 원피스 {data.get('n')} 구매 (대시보드)", DRESS
                elif path == "/api/buy-shoes":          # {kid, n} — 14-6. 🛍️ 상점 신발 사기 (여자 아이만, 5토큰)
                    kid = clean(data.get("kid"))
                    changed = buy_shoes(kid, data.get("n"))
                    msg, target = f"docs: 신발 — {kid} 신발 {data.get('n')} 구매 (대시보드)", SHOES
                elif path == "/api/wear-shoes":         # {kid, n} — 14-6. 🛍️ 상점 신발 신기 (0=기본 신발)
                    kid = clean(data.get("kid"))
                    changed = set_shoes(kid, data.get("n"))
                    msg, target = f"docs: 신발 — {kid} 신발 {data.get('n')} 신음 (대시보드)", SHOES
                elif path == "/api/buy-padding":        # {kid} — 14-6. 🛍️ 상점 검정 패딩 사기 (6토큰·테스트 무료)
                    kid = clean(data.get("kid"))
                    changed = buy_padding(kid)
                    msg, target = f"docs: 패딩 — {kid} 검정 패딩 구매 (대시보드)", PADDING
                elif path == "/api/wear-padding":       # {kid, on} — 14-6. 🛍️ 상점 검정 패딩 입기/벗기 (1/0)
                    kid = clean(data.get("kid"))
                    changed = set_padding(kid, data.get("on"))
                    msg, target = f"docs: 패딩 — {kid} 검정 패딩 {'입음' if data.get('on') else '벗음'} (대시보드)", PADDING
                elif path == "/api/release":             # {kid, dex, name} — 14-8. 🕊️ 동산 포켓몬 풀어주기 (등급별 토큰, 도감에는 남음)
                    kid = clean(data.get("kid"))
                    dex, tier, tokens = release_pokemon(kid, data.get("dex"), data.get("name"))
                    changed = True
                    extra["release"] = {"dex": dex, "tier": tier, "tokens": tokens}
                    msg, target = f"docs: 동산 장부 — {kid} {data.get('name')} 풀어줌 ({tier}등급, +{tokens}토큰) (대시보드)", LEDGER
                elif path == "/api/growth":              # {kid, height?, weight?} — 키는 엄마·아빠 메뉴에서만
                    kid = clean(data.get("kid"))
                    height, weight = data.get("height"), data.get("weight")
                    if height not in (None, "") and not giver:
                        self._json(403, {"ok": False, "need_parent": True, "error": "키는 엄마·아빠 메뉴에서 적어요"})
                        return
                    changed = set_growth(kid, height, weight)
                    what = "키" if height not in (None, "") else "몸무게"
                    msg, target = f"docs: 성장 기록 — {kid} {what} (대시보드)", GROWTH
                elif path == "/api/cheer":               # {to, text, date, undo} — 엄마·아빠 응원 한마디
                    to, text_, day = clean(data.get("to")), clean(data.get("text")), clean(data.get("date")) or today()
                    add = not data.get("undo")
                    changed = set_cheer(giver, to, text_, day, add)
                    msg, target = f"docs: 응원 — {giver}→{to} {day} {'추가' if add else '지움'} (대시보드)", CHEER
                elif path == "/api/ladder":              # {kid, m, prize} — 동산 m마리 사다리 결과
                    kid, prize, m = clean(data.get("kid")), clean(data.get("prize")), int(data.get("m") or 0)
                    changed = take_ladder(kid, m, prize)
                    if not changed:
                        raise ValueError("이 사다리는 벌써 탔어요")
                    msg, target = f"docs: 쿠폰 — {kid} 동산 {m}마리 사다리 {prize} (대시보드)", COUPON
                elif path == "/api/coupon-use":          # {kid, got, name, why} — 아이가 쿠폰 '사용'
                    kid, name = clean(data.get("kid")), clean(data.get("name"))
                    changed = use_coupon(kid, clean(data.get("got")), name, clean(data.get("why")))
                    if not changed:
                        raise ValueError("이미 썼거나 없는 쿠폰이에요")
                    msg, target = f"docs: 쿠폰 사용 — {kid} {name} (대시보드)", COUPON
                elif path == "/api/todo-done":
                    text_, who = clean(data.get("text")), clean(data.get("who"))
                    changed = finish_todo(text_, who)
                    msg, target = f"docs: 할 일 완료 — {text_} ({who}, 대시보드)", TODO
                elif path == "/api/todo-add":
                    kind, text_, who = clean(data.get("kind")), clean(data.get("text")), clean(data.get("who"))
                    add_todo(kind, text_, who, data.get("due"))
                    changed, target = True, TODO
                    msg = f"docs: {kind} 추가 — {text_} ({who}, 대시보드)"
                elif path == "/api/trip-add":
                    text_ = clean(data.get("text"))
                    add_trip(data.get("group"), text_, clean(data.get("title")), clean(data.get("start")))
                    changed, target = True, TRIP
                    msg = f"docs: 여행 준비물 추가 — {text_} (대시보드)"
                elif path == "/api/egg-pick":            # 몇 번째 포켓몬 = 어떤 알 (고른 알·첫 알)
                    kid, dex, friend = clean(data.get("kid")), int(data.get("dex") or 0), bool(data.get("friend"))
                    fname = friend_in_garden(kid, dex) if friend else None
                    if friend and not fname:
                        raise ValueError("동산에 그 친구가 없어요")
                    changed = pick_egg(kid, int(data.get("n") or 0), dex, friend)
                    msg, target = f"docs: 포켓몬 알 — {kid} {data.get('n')}번째{' 친구 ' + fname + ' 진화시키기' if friend else ''} (대시보드)", KID_EGG
                    if changed and friend:               # 10-4. 친구는 동산에서 나와 키운다(다 키우면 최종 모습으로 돌아옴)
                        ledger_add(kid, "-", dex, fname, "진화하러 감")
                        git_save(LEDGER, f"docs: 동산 장부 — {kid} {fname} 진화하러 감 (대시보드)")
                elif path == "/api/supply-check":        # 준비물 챙김 체크·풀기
                    text_, who = clean(data.get("text")), clean(data.get("who"))
                    due, done = clean(data.get("due")), bool(data.get("done"))
                    changed = check_supply(text_, who, due, done)
                    msg, target = f"docs: 준비물 {'챙김' if done else '체크 풀기'} — {text_} ({who}, 대시보드)", TODO
                elif path == "/api/trip-check":        # 여행 준비물 체크박스 — 체크 ↔ 풀기
                    group, text_ = clean(data.get("group")), clean(data.get("text"))
                    done = bool(data.get("done"))
                    changed = check_trip(group, text_, done)
                    msg, target = f"docs: 여행 준비물 {'챙김' if done else '체크 풀기'} — {text_} ({group}, 대시보드)", TRIP
                elif path == "/api/shop-check":        # 장보기 체크박스 — 체크 ↔ 풀기 (체크한 건 다음 날부터 안 뜬다)
                    text_, who = clean(data.get("text")), clean(data.get("who"))
                    done = bool(data.get("done"))
                    changed = check_shopping(text_, who, done)
                    msg, target = f"docs: 장보기 {'샀음' if done else '체크 풀기'} — {text_} ({who}, 대시보드)", TODO
                elif path == "/api/bank-deposit":       # 🏦 은행 예금 {kid, amount, term} — 14-9. 토큰을 맡긴다
                    kid, amount, term = clean(data.get("kid")), int(data.get("amount") or 0), int(data.get("term") or 0)
                    changed = bank_deposit(kid, amount, term)
                    msg, target = f"docs: 은행 예금 — {kid} {amount}토큰 {term}일 (대시보드)", BANK
                elif path == "/api/bank-withdraw":      # 🏦 은행 만기 찾기 {kid, id} — 14-9. 원금+이자를 찾는다
                    kid, dep_id = clean(data.get("kid")), int(data.get("id") or 0)
                    total = bank_withdraw(kid, dep_id)
                    changed = True
                    extra["total"] = total
                    msg, target = f"docs: 은행 만기 — {kid} {total}토큰 찾음 (대시보드)", BANK
                else:
                    self.send_error(404)
                    return
            if changed:
                git_save(target, msg)
            self._json(200, {"ok": True, "changed": changed, **extra})
        except (ValueError, json.JSONDecodeError) as e:
            self._json(400, {"ok": False, "error": str(e)})
        except FileNotFoundError as e:
            self._json(404, {"ok": False, "error": f"파일 없음: {os.path.basename(e.filename or '')}"})

    def _json(self, code, obj, cookie=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        if cookie is not None:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        if not self._authed():
            self.send_error(401)
            return
        if self._blocked():
            self.send_error(403)
            return
        super().do_HEAD()

    def _blocked(self):
        """비밀 주소 파일·git 내부는 절대 내보내지 않는다 (%2E 같은 우회 주소도 풀어서 검사)"""
        real = os.path.realpath(self.translate_path(self.path))
        rel = os.path.relpath(real, ROOT).replace(os.sep, "/")
        return (os.path.basename(real) in ("calendar-url.txt", "auth.json", "setup-key.txt") or rel == ".git" or rel.startswith(".git/")
                or rel.startswith(".."))

    def log_message(self, fmt, *args):   # 조용히
        pass


def main():
    ap = argparse.ArgumentParser(description="가족 대시보드 서버")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--lan", action="store_true", help="집 와이파이의 다른 기기(태블릿)에서도 접속 허용")
    ap.add_argument("--no-git", action="store_true", help="GitHub 자동 동기화 끄기")
    ap.add_argument("--set-password", action="store_true", help="가족 비밀번호 정하기(모든 기기 로그아웃)")
    ap.add_argument("--reset-parent", metavar="이름", help="아빠·엄마 메뉴 비밀번호 지우기(잊어버렸을 때) — 다음에 들어갈 때 새로 정한다")
    a = ap.parse_args()
    if a.set_password:
        return set_password()
    if a.reset_parent:
        return reset_parent(a.reset_parent)
    GIT["on"] = not a.no_git and git_ready()
    if GIT["on"]:
        threading.Thread(target=git_loop, daemon=True).start()
    threading.Thread(target=bonus_loop, daemon=True).start()
    dad_tick_safe()                           # 켤 때 한 번 — 아빠/포켓몬-동료.json 을 장부 기준으로 다시 쓴다
    host = "0.0.0.0" if a.lan else "127.0.0.1"
    # 번호(포트)가 이미 쓰이거나 윈도우가 막아 둔 경우(WinError 10013/10048) → 다음 번호를 차례로 시도
    srv, port = None, a.port
    for port in range(a.port, a.port + 30):
        try:
            srv = http.server.ThreadingHTTPServer((host, port), Handler)
            break
        except OSError:
            continue
    if srv is None:
        print(f"{a.port}~{a.port + 29}번을 모두 쓸 수 없어요. 예: python dashboard/serve.py --port 18080")
        sys.exit(1)
    if port != a.port:
        print(f"  ({a.port}번은 다른 프로그램이 쓰고 있거나 막혀 있어서 {port}번으로 켰어요)")
    print(f"가족 대시보드: http://localhost:{port}/dashboard/")
    if a.lan:
        print("  ※ 집 와이파이의 다른 기기에서도 열립니다. 공용 와이파이에서는 --lan 을 쓰지 마세요.")
    print("  구글 캘린더:", "연결됨" if calendar_url() else "연결 안 됨 (dashboard/calendar-url.txt 에 iCal 비밀 주소를 넣으세요)")
    print("  로그인:", "켜짐 (비밀번호 한 번 → 이 기기 1년 기억)" if load_auth() else "꺼짐 (--set-password 로 켜기)")
    print("  GitHub 자동 동기화:", "켜짐 (화면에서 체크한 기록을 올리고, 2분마다 최신을 받아 옴)" if GIT["on"] else "꺼짐")
    print("  끄려면 Ctrl+C")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n종료")
        sys.exit(0)


if __name__ == "__main__":
    main()
