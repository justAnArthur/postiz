import { mediaUsage } from './media.usage';

const post = (id: string, image: string | null) => ({
  id,
  group: `g-${id}`,
  publishDate: new Date('2026-11-05T09:00:00Z'),
  state: 'DRAFT' as const,
  image,
});

const file = (id: string, name: string, linked = false) => ({
  id,
  path: `https://postiz.test/uploads/2026/10/29/${name}`,
  linked,
});

describe('mediaUsage', () => {
  it('finds a file by its id or by its file name, once per post', () => {
    const id = 'ab55e1b6-2904-4e46-a058-893813924f20';
    const usage = mediaUsage(
      [file(id, 'e217.png'), file('c0ffee00-0000-4000-8000-000000000000', 'cover.jpg')],
      [
        post('p1', JSON.stringify([{ id, path: file(id, 'e217.png').path }])),
        post('p2', JSON.stringify([{ id: 'x', path: '/v.mp4', thumbnail: '/uploads/cover.jpg' }])),
      ],
      []
    );
    expect(usage.get(id)?.posts.map((p) => p.id)).toEqual(['p1']);
    expect(usage.get('c0ffee00-0000-4000-8000-000000000000')?.used).toBe(true);
  });

  it('counts sets, signatures and avatars as uses, and nothing else', () => {
    const usage = mediaUsage(
      [file('a', 'in-set.png'), file('b', 'avatar.png', true), file('c', 'left.png')],
      [post('p1', null)],
      ['<p><img src="https://postiz.test/uploads/in-set.png"></p>']
    );
    expect([...usage].map(([id, u]) => [id, u.used])).toEqual([
      ['a', true],
      ['b', true],
      ['c', false],
    ]);
  });
});
