"use client";

import { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import dynamic from "next/dynamic";
import { useCallback } from "react";

interface EditorProps {
  initialContent?: PartialBlock[];
  onChange?: (content: PartialBlock[]) => void;
  editable?: boolean;
}

function EditorComponent({ initialContent, onChange, editable = true }: EditorProps) {
  const editor = useCreateBlockNote({
    initialContent: initialContent || [
      {
        type: "paragraph",
        content: [],
      },
    ],
  });

  const handleChange = useCallback(() => {
    if (onChange) {
      onChange(editor.document);
    }
  }, [editor, onChange]);

  return (
    <div className="min-h-[600px] rounded-xl border border-white/[0.06] bg-card shadow-sm shadow-black/20">
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="dark"
        className="py-8"
      />
    </div>
  );
}

// SSR-safe export using next/dynamic
export const Editor = EditorComponent;

// Dynamic wrapper for SSR compatibility
export const EditorWrapper = dynamic(
  () => Promise.resolve(EditorComponent),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[600px] rounded-xl border border-white/[0.06] bg-card animate-pulse" />
    ),
  }
);
