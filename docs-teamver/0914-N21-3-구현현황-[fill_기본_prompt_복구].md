# 0914-N21-3 구현현황 — fill 기본 prompt 복구

코드 기본값 + `.env.staging.example` / `.env.production.example` / `.env.example` → `prompt`.

배포 서버의 gitignored `.env.staging` 이 아직 `deterministic` 이면 **재배포 전 반드시 `prompt`로 맞출 것**.
