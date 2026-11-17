/* 가족 대시보드 — 7. 예시 데이터(?demo)
   (index.html 이 js/ 파일을 순서대로 불러온다. 모두 같은 전역을 쓰므로 순서를 바꾸지 말 것) */
"use strict";
/* ════════════════════════════════════════════════════════════════
   7. 예시 데이터 (?demo) — 위키와 똑같은 형식으로 만들어 같은 해석기를 거친다
   ════════════════════════════════════════════════════════════════ */
function demoFiles() {
  const t = startOfDay(new Date());
  const D = (n) => ymd(addDays(t, n));
  const yearsAgo = (y, plusDays) => ymd(addDays(new Date(t.getFullYear() - y, t.getMonth(), t.getDate()), plusDays));
  return {
    family: `---\ntitle: 가족 구성원\n---\n## 우리 가족\n| 이름 | 관계 | 생일 | 메모 |\n|---|---|---|---|\n| 아빠 | | ${yearsAgo(38, 20)} | |\n| 엄마 | | 확인 필요 | |\n\n## 아이\n| 이름 | 생일 | 메모 |\n|---|---|---|\n| 첫째 | ${yearsAgo(7, 38)} | |\n| 둘째 | ${yearsAgo(4, 15)} | |\n`,
    todo: `---\ntitle: 장보기·할 일\n---\n## 장보기\n- 우유 (엄마)\n- 사과 (첫째)\n- 식빵 (아빠)\n- 요거트 (엄마)\n\n## 할 일\n- 주말 나들이 준비 (아빠)\n- 사진 정리하기 (아빠)\n- 분리수거 ~${t.getMonth() + 1}/${addDays(t, 2).getDate()} (아빠)\n- 책 반납하기 (엄마)\n- 식물 물 주기 (엄마)\n- 운동복 세탁 (엄마)\n- 가족 사진 고르기 (가족)\n- 받아쓰기 연습 ~${t.getMonth() + 1}/${addDays(t, 1).getDate()} (첫째)\n\n## 준비물\n- [ ] 실내화 ~${t.getMonth() + 1}/${t.getDate()} (첫째)\n- [x] 리코더 ~${t.getMonth() + 1}/${t.getDate()} (첫째)\n- [ ] 우산 ~${t.getMonth() + 1}/${t.getDate()} (가족)\n- [ ] 체육복 ~${addDays(t, 1).getMonth() + 1}/${addDays(t, 1).getDate()} (둘째)\n`,
    schedule: `---\ntitle: 일정표\n---\n| 날짜 | 시간 | 무엇 | 누구 |\n|---|---|---|---|\n| ${D(0)} | 10:30 | 도서관 그림책 시간 | 첫째 |\n| ${D(0)} | 15:00 | 공원 산책 | 둘째 |\n| ${D(0)} | 19:00 | 가족 저녁 | 가족 |\n| ${D(2)} | 종일 | 가족 바닷가 여행 | 가족 |\n| ${D(3)} | 종일 | 가족 바닷가 여행 | 가족 |\n| ${D(4)} | 종일 | 가족 바닷가 여행 | 가족 |\n| ${D(5)} | 14:00 | 친구 생일 파티 | 첫째 |\n| ${D(9)} | 10:00 | 엄마 치과 | 엄마 |\n`,
    annual: `---\ntitle: 가족 연간 일정\n---\n| 월 | 날짜 | 무엇 | 메모 |\n|---|---|---|---|\n| ${addDays(t, 12).getMonth() + 1}월 | ${addDays(t, 12).getMonth() + 1}/${addDays(t, 12).getDate()} | 💍 결혼기념일 | |\n`,
    routine: `---\ntitle: 하루 일과\n---\n## 아빠 · 평일\n| 시간 | 무엇 | 한마디 | 장면 |\n|---|---|---|---|\n| 06:00 | 버스 타고 출근 중 | 6시 30분에 전철로 갈아타요 | 버스 |\n| 06:30 | 전철 타고 출근 중 | 7시 40분쯤 회사 도착 | 전철 |\n| 07:40 | 회사에서 일하는 중 | 11시 30분에 점심 먹어요 | 회사 |\n| 11:30 | 점심 먹는 중 | 먹고 나서 운동해요 | 식사 |\n| 12:10 | 점심 운동 중 | 1시부터 다시 일해요 | 운동 |\n| 13:00 | 회사에서 일하는 중 | 5시에 퇴근해요 | 회사 |\n| 17:00 | 전철 타고 퇴근 중 | 6시에 버스로 갈아타요 | 전철 |\n| 18:00 | 버스 타고 퇴근 중 | 곧 집에 도착해요 | 버스 |\n| 18:40 | 집에서 쉬는 중 | 같이 놀아요! | 집 |\n| 22:30 | 자는 중 | 내일 아침 6시에 일어나요 | 잠 |\n\n## 아빠 · 주말\n| 시간 | 무엇 | 한마디 | 장면 |\n|---|---|---|---|\n| 08:00 | 집에서 쉬는 중 | 오늘은 쉬는 날! | 집 |\n| 10:00 | 가족 산책 중 | 점심 전에 돌아와요 | 산책 |\n| 12:00 | 점심 먹는 중 | 맛있게 먹어요 | 식사 |\n| 13:00 | 집에서 노는 중 | 같이 놀아요! | 집 |\n| 22:30 | 자는 중 | 좋은 꿈 꿔요 | 잠 |\n\n## 엄마 · 매일\n| 시간 | 무엇 | 한마디 | 장면 |\n|---|---|---|---|\n| 07:00 | 아침 준비 중 | 아이들 깨울 시간 | 집 |\n| 09:30 | 산책하는 중 | 10시 30분에 돌아와요 | 산책 |\n| 10:30 | 집에서 쉬는 중 | 12시에 점심 먹어요 | 집 |\n| 12:00 | 점심 먹는 중 | 맛있게 먹어요 | 식사 |\n| 13:00 | 아이들 돌보는 중 | 4시에 산책 가요 | 집 |\n| 16:00 | 아이들과 산책 중 | 5시에 들어와요 | 산책 |\n| 17:00 | 저녁 준비 중 | 7시에 저녁 먹어요 | 집 |\n| 19:00 | 저녁 먹는 중 | 다 같이 먹어요 | 식사 |\n| 22:00 | 자는 중 | 좋은 꿈 꿔요 | 잠 |\n`,
    trip: `---\ntitle: 다음 여행\n여행: 바닷가 가족 여행\n출발: ${D(2)}\n---\n## 챙길 물품\n- [x] 잠옷\n- [x] 세면도구\n- [x] 비상약\n- [ ] 모자\n- [ ] 선크림\n- [ ] 수영복\n- [ ] 튜브\n- [ ] 모래놀이\n- [ ] 카메라\n- [ ] 충전기\n- [ ] 물티슈\n- [ ] 간식통\n## 살 것\n- [ ] 생수\n- [ ] 과일\n- [ ] 아이스팩\n`,
    // 예시 포켓몬 기록: 첫째 30개(동산 1마리 + 새 알 Lv.2), 둘째 5개(부화 직후 1단계 Lv.1)
    // 예시 응원: 오늘 아빠 → 첫째, 엄마 → 모두
    cheer: `---\ntitle: 응원\n---\n| 날짜 | 받는 아이 | 보낸 사람 | 한마디 |\n|---|---|---|---|\n| ${D(0)} | 첫째 | 아빠 | 오늘 받아쓰기 화이팅! |\n| ${D(0)} | 모두 | 엄마 | 저녁에 맛있는 거 먹자 |\n| ${D(-2)} | 둘째 | 아빠 | 지난 응원(안 보여요) |\n`,
    // 예시 동산 장부: 둘째에게 피카츄가 찾아옴(동산 1마리, 도감에도)
    ledger: `---\ntitle: 동산 장부\n---\n| 날짜 | 아이 | 들고남 | 도감번호 | 이름 | 까닭 |\n|---|---|---|---|---|---|\n| ${D(-1)} | 둘째 | + | 25 | 피카츄 | 찾아옴 |\n`,
    // 예시 영어 단어장 (진짜는 60개)
    words: `---\ntitle: 영어 단어\n---\n## 단어\n| 그림 | 단어 | 뜻 |\n|---|---|---|\n| 🐱 | cat | 고양이 |\n| 🐶 | dog | 개 |\n| 🍎 | apple | 사과 |\n| 🍌 | banana | 바나나 |\n| ☀️ | sun | 해 |\n| 🌙 | moon | 달 |\n| 🚗 | car | 자동차 |\n| 📖 | book | 책 |\n| ⚽ | ball | 공 |\n| 🐸 | frog | 개구리 |\n`,
    // 예시 성장 기록: 첫째 키 4번(나무 4칸)·몸무게, 둘째 몸무게만
    growth: `---\ntitle: 성장 기록\n---\n| 날짜 | 아이 | 키(cm) | 몸무게(kg) |\n|---|---|---|---|\n| ${D(-270)} | 첫째 | 118.2 | 21.5 |\n| ${D(-180)} | 첫째 | 120.1 | 22.3 |\n| ${D(-90)} | 첫째 | 121.9 | |\n| ${D(-10)} | 첫째 | 123.4 | 23.8 |\n| ${D(-5)} | 둘째 | | 16.2 |\n`,
    // 예시 쿠폰: 첫째 안 쓴 것 2장 + 쓴 것 1장
    coupon: `---\ntitle: 쿠폰\n---\n| 받은 날 | 아이 | 쿠폰 | 까닭 | 쓴 날 |\n|---|---|---|---|---|\n| ${D(-14)} | 첫째 | 🏪 다이소·편의점 자유 이용권 (5,000원까지) | 주간 보상 예시 | ${D(-12)} |\n| ${D(-7)} | 첫째 | 🏪 다이소·편의점 자유 이용권 (5,000원까지) | 주간 보상 예시 | |\n| ${D(-3)} | 첫째 | 💗 엄마와 데이트 | 동산 5마리 사다리 | |\n`,
    kidRoutine: `---\ntitle: 아이들 루틴\n---\n## 아침\n| 루틴 | 시간 |\n|---|---|\n| 양치+식사 완료 | 8시 10분까지 (평일만) |\n| 아침 양치 | 9시 전 (주말·빨간 날만) |\n| 학교 출발 | 8시 15분 (평일만) |\n\n## 저녁\n| 루틴 | 시간 |\n|---|---|\n| 독서 15분 | 저녁 |\n| 영어 복습 10분 | 저녁 |\n| 수학 15분 풀기 | 저녁 |\n| 스스로 책상 정리 | 매일 저녁 꼭! |\n`,
    pokeLog: `---\ntitle: 포켓몬 기록\n---\n| 날짜 | 아이 | 루틴 |\n|---|---|---|\n${Array.from({ length: 30 }, (_, i) => ["양치+식사 완료", "학교 출발", "독서 15분", "영어 복습 10분", "수학 15분 풀기", "책상 정리"][i % 6]).map((r, i) => `| ${D(-14 + Math.floor(i / 6))} | 첫째 | ${r} |`).join("\n")}\n${["양치+식사 완료", "학교 출발", "독서 15분", "영어 복습 10분", "수학 15분 풀기"].map((r) => `| ${D(-1)} | 둘째 | ${r} |`).join("\n")}\n`,
  };
}
function demoIcs() {
  const t = startOfDay(new Date());
  const f = (d, h, m) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`;
  const day = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const wd = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][t.getDay()];
  const sat = addDays(t, (6 - t.getDay() + 7) % 7);   // 이번 주 토요일(오늘이 토요일이면 오늘)
  const ev = (uid, title, a, b, extra = "") => `BEGIN:VEVENT\nUID:${uid}\nSUMMARY:${title}\n${a}\n${b}\n${extra}END:VEVENT\n`;
  return "BEGIN:VCALENDAR\nVERSION:2.0\n" +
    ev("d1", "엄마 필라테스", `DTSTART;TZID=Asia/Seoul:${f(addDays(t, -14), 10, 0)}`, `DTEND;TZID=Asia/Seoul:${f(addDays(t, -14), 11, 0)}`, `RRULE:FREQ=WEEKLY;BYDAY=${wd}\n`) +
    ev("d2", "가족 외식", `DTSTART;TZID=Asia/Seoul:${f(t, 18, 30)}`, `DTEND;TZID=Asia/Seoul:${f(t, 20, 0)}`) +
    ev("d3", "아빠 골프", `DTSTART;TZID=Asia/Seoul:${f(sat, 7, 0)}`, `DTEND;TZID=Asia/Seoul:${f(sat, 12, 0)}`) +
    ev("d4", "아빠 휴가", `DTSTART;VALUE=DATE:${day(addDays(t, 4))}`, `DTEND;VALUE=DATE:${day(addDays(t, 5))}`) +
    ev("d5", "첫째 태권도", `DTSTART;TZID=Asia/Seoul:${f(addDays(t, -1), 16, 0)}`, `DTEND;TZID=Asia/Seoul:${f(addDays(t, -1), 17, 0)}`, "RRULE:FREQ=DAILY;COUNT=10\n") +
    "END:VCALENDAR\n";
}
function demoWeather() {
  const now = new Date(); const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const time = [], temp = [], code = [], pop = [], isDay = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(base.getTime() + i * 3600000); const h = d.getHours();
    time.push(`${ymd(d)}T${pad(h)}:00`); temp.push(12 + 8 * Math.sin((h - 9) / 24 * Math.PI * 2) + 2);
    code.push(h > 15 && h < 19 ? 2 : 0); pop.push(h > 15 && h < 19 ? 5 : 0); isDay.push(h >= 7 && h < 18 ? 1 : 0);
  }
  const ci = now.getHours();
  return { wx: { current: { time: time[ci], temperature_2m: temp[ci], weather_code: 1, is_day: isDay[ci] },
    hourly: { time, temperature_2m: temp, weather_code: code, precipitation_probability: pop, is_day: isDay },
    daily: { temperature_2m_max: [21], temperature_2m_min: [9], precipitation_probability_max: [5] } },
    aq: { current: { pm10: 20, pm2_5: 9 } } };
}

