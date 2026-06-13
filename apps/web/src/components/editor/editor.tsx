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
    <div className="min-h-[500px] rounded-lg border bg-background">
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={handleChange}
        theme="dark"
        className="py-4"
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
      <div className="min-h-[500px] rounded-lg border bg-background animate-pulse" />
    ),
  }
);
