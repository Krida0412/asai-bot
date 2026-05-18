"use client";

import type { JSX } from "react";
import {
  bundledLanguages,
  codeToHast,
  type BundledLanguage,
} from "shiki/bundle/web";
import { Fragment, useLayoutEffect, useState } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { safe } from "ts-safe";
import { cn } from "lib/utils";
import { useTheme } from "next-themes";
import { Button } from "ui/button";
import {
  CheckIcon,
  CopyIcon,
  CodeIcon,
  MonitorIcon,
  MaximizeIcon,
  XIcon,
} from "lucide-react";
import JsonView from "ui/json-view";
import { useCopy } from "@/hooks/use-copy";
import dynamic from "next/dynamic";

// Dynamically import MermaidDiagram component
const MermaidDiagram = dynamic(
  () => import("./mermaid-diagram").then((mod) => mod.MermaidDiagram),
  {
    loading: () => (
      <div className="text-sm flex bg-accent/30 flex-col rounded-2xl relative my-4 overflow-hidden border">
        <div className="w-full flex z-20 py-2 px-4 items-center">
          <span className="text-sm text-muted-foreground">mermaid</span>
        </div>
        <div className="relative overflow-x-auto px-6 pb-6">
          <div className="h-20 w-full flex items-center justify-center">
            <span className="text-muted-foreground">
              Loading Mermaid renderer...
            </span>
          </div>
        </div>
      </div>
    ),
    ssr: false,
  },
);

// Languages that support Preview mode
const PREVIEWABLE_LANGS = new Set([
  "html",
  "svg",
  "css",
  "javascript",
  "js",
  "jsx",
  "tsx",
  "typescript",
  "ts",
]);

