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
        <li>새로 설치하거나 업데이트했다면 방장 화면에서 확장 프로그램에 저장 버튼을 다시 누릅니다.</li>
        <li>마추기아이오 탭에서 확장 프로그램 팝업을 열어 연결합니다.</li>
      </ol>
    </section>
  );
}
