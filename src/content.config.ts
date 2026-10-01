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
      // Pre-recorded narration, e.g. { url: /audio/my-post.mp3, duration: 312 }.
      // Without it, "Listen" uses the browser's built-in voice.
      audio: z.object({ url: z.string(), duration: z.number().optional() }).optional(),
    }),
});

export const collections = { blog };
