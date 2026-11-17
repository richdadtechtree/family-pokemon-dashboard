/* 우리가족 대시보드 서비스 워커 — 앱 설치(Install) 조건용.
   캐시는 일절 하지 않는다. 모든 요청을 그대로 네트워크로 넘겨서
   대시보드(위키 2분 갱신, no-store)가 늘 최신 내용을 보여준다. */
const SW_VERSION = "2026-11-16-1";
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
