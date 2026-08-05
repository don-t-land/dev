# CI/CD 배포 계약

`main` 브랜치에 push되면 Vita의 Jenkins가 이 저장소를 `dontland`에 불변 릴리스 형태로 배포합니다.

## 대상

- Jenkins Job: `don-t-land-dev-main-deploy-dontland`
- Job 정의 백업: `ci/jenkins-job.xml` (Credential 값은 포함하지 않음)
- 원격 루트: `/home/ovily/appdata/dev`
- 현재 릴리스: `/home/ovily/appdata/dev/current`
- 서비스 포트: `3000`
- 준비 상태: `GET /healthz`

## 동작

1. Jenkins가 GitHub의 `main`을 HTTPS 자격증명으로 checkout합니다.
2. Vita에서 dontland로는 Jenkins Credentials에 저장된 ID/PW와 `SSH_ASKPASS`를 사용합니다.
3. 소스를 `releases/<build-number>`에 전송하고 해당 릴리스 안에서 의존성 설치·준비를 먼저 완료합니다.
4. 준비가 성공한 뒤에만 `current` 심볼릭 링크를 원자적으로 전환합니다.
5. `deploy/dontland.sh`가 사용자 홈의 검증된 Node.js LTS로 서비스를 재시작합니다.
6. user systemd의 linger가 활성화되어 있으면 `dontland-dev.service`로 운영하며, 불가능하면 PID 파일 기반 프로세스로 대체합니다.
7. `/healthz` 검증이 실패하면 이전 릴리스 링크와 프로세스로 롤백합니다.

실제 비밀번호와 GitHub 토큰은 저장소나 Job XML에 포함되지 않습니다.
