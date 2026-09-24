# Works on My Machine

The source for my personal blog at [blog.rostyslav.eu](https://blog.rostyslav.eu/) — thoughts, notes, and things I am building around cloud architecture, infrastructure, automation, and the occasional side project.

Built with [Astro](https://astro.build/) on top of the [AstroPaper](https://github.com/satnaing/astro-paper) theme, deployed to Cloudflare Pages.

## Writing

Posts live in `src/content/posts/`. Each post is a Markdown or MDX file with frontmatter (`title`, `pubDatetime`, `description`, `tags`, etc.). Subdirectories become part of the post URL, and folders prefixed with `_` are ignored by the build (handy for co-locating assets, e.g. `_my-post-assets/`).

Site configuration lives in `astro-paper.config.ts`.

## Local development

Requires Node (see `.nvmrc`).

```bash
npm install
npm run dev        # local dev server at localhost:4321
```

| Command                | Action                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Start the local dev server                                  |
| `npm run build`        | Type-check, build the site, and generate the Pagefind index |
| `npm run preview`      | Preview the production build locally                        |
| `npm run lint`         | Run ESLint                                                  |
| `npm run format`       | Format the codebase with Prettier                           |
| `npm run format:check` | Check formatting without writing changes                    |
| `npm run deploy`       | Build and deploy to Cloudflare Pages                        |

## Credits

Theme: [AstroPaper](https://github.com/satnaing/astro-paper) by [Sat Naing](https://satnaing.dev).

## License

MIT — see [LICENSE](LICENSE).
