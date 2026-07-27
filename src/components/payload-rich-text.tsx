import type { Post } from "@/payload-types";
import {
  RichText,
  type JSXConvertersFunction,
} from "@payloadcms/richtext-lexical/react";

const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
  ...defaultConverters,
});

type PayloadRichTextProps = {
  data: Post["content"];
  className?: string;
};

export function PayloadRichText({ data, className }: PayloadRichTextProps) {
  return (
    <div className={className}>
      <RichText data={data} converters={converters} />
    </div>
  );
}
