import React from "react";

// Renders a note with the few conventions people write by hand (Oleksandr,
// Aug 2026): line breaks persist, a blank line separates paragraphs, a line
// starting with "- " (or "* ") becomes a bullet, **bold** is bold. Everything
// is parsed into React nodes — user text is never injected as HTML.

function inline(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : p));
}

export default function NoteText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={blocks.length}>
        {para.map((l, i) => (
          <React.Fragment key={i}>
            {i > 0 && <br />}
            {inline(l)}
          </React.Fragment>
        ))}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length}>
        {list.map((l, i) => (
          <li key={i}>{inline(l)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className="note-rich">{blocks}</div>;
}
