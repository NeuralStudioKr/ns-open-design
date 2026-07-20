import { useEffect, useState } from "react";
import { loadAuthenticatedHtmlSrcDoc } from "../../runtime/authenticatedHtmlSrcDoc";

/** Sandboxed live-artifact / HTML thumb — never bare auth-gated `src=`. */
export function AuthenticatedHtmlThumb({
  src,
  className,
  title = "",
}: {
  src: string;
  className?: string;
  title?: string;
}) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrcDoc(null);
    const abort = new AbortController();
    void loadAuthenticatedHtmlSrcDoc(src, { signal: abort.signal }).then((result) => {
      if (cancelled || !result.ok) return;
      setSrcDoc(result.srcDoc);
    });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [src]);

  if (!srcDoc) {
    return <span className={className} aria-hidden />;
  }

  return (
    <iframe
      className={className}
      srcDoc={srcDoc}
      title={title}
      loading="lazy"
      sandbox="allow-scripts"
      tabIndex={-1}
      aria-hidden
    />
  );
}
