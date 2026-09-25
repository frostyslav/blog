import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getSortedPosts } from "@/utils/getSortedPosts";
import { getPostUrl } from "@/utils/getPostPaths";
import config from "@/config";

/**
 * Generates /llms.txt following the https://llmstxt.org convention:
 * a Markdown overview of the site with a curated list of posts so that
 * LLMs can discover and cite the content. Regenerated on every build,
 * so it always reflects the current (non-draft, published) posts.
 */
export const GET: APIRoute = async ({ site }) => {
  const baseURL = (site ?? new URL(config.site.url)).href.replace(/\/$/, "");
  const abs = (path: string) => new URL(path, `${baseURL}/`).href;

  const posts = await getCollection("posts");
  const sortedPosts = getSortedPosts(posts);

  const postLines = sortedPosts.map(({ data, id, filePath }) => {
    const url = abs(getPostUrl(id, filePath, config.site.lang));
    return `- [${data.title}](${url}): ${data.description}`;
  });

  const body = `# ${config.site.title}

> ${config.site.description}

Written by ${config.site.author}, Cloud Solutions Architect and Engineering Lead. Topics include cloud architecture, infrastructure as code, CI/CD, networking, Kubernetes, and GenAI systems.

## Author

- [About / CV](${config.site.profile ?? abs("about/")})

## Posts

${postLines.join("\n")}

## Optional

- [RSS feed](${abs("rss.xml")})
- [Sitemap](${abs("sitemap-index.xml")})
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
