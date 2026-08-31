import getReadingTime from "reading-time";
import { toString } from "mdast-util-to-string";
import type { Root } from "mdast";
import type { VFile } from "vfile";

/**
 * Remark plugin that computes the estimated reading time of a post and
 * exposes it on the frontmatter as `minutesRead` (rounded up, minimum 1).
 *
 * The value surfaces via `remarkPluginFrontmatter` from `render(post)`.
 */
export function remarkReadingTime() {
  return (tree: Root, { data }: VFile) => {
    const textOnPage = toString(tree);
    const { minutes } = getReadingTime(textOnPage);
    const minutesRead = Math.max(1, Math.ceil(minutes));

    const astroData = (data.astro ??= {}) as {
      frontmatter?: Record<string, unknown>;
    };
    astroData.frontmatter ??= {};
    astroData.frontmatter.minutesRead = minutesRead;
  };
}

export default remarkReadingTime;
