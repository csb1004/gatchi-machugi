# 가치 마추기

machugi.io를 함께 풀기 위한 소규모 방 플레이 MVP입니다. Railway 단일 앱 서버가 로비, 방 화면, Socket.io 상태, 채팅, 점수를 맡고, 방장은 Chrome/Chromium 확장 프로그램으로 실제 machugi.io 탭을 방에 연결합니다.

## 개발

```powershell
npm exec --yes pnpm@9.15.0 -- install
npm exec --yes pnpm@9.15.0 -- build
npm exec --yes pnpm@9.15.0 -- test
npm exec --yes pnpm@9.15.0 -- typecheck
npm exec --yes pnpm@9.15.0 -- dev
```

## 환경 변수

`.env.example`을 `.env`로 복사한 뒤 값을 설정합니다.

- `DATABASE_URL`
- `PUBLIC_APP_URL`
- `VITE_GITHUB_EXTENSION_RELEASE_URL`

## 방장 확장 프로그램 설치

1. GitHub Releases에서 `gatchi-machugi-extension.zip`을 내려받습니다.
2. zip 파일을 원하는 폴더에 압축 해제합니다.
3. Chrome 또는 Chromium에서 `chrome://extensions`를 엽니다.
4. 개발자 모드를 켭니다.
5. `압축해제된 확장 프로그램 로드`를 누릅니다.
6. 압축을 푼 확장 프로그램 폴더를 선택합니다.
7. Railway 앱에서 닉네임을 입력합니다.
8. 오른쪽 `방 만들기` 패널에서 방을 만듭니다.
9. 생성 직후 보이는 방장 코드는 공유하지 않고 확장 프로그램 연결에만 사용합니다.
10. 퀴즈를 진행할 브라우저 탭에서 machugi.io를 엽니다.
11. 가치 마추기 확장 popup을 엽니다.
12. 서버 URL, 방 코드, 방장 코드를 입력하고 연결합니다.
13. 확장이 연결됨 상태가 되면 참가자들은 방 코드로 입장합니다.

## 확장 프로그램 릴리스

확장 프로그램 zip은 로컬에서 직접 만들 수 있습니다.

```powershell
npm exec --yes pnpm@9.15.0 -- --filter @gatchi/extension zip
```

GitHub 저장소에서는 `v*` 태그를 푸시하면 CI가 `apps/extension/release/gatchi-machugi-extension.zip`을 만들고 같은 태그의 GitHub Release에 업로드합니다.

```powershell
git tag v0.1.0
git push origin v0.1.0
```

## Railway

이 저장소 하나로 Railway 서비스를 만듭니다. 위 환경 변수를 설정하면 Railway가 `pnpm build` 후 `pnpm start`로 단일 Express/Socket.io 서버를 실행하고, 서버가 빌드된 웹 클라이언트도 함께 제공합니다.
