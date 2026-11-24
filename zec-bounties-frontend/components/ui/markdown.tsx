import type React from "react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

export const processInlineMarkdown = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  let key = 0;

  // Bold **text**
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`bold-${key++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

export type ParsedMarkdownLine =
  | { kind: "h3"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h1"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "empty" }
  | { kind: "paragraph"; text: string };

export const parseMarkdownLine = (rawLine: string): ParsedMarkdownLine => {
  const line = rawLine.replace(/\r$/, "");
  const trimmed = line.trim();

  if (line.startsWith("### ")) {
    return { kind: "h3", text: line.slice(4) };
  }
  if (line.startsWith("## ")) {
    return { kind: "h2", text: line.slice(3) };
  }
  if (line.startsWith("# ")) {
    return { kind: "h1", text: line.slice(2) };
  }
  if (
    trimmed.startsWith("- ") ||
    trimmed.startsWith("+ ") ||
    trimmed.startsWith("* ")
  ) {
    return { kind: "bullet", text: trimmed.slice(2).trim() };
  }
  if (trimmed === "") {
    return { kind: "empty" };
  }
  return { kind: "paragraph", text: line };
};

// Markdown Renderer Component - Import this into BountyDetailModal
export const MarkdownRenderer = ({ content }: { content: string }) => {
  const renderMarkdown = (text: string) => {
    const lines = (text ?? "").split(/\r?\n/);
    return lines.map((rawLine, index) => {
      const parsed = parseMarkdownLine(rawLine);

      switch (parsed.kind) {
        case "h3":
          return (
            <h3 key={index} className="text-lg font-semibold mt-4 mb-2">
              {processInlineMarkdown(parsed.text)}
            </h3>
          );
        case "h2":
          return (
            <h2 key={index} className="text-xl font-semibold mt-4 mb-2">
              {processInlineMarkdown(parsed.text)}
            </h2>
          );
        case "h1":
          return (
            <h1 key={index} className="text-2xl font-bold mt-4 mb-2">
              {processInlineMarkdown(parsed.text)}
            </h1>
          );
        case "bullet":
          return (
            <div key={index} className="flex gap-2 ml-4 my-1">
              <span className="text-primary mt-1">•</span>
              <span>{processInlineMarkdown(parsed.text)}</span>
            </div>
          );
        case "empty":
          return <div key={index} className="h-2" />;
        case "paragraph":
          return (
            <p key={index} className="my-2">
              {processInlineMarkdown(parsed.text)}
            </p>
          );
      }
    });
  };

  return (
    <div className="text-sm text-muted-foreground leading-relaxed">
      {renderMarkdown(content)}
    </div>
  );
};

// Markdown Textarea Component - Import this into AdminBountyModal
export const MarkdownTextarea = ({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  id: string;
}) => {
  const safeValue = value ?? "";
  const lines = safeValue.split(/\r?\n/);
  const lineCount = lines.length;

  return (
    <div className="relative">
      <div className="absolute left-3 top-3 flex flex-col gap-[1.4rem] text-slate-400 text-sm select-none pointer-events-none font-mono z-10">
        {Array.from({ length: Math.max(lineCount, 5) }, (_, i) => (
          <span key={i} className="leading-6">
            +
          </span>
        ))}
      </div>
      <Textarea
        id={id}
        value={safeValue}
        onChange={onChange}
        placeholder={placeholder}
        className="min-h-[140px] pl-9 font-mono text-sm"
        required
      />
    </div>
  );
};

// Demo Component
export default function MarkdownComponentsDemo() {
  const [text, setText] = useState(`## Welcome to Markdown

This is a **bold statement** about markdown.

### Features
+ Easy formatting
+ Headers and lists
+ Bold text support

Try editing the textarea below!`);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Reusable Markdown Components</h1>
          <p className="text-muted-foreground">
            Import these components into your modals
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <h2 className="text-xl font-semibold">MarkdownTextarea</h2>
            <p className="text-sm text-muted-foreground">
              Use this in AdminBountyModal for editing
            </p>
            <MarkdownTextarea
              id="demo-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="+ Start typing with markdown..."
            />
            <div className="text-xs text-muted-foreground">
              <p>Supports: **bold**, # headers, + bullets</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6 space-y-4">
            <h2 className="text-xl font-semibold">MarkdownRenderer</h2>
            <p className="text-sm text-muted-foreground">
              Use this in BountyDetailModal for display
            </p>
            <div className="border rounded-lg p-4 bg-muted/30 min-h-[200px]">
              <MarkdownRenderer content={text} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h2 className="text-xl font-semibold">How to Use</h2>
          <div className="space-y-4 text-sm">
            <div className="border-l-4 border-primary pl-4">
              <h3 className="font-semibold mb-2">In AdminBountyModal.tsx</h3>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto">
                {`import { MarkdownTextarea } from "@/components/ui/markdown";

// Replace regular Textarea with:
<MarkdownTextarea
  id="admin-description"
  value={formData.description}
  onChange={(e) =>
    setFormData((prev) => ({
      ...prev,
      description: e.target.value,
    }))
  }
  placeholder="+ Describe the bounty requirements..."
/>`}
              </pre>
            </div>

            <div className="border-l-4 border-primary pl-4">
              <h3 className="font-semibold mb-2">In BountyDetailModal.tsx</h3>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto">
                {`import { MarkdownRenderer } from "@/components/ui/markdown";

// Replace description display with:
<MarkdownRenderer content={bounty.description} />`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
