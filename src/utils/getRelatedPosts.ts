import type { CollectionEntry } from "astro:content";
import { getSortedPosts } from "./getSortedPosts";

export type RelatedPost = {
  id: string;
  title: string;
  filePath: string | undefined;
};

/**
 * Picks posts related to `current`, ranked by number of shared tags and then
 * by recency. Falls back to the most recent posts when there aren't enough
 * tag matches, so every post always links out to a few others.
 *
 * This exists mainly to strengthen internal linking: without it, posts are
 * only reachable through paginated lists and tag pages, which search engines
 * crawl last. A dense post-to-post link graph gives crawlers direct paths to
 * every article.
 */
export function getRelatedPosts(
  current: CollectionEntry<"posts">,
  allPosts: CollectionEntry<"posts">[],
  limit = 3
): RelatedPost[] {
  const sorted = getSortedPosts(allPosts).filter(p => p.id !== current.id);
  const currentTags = new Set(current.data.tags ?? []);

  const scored = sorted.map(post => {
    const shared = (post.data.tags ?? []).filter(tag =>
      currentTags.has(tag)
    ).length;
    return { post, shared };
  });

  // Posts sharing at least one tag, most shared tags first. `sorted` is already
  // newest-first, so ties break toward more recent posts.
  const byTags = scored
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .map(({ post }) => post);

  // Top up with recent posts (excluding ones already chosen) if needed.
  const chosen = byTags.slice(0, limit);
  if (chosen.length < limit) {
    const chosenIds = new Set(chosen.map(p => p.id));
    for (const post of sorted) {
      if (chosen.length >= limit) break;
      if (!chosenIds.has(post.id)) chosen.push(post);
    }
  }

  return chosen.slice(0, limit).map(post => ({
    id: post.id,
    title: post.data.title,
    filePath: post.filePath,
  }));
}
