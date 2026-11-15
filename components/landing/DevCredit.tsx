import { GitHubIcon } from "@/components/SocialIcons";

// Developer attribution links to the source repository.
export default function DevCredit({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={`dev-credit${compact ? " compact" : ""}`}
      href="https://github.com/oz819/telawah"
      target="_blank"
      rel="noopener noreferrer"
      dir="ltr"
      aria-label="Developed by Osama Zaid Saif Aldin — source on GitHub"
    >
      <span className="dev-by">DEVELOPED BY</span>
      <span className="dev-name">Osama Zaid Saif Aldin</span>
      <span className="dev-repo" aria-hidden="true"><GitHubIcon /></span>
    </a>
  );
}