function CodePreviewPane({ code, lang }: { code: string; lang: string }) {
  const isHtmlLike = ["html", "svg"].includes(lang);
  const isJsLike = ["javascript", "js", "jsx", "tsx", "typescript", "ts"].includes(lang);
  const isCss = lang === "css";

  if (isHtmlLike) {
    // Wrap SVG in basic HTML if needed
    const srcDoc =
      lang === "svg"
        ? `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:white;">${code}</body></html>`
        : code;

    return (
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-same-origin"
        className="w-full min-h-[300px] rounded bg-white"
        title="Preview"
        style={{ border: "none" }}
      />
    );
  }

  if (isCss) {
    return (
      <div className="p-4 text-sm text-muted-foreground flex flex-col gap-2">
        <div className="font-mono text-xs bg-secondary/50 rounded px-3 py-2 border">
          CSS Preview not available inline. Copy & apply to your stylesheet.
        </div>
        <style
          dangerouslySetInnerHTML={{ __html: code }}
        />
        <div className="border rounded p-4 text-center text-muted-foreground text-sm">
          ← CSS applied to this element (sample)
        </div>
      </div>
    );
  }

  if (isJsLike) {
    return (
      <div className="p-4 text-sm flex flex-col gap-2">
        <div className="text-xs text-muted-foreground mb-2">
          JavaScript/React Preview — running in sandbox:
        </div>
        <iframe
          srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 16px; font-family: system-ui, sans-serif; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    try {
      ${code}
      // If code defines a component called App, render it
      if (typeof App !== 'undefined') {
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
      } else if (typeof Component !== 'undefined') {
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));
      }
    } catch(e) {
      document.getElementById('root').innerHTML = '<div style="color:red;padding:16px;border:1px solid red;border-radius:8px;"><strong>Error:</strong> ' + e.message + '</div>';
    }
  </script>
</body>
</html>`}
          sandbox="allow-scripts"
          className="w-full min-h-[300px] rounded bg-white"
          title="JS Preview"
          style={{ border: "none" }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 text-sm text-muted-foreground">
      Preview not available for this language.
    </div>
  );
}

const PurePre = ({
  children,
  className,
  code,
  lang,
}: {
  children: any;
  className?: string;
  code: string;
  lang: string;
}) => {
  const { copied, copy } = useCopy();
  const [showPreview, setShowPreview] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const canPreview = PREVIEWABLE_LANGS.has(lang);

  return (
    <pre className={cn("relative", className)}>
      {/* Toolbar */}
      <div className="p-1.5 border-b mb-0 z-20 bg-secondary">
        <div className="w-full flex z-20 py-0.5 px-3 items-center gap-2">
          <span className="text-sm text-muted-foreground font-mono">{lang}</span>

          {canPreview && (
            <div className="ml-auto flex items-center gap-1 bg-muted rounded-md p-0.5">
              <Button
                size="icon"
                variant={!showPreview ? "secondary" : "ghost"}
                className="size-6 rounded"
                onClick={() => setShowPreview(false)}
                title="Code view"
              >
                <CodeIcon className="size-3!" />
              </Button>
              <Button
                size="icon"
                variant={showPreview ? "secondary" : "ghost"}
                className="size-6 rounded"
                onClick={() => setShowPreview(true)}
                title="Preview"
              >
                <MonitorIcon className="size-3!" />
              </Button>
            </div>
          )}

          {!canPreview && <div className="ml-auto" />}

          <Button
            size="icon"
            variant={copied ? "secondary" : "ghost"}
            className={cn("z-10 p-3! size-2! rounded-sm", canPreview && "ml-0")}
            onClick={() => { copy(code); }}
          >
            {copied ? <CheckIcon /> : <CopyIcon className="size-3!" />}
          </Button>
        </div>
      </div>

      {/* Code or Preview */}
      {showPreview ? (
        <div className="relative">
          <CodePreviewPane code={code} lang={lang} />
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-2 right-2 size-7 opacity-60 hover:opacity-100"
            onClick={() => setFullscreen(true)}
            title="Fullscreen preview"
          >
            <MaximizeIcon className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="relative overflow-x-auto px-6 pb-6 pt-4">{children}</div>
      )}

      {/* Fullscreen Modal */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
          onClick={() => setFullscreen(false)}
        >
          <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
            <span className="font-semibold text-sm">
              Preview — <span className="font-mono text-muted-foreground">{lang}</span>
            </span>
            <Button size="icon" variant="ghost" onClick={() => setFullscreen(false)}>
              <XIcon className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <CodePreviewPane code={code} lang={lang} />
          </div>
        </div>
      )}
    </pre>
  );
};

export async function Highlight(
  code: string,
  lang: BundledLanguage | (string & {}),
  theme: string,
) {
  const parsed: BundledLanguage = (
    bundledLanguages[lang] ? lang : "md"
  ) as BundledLanguage;

  if (lang === "json") {
    return (
      <PurePre code={code} lang={lang}>
        <JsonView data={code} initialExpandDepth={3} />
      </PurePre>
    );
  }

  if (lang === "mermaid") {
    return (
      <PurePre code={code} lang={lang}>
        <MermaidDiagram chart={code} />
      </PurePre>
    );
  }

  const out = await codeToHast(code, {
    lang: parsed,
    theme,
  });

  return toJsxRuntime(out, {
    Fragment,
    jsx,
    jsxs,
    components: {
      pre: (props) => <PurePre {...props} code={code} lang={lang} />,
    },
  }) as JSX.Element;
}

export function PreBlock({ children }: { children: any }) {
  const code = children.props.children;
  const { theme } = useTheme();
  const language = children.props.className?.split("-")?.[1] || "bash";
  const [loading, setLoading] = useState(true);
  const [component, setComponent] = useState<JSX.Element | null>(
    <PurePre className="animate-pulse" code={code} lang={language}>
      {children}
    </PurePre>,
  );

  useLayoutEffect(() => {
    safe()
      .map(() =>
        Highlight(
          code,
          language,
          theme == "dark" ? "dark-plus" : "github-light",
        ),
      )
      .ifOk(setComponent)
      .watch(() => setLoading(false));
  }, [theme, language, code]);

  return (
    <div
      className={cn(
        loading && "animate-pulse",
        "text-sm flex bg-secondary/40 shadow border flex-col rounded relative my-4 overflow-hidden",
      )}
    >
      {component}
    </div>
  );
}
