import { ExternalLink } from "lucide-react";

export function ExtensionSetup({ releaseUrl }: { releaseUrl: string }) {
  return (
    <section className="extension-setup" aria-label="Host extension setup">
      <div className="section-heading">
        <h2>Host extension setup</h2>
        <a href={releaseUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          GitHub Releases
        </a>
      </div>
      <ol>
        <li>Download the extension zip from GitHub Releases.</li>
        <li>Extract the zip to a folder on this computer.</li>
        <li>Open chrome://extensions and enable Developer Mode.</li>
        <li>Click Load unpacked and choose the extracted folder.</li>
        <li>Open the extension popup and enter the server URL, room code, and host token.</li>
      </ol>
    </section>
  );
}
