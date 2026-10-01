import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Blog posts are Markdown/MDX files in src/content/blog/.
// Substack essays and notes come from the synced snapshots (see src/lib/content.ts).
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      summary: z.string().optional(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      // Keeps reactions attached if you ever rename the file. Leave it out
      // and the file name is used.
      id: z.string().regex(/^[a-z0-9-]+$/).optional(),
      // `audio: true` generates a narration of this post (docs/AUDIO.md).
      audio: z.boolean().default(false),
    }),
});

export const collections = { blog };
