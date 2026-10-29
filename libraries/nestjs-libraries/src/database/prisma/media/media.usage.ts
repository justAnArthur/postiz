import type { State } from '@prisma/client';

export type MediaPost = {
  id: string;
  group: string;
  publishDate: Date;
  state: State;
};

type LibraryFile = { id: string; path: string; linked: boolean };
type PostWithMedia = MediaPost & { image: string | null };

// posts, sets and signatures keep media as JSON or HTML holding the media's id
// or file url; both are runs of these characters, so splitting on the rest
// leaves them whole
const refsIn = (text: string | null) => (text ?? '').split(/[^\w.%-]+/);

const fileName = (path: string) => path.split('/').pop() ?? path;

/** Which posts each file is on, and whether anything uses it at all. */
export function mediaUsage(
  files: LibraryFile[],
  posts: PostWithMedia[],
  otherContent: string[]
) {
  const postsByRef = new Map<string, MediaPost[]>();
  for (const { image, ...post } of posts) {
    for (const ref of new Set(refsIn(image))) {
      postsByRef.set(ref, [...(postsByRef.get(ref) ?? []), post]);
    }
  }
  const otherRefs = new Set(otherContent.flatMap(refsIn));

  return new Map(
    files.map((file) => {
      const refs = [file.id, fileName(file.path)];
      const onPosts = refs.flatMap((ref) => postsByRef.get(ref) ?? []);
      const uniquePosts = [...new Map(onPosts.map((p) => [p.id, p])).values()];
      const used =
        uniquePosts.length > 0 ||
        file.linked ||
        refs.some((ref) => otherRefs.has(ref));
      return [file.id, { posts: uniquePosts, used }];
    })
  );
}
