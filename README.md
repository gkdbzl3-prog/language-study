# 스터디 대시보드

## 로컬 실행
```bash
pnpm install
pnpm dev -- --host
```
브라우저에서 http://localhost:5173 또는 네트워크 IP로 접속

---

## Fly.io 배포

### 1. flyctl 설치 (처음 한 번만)
```bash
# macOS
brew install flyctl

# Windows (PowerShell)
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Linux
curl -L https://fly.io/install.sh | sh
```

### 2. 로그인 & 배포
```bash
fly auth login
fly launch      # 처음 배포 (fly.toml 자동 생성됨, 덮어쓰기 선택)
fly deploy      # 이후 업데이트 배포
```

### 3. 앱 이름 변경 (선택)
fly.toml의 `app = "study-dashboard"` 부분을 원하는 이름으로 변경

---

## 주의: 데이터는 localStorage에 저장됩니다
- 같은 브라우저/기기에서만 데이터 유지
- 여러 기기에서 공유하려면 추후 DB(예: Supabase) 연동 필요
