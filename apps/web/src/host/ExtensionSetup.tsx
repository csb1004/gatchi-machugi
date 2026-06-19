import { ExternalLink } from "lucide-react";

export function ExtensionSetup({ releaseUrl }: { releaseUrl: string }) {
  return (
    <section className="extension-setup" aria-label="방장 확장 프로그램 설정">
      <div className="section-heading">
        <h2>방장 확장 프로그램 설정</h2>
        <a href={releaseUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          GitHub Releases 열기
        </a>
      </div>
      <ol>
        <li>GitHub Releases에서 확장 프로그램 zip을 내려받습니다.</li>
        <li>zip 파일을 원하는 폴더에 압축 해제합니다.</li>
        <li>chrome://extensions를 열고 개발자 모드를 켭니다.</li>
        <li>압축해제된 확장 프로그램 로드를 누르고 압축을 푼 폴더를 선택합니다.</li>
        <li>확장 popup에 서버 URL, 방 코드, 방장 토큰을 입력합니다.</li>
      </ol>
    </section>
  );
}
