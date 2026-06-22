// 최소한의 Standalone 독립 앱 구동 조건을 충족하기 위한 서비스 워커 소스
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // 앱 내 모든 네트워크 통신을 정상 허용
});