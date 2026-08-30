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

## BAND 주간 자동 집계

매주 한국 시간 금요일 00:10에 직전 금~목 게시글을 BAND Open API에서 집계해 Firebase Realtime Database에 반영합니다. BAND Developers에서 앱을 만들고 대상 밴드를 연결한 뒤, GitHub 저장소의 `Settings → Secrets and variables → Actions`에 다음 Repository secrets를 등록하세요.

- `BAND_ACCESS_TOKEN`: BAND Open API 액세스 토큰
- `BAND_KEY`: 집계할 밴드 키
- `FIREBASE_SERVICE_ACCOUNT`: Firebase 서비스 계정 JSON 전체
- `FIREBASE_DATABASE_URL`: Realtime Database URL

비밀값은 프론트엔드용 `VITE_` 환경변수나 저장소 파일에 넣지 않습니다.

설정 후 Actions의 `BAND weekly sync`에서 `Run workflow`를 한 번 실행해 최초 회원 매핑을 만듭니다. 성공 여부와 처리량은 Firebase의 `syncMeta/{weekKey}`에서 확인할 수 있습니다. 예약 실행은 직전 종료 주차만 갱신하지만, 같은 주차에 수동 재실행하면 BAND 원본 집계값으로 해당 주의 관리자 수동 수정값을 덮어씁니다.

로컬에서 실제 동기화를 실행하려면 위 네 환경변수가 모두 필요합니다. 비밀값 없이도 계산 테스트와 프론트엔드 빌드는 실행할 수 있습니다.

### BAND 액세스 토큰 최초 발급

BAND Developers 앱의 Redirect URI를 `http://localhost:8080/band/callback`로 정확히 등록합니다. localhost 링크는 아래 명령으로 콜백 서버를 먼저 실행한 동안에만 열립니다.

```bash
cd /home/nal/Projects/language-study
read -r "BAND_CLIENT_ID?BAND Client ID: "
read -rs "BAND_CLIENT_SECRET?BAND Client Secret: "
echo
export BAND_CLIENT_ID BAND_CLIENT_SECRET
pnpm authorize:band
unset BAND_CLIENT_ID BAND_CLIENT_SECRET
```

명령이 출력한 `https://auth.band.us/...` 주소를 브라우저에서 열어 로그인하고 대상 밴드 접근에 동의합니다. 성공하면 브라우저에는 완료 화면이, 터미널에는 `BAND_ACCESS_TOKEN`이 한 번 표시됩니다. 토큰을 GitHub Actions Secret에 등록하고 터미널 기록을 닫습니다. Client Secret과 토큰은 저장소 파일에 저장하지 않습니다.
